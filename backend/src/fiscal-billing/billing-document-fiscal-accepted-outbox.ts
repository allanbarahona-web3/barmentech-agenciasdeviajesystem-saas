import { Prisma } from "@prisma/client";

export const BILLING_DOCUMENT_FISCAL_ACCEPTED_EVENT_TYPE =
  "billing-document.fiscal-accepted";
export const BILLING_DOCUMENT_FISCAL_ACCEPTED_EVENT_VERSION = 1;
export const BILLING_DOCUMENT_FISCAL_ACCEPTED_AGGREGATE_TYPE = "BillingDocument";

export function billingDocumentFiscalAcceptedDeduplicationKey(
  billingDocumentId: string,
): string {
  return `billing-document.fiscal-accepted:${billingDocumentId}:v1`;
}

export async function persistBillingDocumentFiscalAcceptedOutboxEvent(
  tx: Prisma.TransactionClient,
  tenantId: string,
  billingDocumentId: string,
): Promise<void> {
  await tx.billingOutboxEvent.createMany({
    data: {
      tenantId,
      eventType: BILLING_DOCUMENT_FISCAL_ACCEPTED_EVENT_TYPE,
      eventVersion: BILLING_DOCUMENT_FISCAL_ACCEPTED_EVENT_VERSION,
      aggregateType: BILLING_DOCUMENT_FISCAL_ACCEPTED_AGGREGATE_TYPE,
      aggregateId: billingDocumentId,
      deduplicationKey:
        billingDocumentFiscalAcceptedDeduplicationKey(billingDocumentId),
      payload: {
        tenantId,
        billingDocumentId,
        eventVersion: BILLING_DOCUMENT_FISCAL_ACCEPTED_EVENT_VERSION,
      },
    },
    skipDuplicates: true,
  });
}
