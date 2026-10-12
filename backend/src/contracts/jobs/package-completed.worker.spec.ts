import { Job, Processor } from "bullmq";
import { JobEnvelope } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import {
  PACKAGE_COMPLETED_JOB_NAME,
  PACKAGE_COMPLETED_WORKER_REGISTRATION_KEY,
} from "./package-completed-job.constants";
import { PackageCompletedJobPayload } from "./package-completed-job.types";
import { PackageCompletedWorker } from "./package-completed.worker";

describe("PackageCompletedWorker", () => {
  it.each([
    ["CONTRACT_RESERVATION", "CREDIT"],
    ["CONTRACT_PAYMENT", "CASH"],
  ])("delivers the completed package without legacy billing for %s / %s", async () => {
    let processor: Processor | undefined;
    const workerService = {
      registerWorker: jest.fn(
        (_key: string, _queue: string, registeredProcessor: Processor) => {
          processor = registeredProcessor;
        },
      ),
    };
    const findUnique = jest.fn().mockResolvedValue({
      id: "session-1",
      contractId: "contract-1",
      tenantId: "tenant-1",
      status: "SIGNED",
      completedAt: new Date("2026-07-23T12:00:00.000Z"),
      contract: {
        generatedByUserId: "user-1",
        generatedByEmail: "agent@example.com",
        generatedByName: "Agent",
      },
    });
    const deliver = jest.fn().mockResolvedValue(undefined);
    const worker = new PackageCompletedWorker(workerService as never, {
      documentSigningSession: { findUnique },
    } as never, {
      deliver,
    } as never);

    worker.onModuleInit();

    expect(workerService.registerWorker).toHaveBeenCalledWith(
      PACKAGE_COMPLETED_WORKER_REGISTRATION_KEY,
      PLATFORM_QUEUE_KEYS.PACKAGE_COMPLETED,
      expect.any(Function),
      { jobNames: PACKAGE_COMPLETED_JOB_NAME },
    );

    const payload: PackageCompletedJobPayload = {
      contractId: "contract-1",
      documentSigningSessionId: "session-1",
      tenantId: "tenant-1",
      correlationId: "correlation-1",
      actorUserId: "user-1",
      completedAt: "2026-07-23T12:00:00.000Z",
      eventVersion: 1,
    };
    await processor!(
      {
        id: "package-completed-session-1",
        name: PACKAGE_COMPLETED_JOB_NAME,
        data: { payload },
      } as Job<JobEnvelope<PackageCompletedJobPayload>>,
    );

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "session-1" },
      select: {
        id: true,
        contractId: true,
        tenantId: true,
        status: true,
        completedAt: true,
        contract: {
          select: {
            generatedByUserId: true,
            generatedByEmail: true,
            generatedByName: true,
          },
        },
      },
    });
    expect(deliver).toHaveBeenCalledWith("contract-1");
  });
});
