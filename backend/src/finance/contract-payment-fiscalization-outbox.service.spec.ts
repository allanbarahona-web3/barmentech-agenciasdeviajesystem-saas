import { PaymentPurpose, PaymentStatus, Prisma } from "@prisma/client";
import { ContractPaymentFiscalizationOutboxService } from "./contract-payment-fiscalization-outbox.service";
import {
  CONTRACT_PAYMENT_FISCALIZATION_AGGREGATE_TYPE,
  CONTRACT_PAYMENT_FISCALIZATION_EVENT_TYPE,
  CONTRACT_PAYMENT_FISCALIZATION_EVENT_VERSION,
  contractPaymentFiscalizationOutboxKey,
} from "./contract-payment-fiscalization.constants";

describe("ContractPaymentFiscalizationOutboxService", () => {
  it.each([
    PaymentPurpose.CONTRACT_RESERVATION,
    PaymentPurpose.CONTRACT_PAYMENT,
    PaymentPurpose.CONTRACT_INSTALLMENT,
  ])("enqueues one confirmed %s payment with minimal payload", async (purpose) => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = new ContractPaymentFiscalizationOutboxService();

    await service.enqueueConfirmedPaymentInTransaction(
      { billingOutboxEvent: { createMany } } as never,
      payment({ purpose }),
    );

    expect(createMany).toHaveBeenCalledWith({
      data: [{
        tenantId: "tenant-a",
        eventType: CONTRACT_PAYMENT_FISCALIZATION_EVENT_TYPE,
        eventVersion: CONTRACT_PAYMENT_FISCALIZATION_EVENT_VERSION,
        aggregateType: CONTRACT_PAYMENT_FISCALIZATION_AGGREGATE_TYPE,
        aggregateId: "payment-a",
        deduplicationKey: "contract-payment:fiscalization-requested:payment-a:v1",
        payload: { tenantId: "tenant-a", paymentId: "payment-a", eventVersion: 1 },
      }],
      skipDuplicates: true,
    });
    expect(contractPaymentFiscalizationOutboxKey("payment-a")).toBe(
      "contract-payment:fiscalization-requested:payment-a:v1",
    );
  });

  it.each([
    [PaymentPurpose.GENERAL, PaymentStatus.FULLY_ALLOCATED],
    [PaymentPurpose.CONTRACT_PAYMENT, PaymentStatus.PENDING_VERIFICATION],
    [PaymentPurpose.CONTRACT_PAYMENT, PaymentStatus.REJECTED],
    [PaymentPurpose.CONTRACT_PAYMENT, PaymentStatus.CANCELLED],
  ])("does not enqueue %s/%s", async (purpose, status) => {
    const createMany = jest.fn();
    await new ContractPaymentFiscalizationOutboxService().enqueueConfirmedPaymentInTransaction(
      { billingOutboxEvent: { createMany } } as never,
      payment({ purpose, status }),
    );
    expect(createMany).not.toHaveBeenCalled();
  });
});

function payment(overrides: Partial<any> = {}) {
  return {
    id: "payment-a",
    tenantId: "tenant-a",
    purpose: PaymentPurpose.CONTRACT_PAYMENT,
    status: PaymentStatus.FULLY_ALLOCATED,
    contractId: "contract-a",
    receiptNumber: "RCP-1",
    receivedAmount: new Prisma.Decimal("113"),
    ...overrides,
  } as any;
}
