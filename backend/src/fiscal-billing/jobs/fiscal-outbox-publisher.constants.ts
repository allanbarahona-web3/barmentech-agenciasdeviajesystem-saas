export const FISCAL_OUTBOX_EVENT_TYPE =
  "billing-document.electronic-issuance-requested";
export const FISCAL_OUTBOX_EVENT_VERSION = 1;
export const FISCAL_OUTBOX_AGGREGATE_TYPE = "BillingDocument";
export const FISCAL_ISSUANCE_JOB_NAME =
  "billing-document-electronic-issuance-requested";

export const FISCAL_OUTBOX_POLL_INTERVAL_MS = 1_000;
export const FISCAL_OUTBOX_BATCH_SIZE = 25;
export const FISCAL_OUTBOX_PROCESSING_LEASE_MS = 60_000;
export const FISCAL_OUTBOX_RETRY_BASE_MS = 1_000;
export const FISCAL_OUTBOX_RETRY_MAX_MS = 60_000;

export function fiscalIssuanceJobId(outboxEventId: string): string {
  return `fiscal-issuance-${outboxEventId}`;
}
