import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import {
  getPackageCompletedJobId,
  PACKAGE_COMPLETED_JOB_NAME,
} from "./package-completed-job.constants";
import { PackageCompletedDispatcher } from "./package-completed.dispatcher";

describe("PackageCompletedDispatcher", () => {
  it("dispatches canonical identifiers with a deterministic signing-session job ID", async () => {
    const queueService = {
      registerQueue: jest.fn(),
      getConfiguredQueueName: jest.fn().mockReturnValue("package-completed"),
    };
    const queueEventsService = {
      registerQueueEvents: jest.fn(),
    };
    const jobDispatcher = { dispatch: jest.fn().mockResolvedValue({}) };
    const dispatcher = new PackageCompletedDispatcher(
      queueService as never,
      queueEventsService as never,
      jobDispatcher as never,
    );
    const payload = {
      contractId: "contract-1",
      documentSigningSessionId: "session-1",
      tenantId: "tenant-1",
      correlationId: "correlation-1",
      actorUserId: "user-1",
      completedAt: "2026-07-23T12:00:00.000Z",
      eventVersion: 1,
    };

    dispatcher.onModuleInit();
    await dispatcher.dispatch(payload);

    expect(jobDispatcher.dispatch).toHaveBeenCalledWith({
      queueKey: PLATFORM_QUEUE_KEYS.PACKAGE_COMPLETED,
      jobName: PACKAGE_COMPLETED_JOB_NAME,
      payload,
      metadata: {
        correlationId: payload.correlationId,
        tenantId: payload.tenantId,
      },
      options: {
        jobId: getPackageCompletedJobId(payload.documentSigningSessionId),
      },
    });
  });
});
