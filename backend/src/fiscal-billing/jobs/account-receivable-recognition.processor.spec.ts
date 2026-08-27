import { UnrecoverableError, type Job } from "bullmq";
import type { JobEnvelope } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import type { WorkerService } from "../../infrastructure/worker";
import {
  ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS,
  type AccountReceivableRecognitionService,
} from "../account-receivable-recognition.service";
import {
  ACCOUNT_RECEIVABLE_RECOGNITION_CONCURRENCY,
  ACCOUNT_RECEIVABLE_RECOGNITION_JOB_NAME,
  ACCOUNT_RECEIVABLE_RECOGNITION_WORKER_REGISTRATION_KEY,
} from "./account-receivable-recognition.constants";
import { AccountReceivableRecognitionProcessor } from "./account-receivable-recognition.processor";

describe("AccountReceivableRecognitionProcessor", () => {
  it("registers one dedicated worker and forwards only identity and lease", async () => {
    const c = context(); c.processor.onModuleInit();
    expect(c.register).toHaveBeenCalledWith(ACCOUNT_RECEIVABLE_RECOGNITION_WORKER_REGISTRATION_KEY, PLATFORM_QUEUE_KEYS.ACCOUNT_RECEIVABLE_RECOGNITION, expect.any(Function), { concurrency: ACCOUNT_RECEIVABLE_RECOGNITION_CONCURRENCY, jobNames: ACCOUNT_RECEIVABLE_RECOGNITION_JOB_NAME });
    await expect(c.handler!(job())).resolves.toEqual({ completed: true });
    expect(c.recognize).toHaveBeenCalledWith({ tenantId: "tenant-a", billingOutboxEventId: "child-a", lockOwner: "owner-a" });
    expect(c.fail).not.toHaveBeenCalled(); expect(c.release).not.toHaveBeenCalled();
  });

  it("rejects malformed contracts without accessing recognition", async () => {
    const c = context(); c.processor.onModuleInit();
    await expect(c.handler!({ ...job(), name: "other" } as Job<JobEnvelope<unknown>>)).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(c.handler!(job({ tenantId: "tenant-a", outboxEventId: "child-a", lockOwner: "owner-a", eventVersion: 1, amount: "forbidden" }))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(c.recognize).not.toHaveBeenCalled();
  });

  it("marks structural failures failed and makes them non-retryable", async () => {
    const c = context(); c.recognize.mockRejectedValueOnce(new Error(ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.DOCUMENT_INVALID)); c.processor.onModuleInit();
    await expect(c.handler!(job())).rejects.toBeInstanceOf(UnrecoverableError);
    expect(c.fail).toHaveBeenCalledWith({ tenantId: "tenant-a", billingOutboxEventId: "child-a", lockOwner: "owner-a" }, ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.DOCUMENT_INVALID);
    expect(c.release).not.toHaveBeenCalled();
  });

  it("keeps transient failures for BullMQ retry, then releases only on the final attempt", async () => {
    let c = context(); c.recognize.mockRejectedValueOnce(new Error("database")); c.processor.onModuleInit();
    await expect(c.handler!(job({}, 0, 3))).rejects.toThrow("database"); expect(c.release).not.toHaveBeenCalled();
    c = context(); c.recognize.mockRejectedValueOnce(new Error("database")); c.processor.onModuleInit();
    await expect(c.handler!(job({}, 2, 3))).rejects.toThrow("database"); expect(c.release).toHaveBeenCalledWith({ tenantId: "tenant-a", billingOutboxEventId: "child-a", lockOwner: "owner-a" });
  });
});

function context() { let handler: ((job: Job<JobEnvelope<unknown>>) => Promise<unknown>) | undefined; const register = jest.fn((_key, _queue, value) => { handler = value; }); const recognize = jest.fn().mockResolvedValue(undefined), fail = jest.fn().mockResolvedValue(undefined), release = jest.fn().mockResolvedValue(undefined); const processor = new AccountReceivableRecognitionProcessor({ registerWorker: register } as unknown as WorkerService, { recognizeClaimedEvent: recognize, failClaim: fail, releaseClaimAfterWorkerFailure: release } as unknown as AccountReceivableRecognitionService); return { processor, register, recognize, fail, release, get handler() { return handler; } }; }
function job(payload: Record<string, unknown> = {}, attemptsMade = 0, attempts = 3) { return { name: ACCOUNT_RECEIVABLE_RECOGNITION_JOB_NAME, id: "job-a", attemptsMade, opts: { attempts }, data: { payload: { tenantId: "tenant-a", outboxEventId: "child-a", lockOwner: "owner-a", eventVersion: 1, ...payload } } } as unknown as Job<JobEnvelope<unknown>>; }
