import { Payment, PaymentPurpose, PaymentStatus, Prisma } from "@prisma/client";
import { Injectable } from "@nestjs/common";
import {
  CONTRACT_PAYMENT_FISCALIZATION_AGGREGATE_TYPE,
  CONTRACT_PAYMENT_FISCALIZATION_EVENT_TYPE,
  CONTRACT_PAYMENT_FISCALIZATION_EVENT_VERSION,
  contractPaymentFiscalizationOutboxKey,
} from "./contract-payment-fiscalization.constants";

const ELIGIBLE_PURPOSES = new Set<PaymentPurpose>([
  PaymentPurpose.CONTRACT_PAYMENT,
  PaymentPurpose.CONTRACT_RESERVATION,
  PaymentPurpose.CONTRACT_INSTALLMENT,
]);

/** Writes only an integration event; provider work is performed after commit. */
@Injectable()
export class ContractPaymentFiscalizationOutboxService {
  async enqueueConfirmedPaymentInTransaction(
    tx: Prisma.TransactionClient,
    payment: Payment,
  ): Promise<void> {
    if (!eligible(payment)) return;
    await tx.billingOutboxEvent.createMany({
      data: [{
        tenantId: payment.tenantId,
        eventType: CONTRACT_PAYMENT_FISCALIZATION_EVENT_TYPE,
        eventVersion: CONTRACT_PAYMENT_FISCALIZATION_EVENT_VERSION,
        aggregateType: CONTRACT_PAYMENT_FISCALIZATION_AGGREGATE_TYPE,
        aggregateId: payment.id,
        deduplicationKey: contractPaymentFiscalizationOutboxKey(payment.id),
        payload: {
          tenantId: payment.tenantId,
          paymentId: payment.id,
          eventVersion: CONTRACT_PAYMENT_FISCALIZATION_EVENT_VERSION,
        },
      }],
      skipDuplicates: true,
    });
  }
}

function eligible(payment: Payment): boolean {
  return (
    ELIGIBLE_PURPOSES.has(payment.purpose) &&
    payment.status === PaymentStatus.FULLY_ALLOCATED &&
    payment.contractId !== null &&
    payment.receiptNumber !== null &&
    payment.receiptNumber.trim().length > 0 &&
    payment.receivedAmount.greaterThan(0)
  );
}
