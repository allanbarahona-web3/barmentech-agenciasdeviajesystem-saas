import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { JobDispatcherService } from '../../infrastructure/job-dispatcher';
import { PLATFORM_QUEUE_KEYS } from '../../infrastructure/queue';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  BILLING_DOCUMENT_ARTIFACT_RETRIEVAL_REQUESTED_EVENT_TYPE,
  BILLING_DOCUMENT_ARTIFACT_RETRIEVAL_REQUESTED_EVENT_VERSION,
} from './fiscal-terminal-artifact-fanout.constants';
import {
  FISCAL_ARTIFACT_RETRIEVAL_BATCH_SIZE,
  FISCAL_ARTIFACT_RETRIEVAL_JOB_NAME,
  fiscalArtifactRetrievalJobId,
} from './fiscal-artifact-retrieval.constants';
import { FiscalArtifactRetrievalPublisher } from './fiscal-artifact-retrieval.publisher';

describe('FiscalArtifactRetrievalPublisher', () => {
  afterEach(() => jest.useRealTimers());

  it('claims exact v1 work in a bounded SKIP LOCKED batch and dispatches the four-field job', async () => {
    const c = context([child()]); await c.publisher.publishAvailableEvents();
    const sql = rawSql(c.query);
    expect(c.query.mock.calls[0]).toEqual(expect.arrayContaining([
      BILLING_DOCUMENT_ARTIFACT_RETRIEVAL_REQUESTED_EVENT_TYPE,
      BILLING_DOCUMENT_ARTIFACT_RETRIEVAL_REQUESTED_EVENT_VERSION,
      FISCAL_ARTIFACT_RETRIEVAL_BATCH_SIZE,
    ]));
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain("\"status\"='PENDING'");
    expect(sql).toContain("\"status\"='PROCESSING'");
    expect(sql).toContain('"lockedAt"<');
    const request = c.dispatch.mock.calls[0][0];
    expect(request).toEqual(expect.objectContaining({
      queueKey: PLATFORM_QUEUE_KEYS.FISCAL_ARTIFACT_RETRIEVAL,
      jobName: FISCAL_ARTIFACT_RETRIEVAL_JOB_NAME,
      payload: { tenantId: 'tenant-a', outboxEventId: 'child-a', lockOwner: 'claim-owner-child-a', eventVersion: 1 },
      metadata: { tenantId: 'tenant-a' },
    }));
    expect(Object.keys(request.payload).sort()).toEqual(['eventVersion', 'lockOwner', 'outboxEventId', 'tenantId']);
    expect(request.options.jobId).toBe(fiscalArtifactRetrievalJobId('child-a', 1, request.payload.lockOwner));
    expect(c.updateMany).not.toHaveBeenCalled();
  });

  it('conditionally releases dispatch failure with bounded backoff', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-09T12:00:00.000Z'));
    const c = context([child({ attemptCount: 2, maximumAttempts: 5 })]); c.dispatch.mockRejectedValueOnce(new Error('unavailable'));
    await c.publisher.publishAvailableEvents();
    expect(c.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'child-a', tenantId: 'tenant-a', status: 'PROCESSING', lockedBy: 'claim-owner-child-a' }),
      data: expect.objectContaining({ status: 'PENDING', availableAt: new Date('2026-09-09T12:00:02.000Z'), lockedAt: null, lockedBy: null }),
    }));
  });

  it('marks dispatch exhaustion FAILED and never dispatches malformed claimed rows', async () => {
    let c = context([child({ attemptCount: 5, maximumAttempts: 5 })]); c.dispatch.mockRejectedValueOnce(new Error('unavailable'));
    await c.publisher.publishAvailableEvents();
    expect(c.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', lastError: 'FISCAL_ARTIFACT_RETRIEVAL_DISPATCH_FAILED' }) }));
    c = context([child({ tenantId: 'tenant-b' })]); await c.publisher.publishAvailableEvents();
    expect(c.dispatch).not.toHaveBeenCalled();
    expect(c.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-b' }), data: expect.objectContaining({ status: 'FAILED', lastError: 'FISCAL_ARTIFACT_RETRIEVAL_OUTBOX_INVALID' }) }));
  });

  it('uses fresh per-row owners for every claim cycle and propagates each returned owner exactly', async () => {
    const c = context([]);
    c.query.mockImplementationOnce(async (...args: unknown[]) => {
      const token = extractClaimToken(args);
      return [child({ id: 'child-a', lockOwner: `${token}-child-a` }), child({ id: 'child-b', lockOwner: `${token}-child-b` })];
    }).mockImplementationOnce(async (...args: unknown[]) => {
      const token = extractClaimToken(args);
      return [child({ id: 'child-a', lockOwner: `${token}-child-a` })];
    });

    await c.publisher.publishAvailableEvents();
    await c.publisher.publishAvailableEvents();

    const firstToken = extractClaimToken(c.query.mock.calls[0]);
    const secondToken = extractClaimToken(c.query.mock.calls[1]);
    expect(firstToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondToken).not.toBe(firstToken);
    expect(rawSql(c.query)).toContain("concat(?,'-',e.\"id\")");

    const [first, second, reclaimed] = c.dispatch.mock.calls.map(([request]) => request);
    expect(first.payload.lockOwner).toBe(`${firstToken}-child-a`);
    expect(second.payload.lockOwner).toBe(`${firstToken}-child-b`);
    expect(reclaimed.payload.lockOwner).toBe(`${secondToken}-child-a`);
    expect(new Set([first.payload.lockOwner, second.payload.lockOwner]).size).toBe(2);
    expect(reclaimed.payload.lockOwner).not.toBe(first.payload.lockOwner);
    expect(reclaimed.options.jobId).toBe(fiscalArtifactRetrievalJobId('child-a', 1, reclaimed.payload.lockOwner));
  });

  it('scopes release to the current returned owner, so a stale prior owner cannot win after reclaim', async () => {
    const c = context([child({ lockOwner: 'current-owner' })]);
    c.dispatch.mockRejectedValueOnce(new Error('unavailable'));
    await c.publisher.publishAvailableEvents();
    expect(c.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ lockedBy: 'current-owner' }) }));

    c.updateMany.mockResolvedValueOnce({ count: 0 });
    const stale = (c.publisher as unknown as { finish(event: ReturnType<typeof child>, data: Prisma.BillingOutboxEventUpdateManyMutationInput): Promise<{ count: number }> }).finish(
      child({ lockOwner: 'stale-owner' }), { status: 'FAILED', lastError: 'STALE' },
    );
    await expect(stale).resolves.toEqual({ count: 0 });
    expect(c.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ lockedBy: 'stale-owner' }) }));
  });

  it('contains polling rejection, prevents overlap, and shuts down cleanly', async () => {
    jest.useFakeTimers();
    const diagnostic = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    let rejectClaim!: (error: Error) => void;
    const pending = new Promise<never>((_resolve, reject) => { rejectClaim = reject; });
    const c = context([]); c.prisma.$transaction = jest.fn().mockReturnValue(pending);
    c.publisher.onModuleInit(); await jest.advanceTimersByTimeAsync(0);
    const secondCycle = (c.publisher as unknown as { cycle(): Promise<void> }).cycle();
    expect(c.prisma.$transaction).toHaveBeenCalledTimes(1);
    rejectClaim(new Error('database unavailable'));
    await secondCycle; await c.publisher.onModuleDestroy();
    expect(diagnostic).toHaveBeenCalledWith('Fiscal artifact retrieval polling cycle failed.');
    diagnostic.mockRestore();
  });
});

function context(events: ReturnType<typeof child>[]) {
  const query = jest.fn().mockResolvedValue(events);
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = { $transaction: jest.fn(async (work: (tx: { $queryRaw: jest.Mock }) => unknown) => work({ $queryRaw: query })), billingOutboxEvent: { updateMany } } as unknown as PrismaService & { $transaction: jest.Mock };
  const dispatch = jest.fn().mockResolvedValue({ id: 'job-a' });
  return { publisher: new FiscalArtifactRetrievalPublisher(prisma, { dispatch } as unknown as JobDispatcherService), prisma, query, updateMany, dispatch };
}
function child(overrides: Record<string, unknown> = {}) { return { id: 'child-a', tenantId: 'tenant-a', eventType: BILLING_DOCUMENT_ARTIFACT_RETRIEVAL_REQUESTED_EVENT_TYPE, eventVersion: 1, aggregateType: 'BillingDocument', aggregateId: 'document-a', causationId: 'parent-a', payload: { tenantId: 'tenant-a', billingDocumentId: 'document-a', artifactType: 'SIGNED_FISCAL_XML', artifactVersion: 1, eventVersion: 1 } as Prisma.JsonObject, attemptCount: 1, maximumAttempts: 5, lockOwner: 'claim-owner-child-a', ...overrides }; }
function rawSql(mock: jest.Mock): string { return (mock.mock.calls[0][0] as TemplateStringsArray).join('?'); }
function extractClaimToken(call: unknown[]): string { return call.find((value): value is string => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value))!; }
