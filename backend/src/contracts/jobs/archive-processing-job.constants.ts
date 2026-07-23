import { GenericDispatchOptions } from "../../infrastructure/job-dispatcher";

export const ARCHIVE_PROCESSING_JOB_NAME =
  "contract-archive-processing";

export const ARCHIVE_PROCESSING_WORKER_REGISTRATION_KEY =
  "contract-archive-processing-worker";

export const ARCHIVE_PROCESSING_JOB_OPTIONS: Readonly<GenericDispatchOptions> = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
  timeout: 30000,
};
