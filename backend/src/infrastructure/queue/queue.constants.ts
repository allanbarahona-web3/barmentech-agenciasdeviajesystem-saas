export const PLATFORM_QUEUE_KEYS = {
  BILLING: "billing",
  DOCUMENT: "document",
  EMAIL: "email",
  FISCAL_BILLING: "fiscal-billing",
  FISCAL_STATUS_RECONCILIATION: "fiscal-status-reconciliation",
  FISCAL_REFRESH_RECONCILIATION: "fiscal-refresh-reconciliation",
  ACCOUNT_RECEIVABLE_RECOGNITION: "account-receivable-recognition",
  FISCAL_ARTIFACT_RETRIEVAL: "fiscal-artifact-retrieval",
  PDF: "pdf",
  NOTIFICATION: "notification",
  PACKAGE_COMPLETED: "package-completed",
  WORKER_RUNTIME: "worker-runtime",
} as const;

export type PlatformQueueKey =
  (typeof PLATFORM_QUEUE_KEYS)[keyof typeof PLATFORM_QUEUE_KEYS];

export const DEFAULT_QUEUE_NAMES: Record<PlatformQueueKey, string> = {
  billing: "billing",
  document: "document",
  email: "email",
  "fiscal-billing": "fiscal-billing",
  "fiscal-status-reconciliation": "fiscal-status-reconciliation",
  "fiscal-refresh-reconciliation": "fiscal-refresh-reconciliation",
  "account-receivable-recognition": "account-receivable-recognition",
  "fiscal-artifact-retrieval": "fiscal-artifact-retrieval",
  pdf: "pdf",
  notification: "notification",
  "package-completed": "package-completed",
  "worker-runtime": "worker-runtime",
};

export const QUEUE_NAME_ENV_KEYS: Record<PlatformQueueKey, string> = {
  billing: "BULLMQ_BILLING_QUEUE_NAME",
  document: "BULLMQ_DOCUMENT_QUEUE_NAME",
  email: "BULLMQ_EMAIL_QUEUE_NAME",
  "fiscal-billing": "BULLMQ_FISCAL_BILLING_QUEUE_NAME",
  "fiscal-status-reconciliation":
    "BULLMQ_FISCAL_STATUS_RECONCILIATION_QUEUE_NAME",
  "fiscal-refresh-reconciliation":
    "BULLMQ_FISCAL_REFRESH_RECONCILIATION_QUEUE_NAME",
  "account-receivable-recognition":
    "BULLMQ_ACCOUNT_RECEIVABLE_RECOGNITION_QUEUE_NAME",
  "fiscal-artifact-retrieval": "BULLMQ_FISCAL_ARTIFACT_RETRIEVAL_QUEUE_NAME",
  pdf: "BULLMQ_PDF_QUEUE_NAME",
  notification: "BULLMQ_NOTIFICATION_QUEUE_NAME",
  "package-completed": "BULLMQ_PACKAGE_COMPLETED_QUEUE_NAME",
  "worker-runtime": "BULLMQ_WORKER_RUNTIME_QUEUE_NAME",
};
