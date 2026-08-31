export const FISCAL_INVOICE_AUTO_DELIVERY_JOB_NAME =
  "billing-document-invoice-auto-delivery-requested";
export const FISCAL_INVOICE_AUTO_DELIVERY_WORKER_REGISTRATION_KEY =
  "fiscal-invoice-auto-delivery";
export const FISCAL_INVOICE_AUTO_DELIVERY_CONCURRENCY = 5;
export const FISCAL_INVOICE_AUTO_DELIVERY_POLL_INTERVAL_MS = 1_000;
export const FISCAL_INVOICE_AUTO_DELIVERY_BATCH_SIZE = 25;
export const FISCAL_INVOICE_AUTO_DELIVERY_LEASE_MS = 60_000;
export const FISCAL_INVOICE_AUTO_DELIVERY_RETRY_BASE_MS = 1_000;
export const FISCAL_INVOICE_AUTO_DELIVERY_RETRY_MAX_MS = 60_000;

export interface FiscalInvoiceAutoDeliveryJobPayload {
  tenantId: string;
  outboxEventId: string;
  lockOwner: string;
  eventVersion: 1;
}

export function fiscalInvoiceAutoDeliveryJobId(
  outboxEventId: string,
  attemptCount: number,
  lockOwner: string,
): string {
  return `fiscal-invoice-auto-delivery-${outboxEventId}-${attemptCount}-${lockOwner}`;
}
