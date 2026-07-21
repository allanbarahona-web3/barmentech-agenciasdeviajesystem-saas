import { GenericDispatchOptions } from "../../infrastructure/job-dispatcher";

export const AUTH_EMAIL_JOB_NAMES = {
  WELCOME: "auth-welcome-email",
  PASSWORD_RESET: "auth-password-reset-email",
  ADMIN_PASSWORD_RESET: "auth-admin-password-reset-email",
} as const;

export type AuthEmailJobName =
  (typeof AUTH_EMAIL_JOB_NAMES)[keyof typeof AUTH_EMAIL_JOB_NAMES];

export const AUTH_EMAIL_JOB_OPTIONS: Readonly<GenericDispatchOptions> = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
  timeout: 30000,
};

export const AUTH_EMAIL_WORKER_REGISTRATION_KEY = "auth-email-worker";
