import { ServiceUnavailableException } from "@nestjs/common";
import { UnrecoverableError } from "bullmq";
import {
  ContractPaymentFiscalPreparationError,
  CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS,
} from "./contract-payment-fiscal-preparation.service";
import { ContractPaymentFiscalizationProcessor } from "./contract-payment-fiscalization.processor";

describe("ContractPaymentFiscalizationProcessor", () => {
  it("registers the dedicated worker and completes successful claims", async () => {
    let handler: ((job: any) => Promise<unknown>) | undefined;
    const workers = { registerWorker: jest.fn((_key, _queue, value) => { handler = value; }) };
    const fiscalization = {
      processClaim: jest.fn().mockResolvedValue(undefined),
      failClaim: jest.fn(),
      releaseClaimAfterWorkerFailure: jest.fn(),
    };
    const processor = new ContractPaymentFiscalizationProcessor(workers as never, fiscalization as never);
    processor.onModuleInit();

    await expect(handler!({
      name: "contract-payment-fiscalization-requested",
      data: { payload: { tenantId: "tenant-a", outboxEventId: "event-a", lockOwner: "owner-a", eventVersion: 1 } },
      attemptsMade: 0,
      opts: { attempts: 3 },
    })).resolves.toEqual({ completed: true });
    expect(fiscalization.processClaim).toHaveBeenCalledWith({ tenantId: "tenant-a", billingOutboxEventId: "event-a", lockOwner: "owner-a" });
  });

  it("marks a deterministic preparation error terminal without requesting worker retry", async () => {
    let handler: ((job: any) => Promise<unknown>) | undefined;
    const workers = { registerWorker: jest.fn((_key, _queue, value) => { handler = value; }) };
    const fiscalization = {
      processClaim: jest.fn().mockRejectedValue(new ContractPaymentFiscalPreparationError(CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.CLASSIFICATION_MISSING)),
      failClaim: jest.fn().mockResolvedValue(undefined),
      releaseClaimAfterWorkerFailure: jest.fn(),
    };
    const processor = new ContractPaymentFiscalizationProcessor(workers as never, fiscalization as never);
    processor.onModuleInit();
    await expect(handler!({
      name: "contract-payment-fiscalization-requested",
      data: { payload: { tenantId: "tenant-a", outboxEventId: "event-a", lockOwner: "owner-a", eventVersion: 1 } },
      attemptsMade: 0,
      opts: { attempts: 3 },
    })).rejects.toBeInstanceOf(UnrecoverableError);
    expect(fiscalization.failClaim).toHaveBeenCalledWith(
      { tenantId: "tenant-a", billingOutboxEventId: "event-a", lockOwner: "owner-a" },
      "CONTRACT_PAYMENT_FISCAL_CLASSIFICATION_MISSING",
    );
  });

  it("leaves retryable issuance allocation timeouts retryable", async () => {
    let handler: ((job: any) => Promise<unknown>) | undefined;
    const workers = { registerWorker: jest.fn((_key, _queue, value) => { handler = value; }) };
    const timeout = new ServiceUnavailableException({
      code: "BILLING_DOCUMENT_ALLOCATION_TRANSACTION_TIMEOUT",
    });
    const fiscalization = {
      processClaim: jest.fn().mockRejectedValue(timeout),
      failClaim: jest.fn(),
      releaseClaimAfterWorkerFailure: jest.fn(),
    };
    const processor = new ContractPaymentFiscalizationProcessor(workers as never, fiscalization as never);
    processor.onModuleInit();

    await expect(handler!({
      name: "contract-payment-fiscalization-requested",
      data: { payload: { tenantId: "tenant-a", outboxEventId: "event-a", lockOwner: "owner-a", eventVersion: 1 } },
      attemptsMade: 0,
      opts: { attempts: 3 },
    })).rejects.toBe(timeout);
    expect(fiscalization.failClaim).not.toHaveBeenCalled();
    expect(fiscalization.releaseClaimAfterWorkerFailure).not.toHaveBeenCalled();
  });
});
