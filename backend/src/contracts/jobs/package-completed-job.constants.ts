export const PACKAGE_COMPLETED_JOB_NAME = "package-completed";
export const PACKAGE_COMPLETED_WORKER_REGISTRATION_KEY =
  "package-completed-worker";
export const PACKAGE_COMPLETED_QUEUE_EVENTS_REGISTRATION_KEY =
  "package-completed-events";
export const PACKAGE_COMPLETED_EVENT_VERSION = 1;

export function getPackageCompletedJobId(
  documentSigningSessionId: string,
): string {
  return `package-completed-${documentSigningSessionId}`;
}
