import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ImmutableBillingArtifactStorageError, type ImmutableBillingArtifactStoragePort } from '../storage/immutable-billing-artifact-storage.port';
import { FISCAL_ARTIFACT_RETRIEVAL_ATTEMPTS_EXHAUSTED, FiscalArtifactRetrievalService } from './fiscal-artifact-retrieval.service';
import { FiscalArtifactRetrievalError, type FiscalArtifactRetrievalPort } from './providers/fiscal-artifact-retrieval.provider';

const KEY = '50624072600310167816600100001010000000866142351111';
const NUMBER = '00100001010000000866';
const NOW = new Date('2026-09-09T12:00:00.000Z');

describe('FiscalArtifactRetrievalService', () => {
  it('prepares, retrieves, validates, hashes, stores, then atomically completes an ACCEPTED signed XML child', async () => {
    const c = context(); let transactionOpen = false;
    c.prisma.$transaction.mockImplementation(async (work: (tx: typeof c.tx) => unknown) => { transactionOpen = true; try { return await work(c.tx); } finally { transactionOpen = false; } });
    c.retrieval.retrieveFiscalArtifact.mockImplementation(async () => { expect(transactionOpen).toBe(false); return retrieved(); });
    c.storage.storeImmutable.mockImplementation(async (value) => { expect(transactionOpen).toBe(false); expect(value.expectedSha256).toBe(hash(retrieved().bytes)); return storage(value.expectedSha256); });
    await c.service.processClaimedArtifact(claim());
    expect(c.retrieval.retrieveFiscalArtifact).toHaveBeenCalledWith({ providerDocumentId: 'provider-document', artifactType: 'SIGNED_FISCAL_XML', providerEnvironment: 'sandbox' });
    expect(c.storage.storeImmutable).toHaveBeenCalledTimes(1);
    expect(c.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(c.tx.billingOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED', lockedAt: null, lockedBy: null }) }));
  });

  it('completes an exact AVAILABLE artifact without provider or storage access', async () => {
    const c = context({ artifact: available() });
    await c.service.processClaimedArtifact(claim());
    expect(c.retrieval.retrieveFiscalArtifact).not.toHaveBeenCalled(); expect(c.storage.storeImmutable).not.toHaveBeenCalled();
    expect(c.tx.billingOutboxEvent.updateMany).toHaveBeenCalledTimes(1);
  });

  it('leaves PENDING work unchanged for retryable retrieval/storage failures', async () => {
    const c = context({ retrievalError: new FiscalArtifactRetrievalError('FISCAL_ARTIFACT_RETRIEVAL_PROVIDER_UNAVAILABLE', true) });
    await expect(c.service.processClaimedArtifact(claim())).rejects.toMatchObject({ retryable: true });
    expect(c.tx.billingOutboxEvent.updateMany).not.toHaveBeenCalled(); expect(c.tx.$executeRaw).not.toHaveBeenCalled();
    const storageFailure = context({ storageError: new ImmutableBillingArtifactStorageError('IMMUTABLE_BILLING_ARTIFACT_STORAGE_FAILURE') });
    await expect(storageFailure.service.processClaimedArtifact(claim())).rejects.toMatchObject({ retryable: true });
  });

  it('marks owned PENDING artifact and child FAILED for permanent validation/provider failure without external data persistence', async () => {
    const c = context({ retrievalError: new FiscalArtifactRetrievalError('FISCAL_ARTIFACT_RETRIEVAL_NOT_FOUND', false), failureArtifact: pending() });
    await expect(c.service.processClaimedArtifact(claim())).rejects.toMatchObject({ retryable: false });
    expect(c.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(c.tx.billingOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', lockedAt: null, lockedBy: null }) }));
  });

  it.each([
    ['payload', child({ payload: { tenantId: 'tenant-a', billingDocumentId: 'document-a', artifactType: 'TAX_AUTHORITY_RESPONSE_XML', artifactVersion: 1, eventVersion: 1 } })],
    ['aggregate', child({ aggregateId: 'other-document' })],
    ['causation', child({ causationId: 'other-parent' })],
    ['owner', child({ lockedBy: 'other-worker' })],
    ['lease', child({ lockedAt: new Date(Date.now() - 61_000) })],
  ])('does not publish AVAILABLE or PROCESSED after completion-time %s mutation', async (_, completionChild) => {
    const c = context({ completionChild });
    await expect(c.service.processClaimedArtifact(claim())).rejects.toMatchObject({ code: 'FISCAL_ARTIFACT_RETRIEVAL_CLAIM_INVALID' });
    expect(c.tx.$executeRaw).not.toHaveBeenCalled();
    expect(c.tx.billingOutboxEvent.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }));
  });

  it('uses exactly two application transactions on normal success', async () => {
    const c = context(); await c.service.processClaimedArtifact(claim());
    expect(c.prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['ACCEPTED', 'SIGNED_FISCAL_XML'], ['ACCEPTED', 'TAX_AUTHORITY_RESPONSE_XML'],
    ['REJECTED', 'SIGNED_FISCAL_XML'], ['REJECTED', 'TAX_AUTHORITY_RESPONSE_XML'],
  ] as const)('processes terminal/artifact matrix %s + %s', async (status, artifactType) => {
    const scenario = matrix(status, artifactType); const c = context(scenario);
    await c.service.processClaimedArtifact(claim());
    expect(c.retrieval.retrieveFiscalArtifact).toHaveBeenCalledWith(expect.objectContaining({ artifactType }));
    expect(c.storage.storeImmutable).toHaveBeenCalledWith(expect.objectContaining({ artifactType, expectedSha256: hash(scenario.retrieved!.bytes) }));
  });

  it('persists exact retrieval and immutable-storage metadata in the completion transaction', async () => {
    const c = context(); await c.service.processClaimedArtifact(claim());
    const call = c.tx.$executeRaw.mock.calls[0]; const value = storage(hash(retrieved().bytes));
    expect(call).toEqual(expect.arrayContaining([value.storageProvider, value.storageKey, value.sha256, value.byteSize, value.mimeType, 'source-etag', NOW, value.storedAt]));
    expect(c.tx.billingOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }));
  });

  it.each([
    ['malformed payload', { payload: { tenantId: 'tenant-a' } }], ['foreign tenant', { tenantId: 'tenant-b' }],
    ['wrong aggregate', { aggregateId: 'other' }], ['missing causation', { causationId: null }], ['different causation', { causationId: '' }],
    ['foreign owner', { lockedBy: 'foreign' }], ['expired lease', { lockedAt: new Date(Date.now() - 61_000) }],
  ])('rejects invalid preparation child %s before external work', async (_, childOverride) => {
    const c = context({ preparationChild: child(childOverride) });
    await expect(c.service.processClaimedArtifact(claim())).rejects.toBeDefined();
    expect(c.retrieval.retrieveFiscalArtifact).not.toHaveBeenCalled(); expect(c.storage.storeImmutable).not.toHaveBeenCalled();
  });

  it.each([
    ['non-terminal', { taxAuthorityStatus: 'PROCESSING' }], ['missing provider id', { providerDocumentId: null }],
    ['missing key', { haciendaKey: null }], ['missing number', { fiscalNumber: null }], ['unsupported type', { documentTypeCode: '02' }],
  ])('rejects invalid authoritative document %s before external work', async (_, documentOverride) => {
    const c = context({ billingDocument: document(documentOverride) });
    await expect(c.service.processClaimedArtifact(claim())).rejects.toBeDefined();
    expect(c.retrieval.retrieveFiscalArtifact).not.toHaveBeenCalled(); expect(c.storage.storeImmutable).not.toHaveBeenCalled();
  });

  it.each([
    ['missing artifact', []], ['wrong artifact identity', [{ ...pending(), billingDocumentId: 'other' }]],
  ])('rejects %s before external work', async (_, artifactRows) => {
    const c = context({ artifactRows }); await expect(c.service.processClaimedArtifact(claim())).rejects.toBeDefined();
    expect(c.retrieval.retrieveFiscalArtifact).not.toHaveBeenCalled(); expect(c.storage.storeImmutable).not.toHaveBeenCalled();
  });

  it.each([
    ['XML identity mismatch', { retrieved: { ...retrieved(), bytes: Buffer.from('<bad/>') } }],
    ['permanent MIME response', { retrievalError: new FiscalArtifactRetrievalError('FISCAL_ARTIFACT_RETRIEVAL_INVALID_PROVIDER_RESPONSE', false) }],
  ])('turns permanent %s into owned FAILED work', async (_, options) => {
    const c = context({ ...options, failureArtifact: pending() }); await expect(c.service.processClaimedArtifact(claim())).rejects.toMatchObject({ retryable: false });
    expect(c.tx.billingOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
  });

  it('does not expose artifact availability when child completion loses its CAS', async () => {
    const c = context({ completionUpdateCount: 0 }); await expect(c.service.processClaimedArtifact(claim())).rejects.toMatchObject({ code: 'FISCAL_ARTIFACT_RETRIEVAL_CLAIM_INVALID' });
    expect(c.tx.billingOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }));
  });

  it('keeps FAILED artifacts unchanged and serializes only safe service errors', async () => {
    const c = context({ artifact: failed() }); let error: unknown;
    try { await c.service.processClaimedArtifact(claim()); } catch (caught) { error = caught; }
    expect(c.retrieval.retrieveFiscalArtifact).not.toHaveBeenCalled(); expect(c.storage.storeImmutable).not.toHaveBeenCalled();
    expect(JSON.stringify(error)).not.toMatch(new RegExp(`${KEY}|${NUMBER}|private/|stack|cause`, 'i'));
  });

  describe('final BullMQ delivery lifecycle', () => {
    afterEach(() => jest.useRealTimers());

    it('returns owned work below the outbox maximum to PENDING with bounded backoff', async () => {
      jest.useFakeTimers().setSystemTime(NOW);
      const c = lifecycleContext({ attemptCount: 2, maximumAttempts: 5 });
      await c.service.finalizeExhaustedDelivery(claim(), FISCAL_ARTIFACT_RETRIEVAL_ATTEMPTS_EXHAUSTED);
      expect(c.tx.billingOutboxEvent.updateMany).toHaveBeenCalledWith({
        where: { id: 'event-a', tenantId: 'tenant-a', status: 'PROCESSING', lockedBy: 'worker-a' },
        data: { status: 'PENDING', availableAt: new Date('2026-09-09T12:00:02.000Z'), lastError: FISCAL_ARTIFACT_RETRIEVAL_ATTEMPTS_EXHAUSTED, lockedAt: null, lockedBy: null },
      });
      expect(c.tx.$executeRaw).not.toHaveBeenCalled();
    });

    it('atomically fails the exhausted child and exact PENDING artifact', async () => {
      jest.useFakeTimers().setSystemTime(NOW);
      const c = lifecycleContext({ attemptCount: 5, maximumAttempts: 5 });
      await c.service.finalizeExhaustedDelivery(claim(), FISCAL_ARTIFACT_RETRIEVAL_ATTEMPTS_EXHAUSTED);
      expect(c.prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(c.tx.$executeRaw.mock.calls[0]).toEqual(expect.arrayContaining([FISCAL_ARTIFACT_RETRIEVAL_ATTEMPTS_EXHAUSTED, NOW]));
      expect(c.tx.billingOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', lastError: FISCAL_ARTIFACT_RETRIEVAL_ATTEMPTS_EXHAUSTED, lockedAt: null, lockedBy: null }) }));
      expect(c.retrieval.retrieveFiscalArtifact).not.toHaveBeenCalled();
      expect(c.storage.storeImmutable).not.toHaveBeenCalled();
    });

    it('does not mutate a stale or foreign owner', async () => {
      const c = lifecycleContext({ owned: false });
      await c.service.finalizeExhaustedDelivery(claim(), FISCAL_ARTIFACT_RETRIEVAL_ATTEMPTS_EXHAUSTED);
      expect(c.tx.billingOutboxEvent.findUnique).not.toHaveBeenCalled();
      expect(c.tx.billingOutboxEvent.updateMany).not.toHaveBeenCalled();
      expect(c.tx.$executeRaw).not.toHaveBeenCalled();
    });

    it('reconciles an exact AVAILABLE artifact as PROCESSED without failing it', async () => {
      const c = lifecycleContext({ artifact: available() });
      await c.service.finalizeExhaustedDelivery(claim(), FISCAL_ARTIFACT_RETRIEVAL_ATTEMPTS_EXHAUSTED);
      expect(c.tx.$executeRaw).not.toHaveBeenCalled();
      expect(c.tx.billingOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED', lastError: null }) }));
    });

    it('preserves exact FAILED artifact metadata while making the child terminal', async () => {
      const artifact = failed(); const c = lifecycleContext({ artifact });
      await c.service.finalizeExhaustedDelivery(claim(), FISCAL_ARTIFACT_RETRIEVAL_ATTEMPTS_EXHAUSTED);
      expect(c.tx.$executeRaw).not.toHaveBeenCalled();
      expect(c.tx.billingOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', lastError: artifact.terminalErrorCode }) }));
    });

    it('rejects a child CAS loss so artifact failure and child completion roll back together', async () => {
      const c = lifecycleContext({ updateCount: 0 });
      await expect(c.service.finalizeExhaustedDelivery(claim(), FISCAL_ARTIFACT_RETRIEVAL_ATTEMPTS_EXHAUSTED)).rejects.toMatchObject({ retryable: true });
      expect(c.prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(c.tx.$executeRaw).toHaveBeenCalledTimes(1);
      expect(c.tx.billingOutboxEvent.updateMany).toHaveBeenCalledTimes(1);
    });
  });
});

function claim() { return { tenantId: 'tenant-a', outboxEventId: 'event-a', lockOwner: 'worker-a' }; }
function child(overrides: Record<string, unknown> = {}) { return { id: 'event-a', tenantId: 'tenant-a', eventType: 'billing-document.artifact-retrieval-requested', eventVersion: 1, aggregateType: 'BillingDocument', aggregateId: 'document-a', causationId: 'parent-a', status: 'PROCESSING', lockedBy: 'worker-a', lockedAt: new Date(), payload: { tenantId: 'tenant-a', billingDocumentId: 'document-a', artifactType: 'SIGNED_FISCAL_XML', artifactVersion: 1, eventVersion: 1 } as Prisma.JsonObject, ...overrides }; }
function document(overrides: Record<string, unknown> = {}) { return { id: 'document-a', tenantId: 'tenant-a', providerDocumentId: 'provider-document', providerEnvironment: 'sandbox', haciendaKey: KEY, fiscalNumber: NUMBER, documentTypeCode: '01', taxAuthorityStatus: 'ACCEPTED', taxAuthorityFinalizedAt: NOW, ...overrides }; }
function pending() { return { id: 'artifact-a', tenantId: 'tenant-a', billingDocumentId: 'document-a', artifactType: 'SIGNED_FISCAL_XML', version: 1, status: 'PENDING', storageProvider: null, storageKey: null, sha256: null, byteSize: null, mimeType: null, sourceEtag: null, retrievedAt: null, storedAt: null, terminalErrorCode: null, failedAt: null }; }
function available() { const value = storage(hash(retrieved().bytes)); return { ...pending(), status: 'AVAILABLE', storageProvider: value.storageProvider, storageKey: value.storageKey, sha256: value.sha256, byteSize: value.byteSize, mimeType: value.mimeType, sourceEtag: 'source-etag', retrievedAt: NOW, storedAt: value.storedAt }; }
function failed() { return { ...pending(), status: 'FAILED', terminalErrorCode: 'FISCAL_ARTIFACT_RETRIEVAL_ARTIFACT_INVALID', failedAt: NOW }; }
function retrieved() { return { bytes: Buffer.from(`<?xml version="1.0"?><FacturaElectronica xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica"><Clave>${KEY}</Clave><NumeroConsecutivo>${NUMBER}</NumeroConsecutivo></FacturaElectronica>`), normalizedMimeType: 'application/xml' as const, retrievedAt: NOW, sourceEtag: 'source-etag' }; }
function storage(sha256: string, bytes = retrieved().bytes) { return { storageProvider: 'PRIVATE_OBJECT_STORAGE', storageKey: `private/${sha256}.xml`, sha256, byteSize: BigInt(bytes.length), mimeType: 'application/xml', storedAt: new Date('2026-09-09T12:00:01.000Z'), storageEtag: 'storage-etag' }; }
function hash(bytes: Buffer) { return createHash('sha256').update(bytes).digest('hex'); }
function matrix(status: 'ACCEPTED' | 'REJECTED', artifactType: 'SIGNED_FISCAL_XML' | 'TAX_AUTHORITY_RESPONSE_XML') { const payload = child({ payload: { tenantId: 'tenant-a', billingDocumentId: 'document-a', artifactType, artifactVersion: 1, eventVersion: 1 } }); const artifact = { ...pending(), artifactType }; const xml = artifactType === 'SIGNED_FISCAL_XML' ? retrieved().bytes : Buffer.from(`<?xml version="1.0"?><MensajeHacienda xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/mensajeHacienda"><Clave>${KEY}</Clave><IndEstado>${status === 'ACCEPTED' ? 'aceptado' : 'rechazado'}</IndEstado></MensajeHacienda>`); return { preparationChild: payload, completionChild: payload, artifact, billingDocument: document({ taxAuthorityStatus: status }), retrieved: { ...retrieved(), bytes: xml } }; }
function context(options: { artifact?: ReturnType<typeof pending> | ReturnType<typeof available> | ReturnType<typeof failed>; artifactRows?: unknown[]; failureArtifact?: ReturnType<typeof pending>; retrievalError?: Error; storageError?: Error; completionChild?: ReturnType<typeof child>; preparationChild?: ReturnType<typeof child>; billingDocument?: ReturnType<typeof document>; retrieved?: ReturnType<typeof retrieved>; completionUpdateCount?: number } = {}) {
  const artifact = options.artifact ?? pending(); const invalidPreparationLease = options.preparationChild && (options.preparationChild.lockedBy !== 'worker-a' || (options.preparationChild.lockedAt as Date).getTime() < Date.now() - 60_000); const queries: unknown[][] = [invalidPreparationLease ? [] : [{ id: 'event-a' }], options.artifactRows ?? [artifact], [{ id: 'event-a' }], [artifact]];
  if (options.failureArtifact) queries.push([{ id: 'event-a' }], [options.failureArtifact]);
  const tx = { $queryRaw: jest.fn().mockImplementation(async () => queries.shift() ?? []), $executeRaw: jest.fn().mockResolvedValue(1), billingOutboxEvent: { findUnique: jest.fn().mockResolvedValueOnce(options.preparationChild ?? child()).mockResolvedValue(options.completionChild ?? options.preparationChild ?? child()), updateMany: jest.fn().mockResolvedValue({ count: options.completionUpdateCount ?? 1 }) }, billingDocument: { findUnique: jest.fn().mockResolvedValue(options.billingDocument ?? document()) } };
  const prisma = { $transaction: jest.fn(async (work: (value: typeof tx) => unknown) => work(tx)) } as unknown as PrismaService & { $transaction: jest.Mock };
  const retrieval = { retrieveFiscalArtifact: jest.fn().mockImplementation(async () => { if (options.retrievalError) throw options.retrievalError; return options.retrieved ?? retrieved(); }) } as unknown as FiscalArtifactRetrievalPort & { retrieveFiscalArtifact: jest.Mock };
  const immutable = { storeImmutable: jest.fn().mockImplementation(async (value) => { if (options.storageError) throw options.storageError; return storage(value.expectedSha256, value.bytes); }) } as unknown as ImmutableBillingArtifactStoragePort & { storeImmutable: jest.Mock };
  return { service: new FiscalArtifactRetrievalService(prisma, retrieval, immutable), prisma, tx, retrieval, storage: immutable };
}

function lifecycleContext(options: { attemptCount?: number; maximumAttempts?: number; artifact?: ReturnType<typeof pending> | ReturnType<typeof available> | ReturnType<typeof failed>; owned?: boolean; updateCount?: number } = {}) {
  const lifecycleChild = { ...child(), attemptCount: options.attemptCount ?? 5, maximumAttempts: options.maximumAttempts ?? 5 };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValueOnce(options.owned === false ? [] : [{ id: 'event-a' }]).mockResolvedValueOnce([options.artifact ?? pending()]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    billingOutboxEvent: { findUnique: jest.fn().mockResolvedValue(lifecycleChild), updateMany: jest.fn().mockResolvedValue({ count: options.updateCount ?? 1 }) },
  };
  const prisma = { $transaction: jest.fn(async (work: (value: typeof tx) => unknown) => work(tx)) } as unknown as PrismaService & { $transaction: jest.Mock };
  const retrieval = { retrieveFiscalArtifact: jest.fn() } as unknown as FiscalArtifactRetrievalPort & { retrieveFiscalArtifact: jest.Mock };
  const immutable = { storeImmutable: jest.fn() } as unknown as ImmutableBillingArtifactStoragePort & { storeImmutable: jest.Mock };
  return { service: new FiscalArtifactRetrievalService(prisma, retrieval, immutable), prisma, tx, retrieval, storage: immutable };
}
