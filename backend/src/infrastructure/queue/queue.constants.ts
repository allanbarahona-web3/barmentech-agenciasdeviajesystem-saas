export const PLATFORM_QUEUE_KEYS = {
  BILLING: "billing",
  DOCUMENT: "document",
  EMAIL: "email",
  PDF: "pdf",
  NOTIFICATION: "notification",
} as const;

export type PlatformQueueKey =
  (typeof PLATFORM_QUEUE_KEYS)[keyof typeof PLATFORM_QUEUE_KEYS];

export const DEFAULT_QUEUE_NAMES: Record<PlatformQueueKey, string> = {
  billing: "billing",
  document: "document",
  email: "email",
  pdf: "pdf",
  notification: "notification",
};

export const QUEUE_NAME_ENV_KEYS: Record<PlatformQueueKey, string> = {
  billing: "BULLMQ_BILLING_QUEUE_NAME",
  document: "BULLMQ_DOCUMENT_QUEUE_NAME",
  email: "BULLMQ_EMAIL_QUEUE_NAME",
  pdf: "BULLMQ_PDF_QUEUE_NAME",
  notification: "BULLMQ_NOTIFICATION_QUEUE_NAME",
};
