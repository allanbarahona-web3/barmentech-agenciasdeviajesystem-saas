import { GenericDispatchOptions } from "../../infrastructure/job-dispatcher";

export const CONTRACTS_EMAIL_JOB_NAMES = {
  CONTRACT_REVIEW: "contract-review-email",
  SIGNING_INVITATION: "contract-signing-invitation-email",
  SIGNING_SESSION_INVITATION: "contract-signing-session-invitation-email",
} as const;

export type ContractsEmailJobName =
  (typeof CONTRACTS_EMAIL_JOB_NAMES)[keyof typeof CONTRACTS_EMAIL_JOB_NAMES];

export const CONTRACTS_EMAIL_JOB_OPTIONS: Readonly<GenericDispatchOptions> = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
  timeout: 30000,
};
