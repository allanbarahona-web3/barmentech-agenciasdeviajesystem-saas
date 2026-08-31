import { ConfigService } from "@nestjs/config";
import { PLATFORM_QUEUE_KEYS, QueueService } from "../queue";
import { JobDispatcherService } from "./job-dispatcher.service";

describe("JobDispatcherService retention options", () => {
  it("forwards explicit retention with all existing dispatch options", async () => {
    const { dispatcher, add } = createDispatcher();

    await dispatcher.dispatch({
      queueKey: PLATFORM_QUEUE_KEYS.FISCAL_BILLING,
      jobName: "fiscal-job",
      payload: { billingDocumentId: "document-a" },
      metadata: { tenantId: "tenant-a" },
      options: {
        jobId: "fiscal-job-document-a",
        priority: 2,
        attempts: 4,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: false,
        removeOnFail: false,
        timeout: 30000,
      },
    });

    expect(add).toHaveBeenCalledWith(
      "fiscal-job",
      {
        payload: { billingDocumentId: "document-a" },
        metadata: { tenantId: "tenant-a" },
        runtime: { timeout: 30000 },
      },
      {
        jobId: "fiscal-job-document-a",
        priority: 2,
        attempts: 4,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
  });

  it("omits retention options when callers do not provide them", async () => {
    const { dispatcher, add } = createDispatcher();

    await dispatcher.dispatch({
      queueKey: PLATFORM_QUEUE_KEYS.BILLING,
      jobName: "existing-job",
      payload: { id: "existing" },
      options: { jobId: "existing-job-id", attempts: 2 },
    });

    expect(add).toHaveBeenCalledWith(
      "existing-job",
      { payload: { id: "existing" } },
      { jobId: "existing-job-id", attempts: 2 },
    );
  });

  it("preserves delayed dispatch and the colon prohibition for job IDs", async () => {
    const { dispatcher, add } = createDispatcher();

    await dispatcher.dispatchDelayed({
      queueKey: PLATFORM_QUEUE_KEYS.DOCUMENT,
      jobName: "delayed-job",
      payload: { id: "document-a" },
      delayMs: 500,
    });
    expect(add).toHaveBeenCalledWith(
      "delayed-job",
      { payload: { id: "document-a" } },
      { delay: 500 },
    );

    await expect(
      dispatcher.dispatch({
        queueKey: PLATFORM_QUEUE_KEYS.FISCAL_BILLING,
        jobName: "fiscal-job",
        payload: {},
        options: { jobId: "invalid:job-id" },
      }),
    ).rejects.toThrow("Job ID cannot contain colons.");
  });
});

function createDispatcher() {
  const add = jest.fn().mockResolvedValue({ id: "job-a" });
  const queueService = {
    getConfiguredQueueName: jest.fn((key: string) => key),
    getQueue: jest.fn().mockReturnValue({ add }),
    registerQueue: jest.fn(),
  } as unknown as QueueService;
  const configService = {
    get: jest.fn((_key: string, defaultValue: unknown) => defaultValue),
  } as unknown as ConfigService;

  return {
    dispatcher: new JobDispatcherService(queueService, configService),
    add,
  };
}
