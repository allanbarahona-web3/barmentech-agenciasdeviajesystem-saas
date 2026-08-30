export const FISCAL_ACCEPTED_FANOUT_PARENT_EVENT_TYPE =
  "billing-document.fiscal-accepted";
export const FISCAL_ACCEPTED_FANOUT_PARENT_EVENT_VERSION = 1;
export const FISCAL_ACCEPTED_FANOUT_AGGREGATE_TYPE = "BillingDocument";

export const ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_TYPE =
  "account-receivable.recognition-requested";
export const ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_VERSION = 1;

export const FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_TYPE =
  "billing-document.invoice-auto-delivery-requested";
export const FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_VERSION = 1;

export const FISCAL_ACCEPTED_FANOUT_POLL_INTERVAL_MS = 1_000;
export const FISCAL_ACCEPTED_FANOUT_BATCH_SIZE = 25;
export const FISCAL_ACCEPTED_FANOUT_PROCESSING_LEASE_MS = 60_000;
export const FISCAL_ACCEPTED_FANOUT_RETRY_BASE_MS = 1_000;
export const FISCAL_ACCEPTED_FANOUT_RETRY_MAX_MS = 60_000;

export function accountReceivableRecognitionDeduplicationKey(
  billingDocumentId: string,
): string {
  return `billing-document.fiscal-accepted:receivable:${billingDocumentId}:v1`;
}

export function fiscalInvoiceAutoDeliveryDeduplicationKey(
  billingDocumentId: string,
): string {
  return `billing-document.invoice-auto-delivery:${billingDocumentId}:v1`;
}
