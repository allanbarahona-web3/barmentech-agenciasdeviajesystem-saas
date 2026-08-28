export const FISCAL_ARTIFACT_RETRIEVAL_JOB_NAME = 'billing-document-artifact-retrieval-requested';
export const FISCAL_ARTIFACT_RETRIEVAL_WORKER_REGISTRATION_KEY = 'fiscal-artifact-retrieval';
export const FISCAL_ARTIFACT_RETRIEVAL_CONCURRENCY = 5;
export const FISCAL_ARTIFACT_RETRIEVAL_POLL_INTERVAL_MS = 1_000;
export const FISCAL_ARTIFACT_RETRIEVAL_BATCH_SIZE = 25;
export const FISCAL_ARTIFACT_RETRIEVAL_LEASE_MS = 60_000;
export const FISCAL_ARTIFACT_RETRIEVAL_RETRY_BASE_MS = 1_000;
export const FISCAL_ARTIFACT_RETRIEVAL_RETRY_MAX_MS = 60_000;
export interface FiscalArtifactRetrievalJobPayload { tenantId: string; outboxEventId: string; lockOwner: string; eventVersion: 1; }
export function fiscalArtifactRetrievalJobId(id: string, attempt: number, owner: string) { return `fiscal-artifact-retrieval-${id}-${attempt}-${owner}`; }
