import { GenericDispatchOptions } from "../../infrastructure/job-dispatcher";

export const RECEIPT_PROCESSING_JOB_NAME = "billing-process-verified-payment-receipt";

export const RECEIPT_PROCESSING_WORKER_REGISTRATION_KEY =
  "billing-receipt-processing-worker";

export const RECEIPT_PROCESSING_JOB_OPTIONS: Readonly<GenericDispatchOptions> = {
  attempts: 4,
  backoff: {
    type: "exponential",
    delay: 2000,
  },
  timeout: 120000,
};
