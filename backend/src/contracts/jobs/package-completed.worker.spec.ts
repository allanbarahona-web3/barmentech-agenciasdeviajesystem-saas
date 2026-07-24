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
  it("registers once and reloads the authoritative signing session", async () => {
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
    const autoIssueAndSendInvoiceToTitular = jest.fn().mockResolvedValue({});
    const deliver = jest.fn().mockResolvedValue(undefined);
    const worker = new PackageCompletedWorker(workerService as never, {
      documentSigningSession: { findUnique },
    } as never, {
      autoIssueAndSendInvoiceToTitular,
    } as never, {
      deliver,
    } as never);

    worker.onModuleInit();

    expect(workerService.registerWorker).toHaveBeenCalledWith(
      PACKAGE_COMPLETED_WORKER_REGISTRATION_KEY,
      PLATFORM_QUEUE_KEYS.PACKAGE_COMPLETED,
      expect.any(Function),
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
    expect(autoIssueAndSendInvoiceToTitular).toHaveBeenCalledWith({
      contractId: "contract-1",
      actorUserId: "user-1",
      actorEmail: "agent@example.com",
      actorName: "Agent",
    });
    expect(deliver).toHaveBeenCalledWith("contract-1");
    expect(
      autoIssueAndSendInvoiceToTitular.mock.invocationCallOrder[0],
    ).toBeLessThan(deliver.mock.invocationCallOrder[0]);
  });
});
