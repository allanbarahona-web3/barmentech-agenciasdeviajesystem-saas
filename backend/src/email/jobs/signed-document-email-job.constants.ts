import { GenericDispatchOptions } from "../../infrastructure/job-dispatcher";

export const SIGNED_DOCUMENT_EMAIL_JOB_NAMES = {
  AUTOMATIC_DELIVERY: "signed-document-automatic-delivery-email",
  MANUAL_RESEND: "signed-document-manual-resend-email",
} as const;

export type SignedDocumentEmailJobName =
  (typeof SIGNED_DOCUMENT_EMAIL_JOB_NAMES)[keyof typeof SIGNED_DOCUMENT_EMAIL_JOB_NAMES];

export const SIGNED_DOCUMENT_EMAIL_JOB_OPTIONS: Readonly<GenericDispatchOptions> = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 2000,
  },
  timeout: 60000,
};
