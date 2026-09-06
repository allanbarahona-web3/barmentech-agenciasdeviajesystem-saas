import { BadRequestException } from "@nestjs/common";
import {
  ContractPaymentFiscalPreparationError,
  CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS,
} from "./contract-payment-fiscal-preparation.service";
import {
  contractPaymentFiscalizationErrorCode,
  ContractPaymentFiscalizationWorkerService,
  isNonRetryableContractPaymentFiscalizationError,
} from "./contract-payment-fiscalization-worker.service";

describe("ContractPaymentFiscalizationWorkerService", () => {
  it("prepares then requests issuance through BillingDocumentService, without provider access", async () => {
    const c = context();

    await c.service.processClaim(claim());

    expect(c.preparation.prepareOrResume).toHaveBeenCalledWith("tenant-a", "payment-a", "SYSTEM");
    expect(c.billing.requestElectronicIssuance).toHaveBeenCalledWith("tenant-a", "document-a", "SYSTEM");
    expect(c.prisma.billingOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "PROCESSED", lastError: null }),
    }));
    expect((c.prisma as Record<string, unknown>).accountReceivable).toBeUndefined();
    expect((c.prisma as Record<string, unknown>).payment).toBeUndefined();
    expect((c.prisma as Record<string, unknown>).commercialObligation).toBeUndefined();
    expect((c as Record<string, unknown>).provider).toBeUndefined();
  });

  it("completes an already advanced BillingDocument without duplicate preparation or issuance", async () => {
    const c = context({ existing: { id: "document-a", lifecycleStatus: "SUBMITTED", internalNumber: "BD-CP" } });
    await c.service.processClaim(claim());
    expect(c.preparation.prepareOrResume).not.toHaveBeenCalled();
    expect(c.billing.requestElectronicIssuance).not.toHaveBeenCalled();
    expect(c.prisma.billingOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "PROCESSED" }),
    }));
  });

  it("classifies deterministic preparation errors as terminal", () => {
    const error = new ContractPaymentFiscalPreparationError(
      CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.CLASSIFICATION_MISSING,
    );
    expect(isNonRetryableContractPaymentFiscalizationError(error)).toBe(true);
    expect(contractPaymentFiscalizationErrorCode(error)).toBe(
      CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.CLASSIFICATION_MISSING,
    );
    expect(isNonRetryableContractPaymentFiscalizationError(new BadRequestException({ code: "BILLING_DOCUMENT_NOT_ELIGIBLE_FOR_ISSUANCE" }))).toBe(true);
    expect(isNonRetryableContractPaymentFiscalizationError(new Error("database timeout"))).toBe(false);
  });

  it("releases transient failures for retry without mutating financial records", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-06T12:00:00.000Z"));
    const c = context({ attempts: 1, maximumAttempts: 5 });
    await c.service.releaseClaimAfterWorkerFailure(claim());
    expect(c.prisma.billingOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "PENDING", lastError: "CONTRACT_PAYMENT_FISCALIZATION_WORKER_FAILED" }),
    }));
    expect((c.prisma as Record<string, unknown>).paymentAllocation).toBeUndefined();
    jest.useRealTimers();
  });
});

function claim() {
  return { tenantId: "tenant-a", billingOutboxEventId: "event-a", lockOwner: "owner-a" };
}

function context(options: { existing?: object | null; attempts?: number; maximumAttempts?: number } = {}) {
  const event = {
    id: "event-a", tenantId: "tenant-a", eventType: "contract-payment.fiscalization-requested",
    eventVersion: 1, aggregateType: "Payment", aggregateId: "payment-a",
    payload: { tenantId: "tenant-a", paymentId: "payment-a", eventVersion: 1 },
  };
  const prisma = {
    billingOutboxEvent: {
      findFirst: jest.fn()
        .mockResolvedValueOnce(event)
        .mockResolvedValue({ attemptCount: options.attempts ?? 1, maximumAttempts: options.maximumAttempts ?? 5 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const preparation = { prepareOrResume: jest.fn().mockResolvedValue({ id: "document-a", lifecycleStatus: "DRAFT" }) };
  const billing = {
    findPrimaryDocument: jest.fn().mockResolvedValue(options.existing ?? null),
    requestElectronicIssuance: jest.fn().mockResolvedValue({ billingDocumentId: "document-a" }),
  };
  return {
    prisma,
    preparation,
    billing,
    service: new ContractPaymentFiscalizationWorkerService(prisma as never, preparation as never, billing as never),
  };
}
