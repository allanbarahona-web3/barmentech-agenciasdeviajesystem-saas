import { UnrecoverableError, type Job } from 'bullmq';
import type { JobEnvelope } from '../../infrastructure/job-dispatcher';
import { PLATFORM_QUEUE_KEYS } from '../../infrastructure/queue';
import type { WorkerService } from '../../infrastructure/worker';
import {
  FISCAL_ARTIFACT_RETRIEVAL_ATTEMPTS_EXHAUSTED,
  FiscalArtifactRetrievalService,
  FiscalArtifactRetrievalServiceError,
} from '../fiscal-artifact-retrieval.service';
import {
  FISCAL_ARTIFACT_RETRIEVAL_CONCURRENCY,
  FISCAL_ARTIFACT_RETRIEVAL_JOB_NAME,
  FISCAL_ARTIFACT_RETRIEVAL_WORKER_REGISTRATION_KEY,
} from './fiscal-artifact-retrieval.constants';
import { FiscalArtifactRetrievalProcessor } from './fiscal-artifact-retrieval.processor';

describe('FiscalArtifactRetrievalProcessor', () => {
  it('registers once and forwards only job identity and lease', async () => {
    const c = context(); c.processor.onModuleInit();
    expect(c.register).toHaveBeenCalledWith(
      FISCAL_ARTIFACT_RETRIEVAL_WORKER_REGISTRATION_KEY,
      PLATFORM_QUEUE_KEYS.FISCAL_ARTIFACT_RETRIEVAL,
      expect.any(Function),
      { concurrency: FISCAL_ARTIFACT_RETRIEVAL_CONCURRENCY, jobNames: FISCAL_ARTIFACT_RETRIEVAL_JOB_NAME },
    );
    await c.handler!(job());
    expect(c.processClaimedArtifact).toHaveBeenCalledWith(claim());
    expect(c.finalizeExhaustedDelivery).not.toHaveBeenCalled();
  });

  it('rethrows an intermediate retryable failure without changing lifecycle', async () => {
    const failure = new FiscalArtifactRetrievalServiceError('RETRYABLE', true);
    const c = context(failure); c.processor.onModuleInit();
    await expect(c.handler!(job({}, 0, 3))).rejects.toBe(failure);
    expect(c.finalizeExhaustedDelivery).not.toHaveBeenCalled();
  });

  it('finalizes lifecycle exactly once on the final retryable or unknown attempt', async () => {
    for (const failure of [new FiscalArtifactRetrievalServiceError('RETRYABLE', true), new Error('unknown')]) {
      const c = context(failure); c.processor.onModuleInit();
      await expect(c.handler!(job({}, 2, 3))).rejects.toBe(failure);
      expect(c.finalizeExhaustedDelivery).toHaveBeenCalledTimes(1);
      expect(c.finalizeExhaustedDelivery).toHaveBeenCalledWith(claim(), FISCAL_ARTIFACT_RETRIEVAL_ATTEMPTS_EXHAUSTED);
    }
  });

  it('rejects malformed and permanent jobs without final lifecycle persistence', async () => {
    const c = context(new FiscalArtifactRetrievalServiceError('PERMANENT', false)); c.processor.onModuleInit();
    await expect(c.handler!(job({ extra: true }, 2, 3))).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(c.handler!(job({}, 2, 3))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(c.finalizeExhaustedDelivery).not.toHaveBeenCalled();
  });
});

function context(failure?: Error) {
  let handler: ((job: Job<JobEnvelope<unknown>>) => Promise<unknown>) | undefined;
  const register = jest.fn((_key, _queue, value) => { handler = value; });
  const processClaimedArtifact = failure ? jest.fn().mockRejectedValue(failure) : jest.fn();
  const finalizeExhaustedDelivery = jest.fn();
  const processor = new FiscalArtifactRetrievalProcessor(
    { registerWorker: register } as unknown as WorkerService,
    { processClaimedArtifact, finalizeExhaustedDelivery } as unknown as FiscalArtifactRetrievalService,
  );
  return { processor, register, processClaimedArtifact, finalizeExhaustedDelivery, get handler() { return handler; } };
}
function claim() { return { tenantId: 'tenant-a', outboxEventId: 'event-a', lockOwner: 'owner-a' }; }
function job(extra: Record<string, unknown> = {}, attemptsMade = 0, attempts = 3) {
  return {
    name: FISCAL_ARTIFACT_RETRIEVAL_JOB_NAME,
    data: { payload: { ...claim(), eventVersion: 1, ...extra } },
    attemptsMade,
    opts: { attempts },
  } as unknown as Job<JobEnvelope<unknown>>;
}
