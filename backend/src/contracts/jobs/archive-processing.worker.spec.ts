import { Job, Processor } from "bullmq";
import { JobEnvelope } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import {
  ARCHIVE_PROCESSING_JOB_NAME,
  ARCHIVE_PROCESSING_WORKER_REGISTRATION_KEY,
} from "./archive-processing-job.constants";
import { ArchiveProcessingJobPayload } from "./archive-processing-job.types";
import {
  CONTRACT_RESERVATION_PAYMENT_SUBMISSION_JOB_NAME,
  CONTRACT_RESERVATION_PAYMENT_SUBMISSION_JOB_OPTIONS,
  getContractReservationPaymentSubmissionJobId,
} from "./contract-reservation-payment-submission-job.constants";
import { ArchiveProcessingWorker } from "./archive-processing.worker";

describe("ArchiveProcessingWorker", () => {
  it("dispatches one modern reservation-submission job with the archived Contract tenant", async () => {
    let processor: Processor | undefined;
    const registerWorker = jest.fn(
      (_key: string, _queue: string, registeredProcessor: Processor) => {
        processor = registeredProcessor;
      },
    );
    const contract = {
      id: "contract-1", tenantId: "tenant-1", contractNumber: "C-1",
      internalTripId: "trip-1", htmlObjectKey: "contracts/c-1.html",
      paymentReference: "PAY-1", payload: {}, clientId: "customer-1", documents: [],
    };
    const findUnique = jest.fn().mockResolvedValue(contract);
    const processContractArchiveArtifactsForWorker = jest.fn().mockResolvedValue("contracts/c-1");
    const processAdditionalArchiveDocumentsForWorker = jest.fn().mockResolvedValue(undefined);
    const registerContractCustomerDocumentsForWorker = jest.fn().mockResolvedValue(undefined);
    const dispatch = jest.fn().mockResolvedValue(undefined);
    const worker = new ArchiveProcessingWorker(
      { registerWorker } as never,
      { contract: { findUnique } } as never,
      {
        processContractArchiveArtifactsForWorker,
        processAdditionalArchiveDocumentsForWorker,
        registerContractCustomerDocumentsForWorker,
      } as never,
      { dispatch } as never,
    );

    worker.onModuleInit();
    expect(registerWorker).toHaveBeenCalledWith(
      ARCHIVE_PROCESSING_WORKER_REGISTRATION_KEY,
      PLATFORM_QUEUE_KEYS.DOCUMENT,
      expect.any(Function),
      { jobNames: ARCHIVE_PROCESSING_JOB_NAME },
    );

    await processor!(archiveJob());

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      queueKey: PLATFORM_QUEUE_KEYS.CONTRACT_RESERVATION_PAYMENT_SUBMISSION,
      jobName: CONTRACT_RESERVATION_PAYMENT_SUBMISSION_JOB_NAME,
      payload: { contractId: "contract-1" },
      metadata: { tenantId: "tenant-1" },
      options: {
        ...CONTRACT_RESERVATION_PAYMENT_SUBMISSION_JOB_OPTIONS,
        jobId: getContractReservationPaymentSubmissionJobId("contract-1"),
      },
    });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({
      queueKey: PLATFORM_QUEUE_KEYS.BILLING,
    }));
  });
});

function archiveJob(): Job<JobEnvelope<ArchiveProcessingJobPayload>> {
  return {
    id: "contract-archive-processing-contract-1",
    name: ARCHIVE_PROCESSING_JOB_NAME,
    data: { payload: { contractId: "contract-1" } },
  } as Job<JobEnvelope<ArchiveProcessingJobPayload>>;
}
