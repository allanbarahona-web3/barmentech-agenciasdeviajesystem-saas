export const SUPPORTED_QUEUE_EVENTS = [
  "waiting",
  "active",
  "progress",
  "completed",
  "failed",
  "stalled",
  "removed",
  "drained",
] as const;

export type SupportedQueueEvent = (typeof SUPPORTED_QUEUE_EVENTS)[number];

export const QUEUE_EVENTS_LOG_LEVELS = [
  "debug",
  "info",
  "warn",
] as const;

export type QueueEventsLogLevel = (typeof QUEUE_EVENTS_LOG_LEVELS)[number];
