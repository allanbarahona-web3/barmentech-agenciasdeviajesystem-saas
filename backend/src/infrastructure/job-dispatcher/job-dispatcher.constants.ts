export const JOB_DISPATCHER_LOG_LEVELS = [
  "debug",
  "info",
  "warn",
] as const;

export type JobDispatcherLogLevel =
  (typeof JOB_DISPATCHER_LOG_LEVELS)[number];
