export const CONTRACT_PAYMENT_FISCALIZATION_EVENT_TYPE =
  "contract-payment.fiscalization-requested";
export const CONTRACT_PAYMENT_FISCALIZATION_EVENT_VERSION = 1;
export const CONTRACT_PAYMENT_FISCALIZATION_AGGREGATE_TYPE = "Payment";

export const CONTRACT_PAYMENT_FISCALIZATION_JOB_NAME =
  "contract-payment-fiscalization-requested";
export const CONTRACT_PAYMENT_FISCALIZATION_WORKER_REGISTRATION_KEY =
  "contract-payment-fiscalization";
export const CONTRACT_PAYMENT_FISCALIZATION_CONCURRENCY = 5;
export const CONTRACT_PAYMENT_FISCALIZATION_POLL_INTERVAL_MS = 1_000;
export const CONTRACT_PAYMENT_FISCALIZATION_BATCH_SIZE = 25;
export const CONTRACT_PAYMENT_FISCALIZATION_LEASE_MS = 60_000;
export const CONTRACT_PAYMENT_FISCALIZATION_RETRY_BASE_MS = 1_000;
export const CONTRACT_PAYMENT_FISCALIZATION_RETRY_MAX_MS = 60_000;

export interface ContractPaymentFiscalizationEventPayload {
  tenantId: string;
  paymentId: string;
  eventVersion: 1;
}

export function contractPaymentFiscalizationOutboxKey(paymentId: string): string {
  return `contract-payment:fiscalization-requested:${paymentId}:v1`;
}

export function contractPaymentFiscalizationJobId(
  outboxEventId: string,
  attemptCount: number,
  lockOwner: string,
): string {
  return `contract-payment-fiscalization-${outboxEventId}-${attemptCount}-${lockOwner}`;
}
