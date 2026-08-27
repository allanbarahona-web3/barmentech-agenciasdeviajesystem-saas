export const ACCOUNT_RECEIVABLE_RECOGNITION_JOB_NAME =
  "account-receivable-recognition-requested";
export const ACCOUNT_RECEIVABLE_RECOGNITION_WORKER_REGISTRATION_KEY =
  "account-receivable-recognition";
export const ACCOUNT_RECEIVABLE_RECOGNITION_CONCURRENCY = 5;
export const ACCOUNT_RECEIVABLE_RECOGNITION_POLL_INTERVAL_MS = 1_000;
export const ACCOUNT_RECEIVABLE_RECOGNITION_BATCH_SIZE = 25;
export const ACCOUNT_RECEIVABLE_RECOGNITION_LEASE_MS = 60_000;
export const ACCOUNT_RECEIVABLE_RECOGNITION_RETRY_BASE_MS = 1_000;
export const ACCOUNT_RECEIVABLE_RECOGNITION_RETRY_MAX_MS = 60_000;

export interface AccountReceivableRecognitionJobPayload {
  tenantId: string;
  outboxEventId: string;
  lockOwner: string;
  eventVersion: 1;
}

export function accountReceivableRecognitionJobId(
  outboxEventId: string,
  attemptCount: number,
  lockOwner: string,
): string {
  return `account-receivable-recognition-${outboxEventId}-${attemptCount}-${lockOwner}`;
}
