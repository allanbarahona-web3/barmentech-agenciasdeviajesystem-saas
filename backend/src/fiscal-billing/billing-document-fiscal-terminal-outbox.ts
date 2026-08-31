import { Prisma } from "@prisma/client";

export const BILLING_DOCUMENT_FISCAL_TERMINAL_EVENT_TYPE =
  "billing-document.fiscal-terminal";
export const BILLING_DOCUMENT_FISCAL_TERMINAL_EVENT_VERSION = 1;
export const BILLING_DOCUMENT_FISCAL_TERMINAL_AGGREGATE_TYPE =
  "BillingDocument";

export function billingDocumentFiscalTerminalDeduplicationKey(
  billingDocumentId: string,
): string {
  return `billing-document.fiscal-terminal:${billingDocumentId}:v1`;
}

export async function persistBillingDocumentFiscalTerminalOutboxEvent(
  tx: Prisma.TransactionClient,
  tenantId: string,
  billingDocumentId: string,
): Promise<void> {
  await tx.billingOutboxEvent.createMany({
    data: {
      tenantId,
      eventType: BILLING_DOCUMENT_FISCAL_TERMINAL_EVENT_TYPE,
      eventVersion: BILLING_DOCUMENT_FISCAL_TERMINAL_EVENT_VERSION,
      aggregateType: BILLING_DOCUMENT_FISCAL_TERMINAL_AGGREGATE_TYPE,
      aggregateId: billingDocumentId,
      deduplicationKey:
        billingDocumentFiscalTerminalDeduplicationKey(billingDocumentId),
      payload: {
        tenantId,
        billingDocumentId,
        eventVersion: BILLING_DOCUMENT_FISCAL_TERMINAL_EVENT_VERSION,
      },
    },
    skipDuplicates: true,
  });
}
