export const FISCAL_STATUS_RECONCILIATION_JOB_NAME="billing-document-electronic-status-reconciliation";
export const FISCAL_STATUS_RECONCILIATION_EVENT_VERSION=1 as const;
export const FISCAL_STATUS_RECONCILIATION_BATCH_SIZE=25;
export const FISCAL_STATUS_RECONCILIATION_POLL_INTERVAL_MS=1_000;
export const FISCAL_STATUS_RECONCILIATION_LEASE_MS=60_000;
export const FISCAL_STATUS_RECONCILIATION_CONCURRENCY=5;
export const FISCAL_STATUS_RECONCILIATION_WORKER_KEY="fiscal-status-reconciliation";

export function fiscalStatusReconciliationJobId(statusCheckLockOwner:string):string{
  return `fiscal-status-${statusCheckLockOwner}`;
}
