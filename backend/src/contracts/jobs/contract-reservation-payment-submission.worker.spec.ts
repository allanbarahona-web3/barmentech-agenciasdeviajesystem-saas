import { Job, Processor } from "bullmq";
import { JobEnvelope } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import {
  CONTRACT_RESERVATION_PAYMENT_SUBMISSION_JOB_NAME,
  CONTRACT_RESERVATION_PAYMENT_SUBMISSION_WORKER_REGISTRATION_KEY,
} from "./contract-reservation-payment-submission-job.constants";
import { ContractReservationPaymentSubmissionJobPayload } from "./contract-reservation-payment-submission-job.types";
import { ContractReservationPaymentSubmissionWorker } from "./contract-reservation-payment-submission.worker";

describe("ContractReservationPaymentSubmissionWorker", () => {
  it("submits the archived Contract once with its tenant and actor context", async () => {
    let processor: Processor | undefined;
    const registerWorker = jest.fn(
      (_key: string, _queue: string, registeredProcessor: Processor) => {
        processor = registeredProcessor;
      },
    );
    const contract = {
      id: "contract-1",
      tenantId: "tenant-1",
      clientId: "customer-1",
      createdAt: new Date("2026-10-12T10:00:00.000Z"),
      paymentReference: "PAY-1",
      commercialTotal: "125.50",
      paymentConditionType: "CREDIT",
      payload: { paymentMethod: "BANK_TRANSFER" },
      generatedByUserId: "user-1",
      generatedByEmail: "agent@example.com",
      generatedByName: "Ada Agent",
      client: { fullName: "Ada Customer" },
      documents: [],
    };
    const findUnique = jest.fn().mockResolvedValue(contract);
    const submit = jest.fn().mockResolvedValue(undefined);
    const worker = new ContractReservationPaymentSubmissionWorker(
      { registerWorker } as never,
      { contract: { findUnique } } as never,
      { submit } as never,
    );

    worker.onModuleInit();

    expect(registerWorker).toHaveBeenCalledWith(
      CONTRACT_RESERVATION_PAYMENT_SUBMISSION_WORKER_REGISTRATION_KEY,
      PLATFORM_QUEUE_KEYS.CONTRACT_RESERVATION_PAYMENT_SUBMISSION,
      expect.any(Function),
      { jobNames: CONTRACT_RESERVATION_PAYMENT_SUBMISSION_JOB_NAME },
    );

    await processor!(job());

    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "contract-1" },
      select: expect.objectContaining({ tenantId: true, payload: true }),
    }));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith({
      contract: { ...contract, paymentMethod: "BANK_TRANSFER" },
      actor: { userId: "user-1", name: "Ada Agent" },
    });
  });

  it("replays the same idempotent Contract submission command on retry", async () => {
    let processor: Processor | undefined;
    const registerWorker = jest.fn(
      (_key: string, _queue: string, registeredProcessor: Processor) => {
        processor = registeredProcessor;
      },
    );
    const contract = {
      id: "contract-1", tenantId: "tenant-1", clientId: "customer-1",
      createdAt: new Date("2026-10-12T10:00:00.000Z"), paymentReference: "PAY-1",
      commercialTotal: "125.50", paymentConditionType: "CREDIT",
      payload: { paymentMethod: "CARD" }, generatedByUserId: "user-1",
      generatedByEmail: "agent@example.com", generatedByName: "Ada Agent",
      client: { fullName: "Ada Customer" }, documents: [],
    };
    const submit = jest.fn().mockResolvedValue(undefined);
    const worker = new ContractReservationPaymentSubmissionWorker(
      { registerWorker } as never,
      { contract: { findUnique: jest.fn().mockResolvedValue(contract) } } as never,
      { submit } as never,
    );
    worker.onModuleInit();

    await processor!(job());
    await processor!(job());

    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[0][0]).toEqual(submit.mock.calls[1][0]);
  });
});

function job(): Job<JobEnvelope<ContractReservationPaymentSubmissionJobPayload>> {
  return {
    id: "contract-reservation-payment-submit-contract-1",
    name: CONTRACT_RESERVATION_PAYMENT_SUBMISSION_JOB_NAME,
    data: { payload: { contractId: "contract-1" } },
  } as Job<JobEnvelope<ContractReservationPaymentSubmissionJobPayload>>;
}
