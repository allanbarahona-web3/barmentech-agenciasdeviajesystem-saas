export const FISCAL_TERMINAL_ARTIFACT_FANOUT_PARENT_EVENT_TYPE =
  "billing-document.fiscal-terminal";
export const FISCAL_TERMINAL_ARTIFACT_FANOUT_PARENT_EVENT_VERSION = 1;
export const FISCAL_TERMINAL_ARTIFACT_FANOUT_AGGREGATE_TYPE =
  "BillingDocument";

export const BILLING_DOCUMENT_ARTIFACT_RETRIEVAL_REQUESTED_EVENT_TYPE =
  "billing-document.artifact-retrieval-requested";
export const BILLING_DOCUMENT_ARTIFACT_RETRIEVAL_REQUESTED_EVENT_VERSION = 1;
export const FISCAL_TERMINAL_ARTIFACT_VERSION = 1;

export const FISCAL_TERMINAL_ARTIFACT_FANOUT_POLL_INTERVAL_MS = 1_000;
export const FISCAL_TERMINAL_ARTIFACT_FANOUT_BATCH_SIZE = 25;
export const FISCAL_TERMINAL_ARTIFACT_FANOUT_PROCESSING_LEASE_MS = 60_000;
export const FISCAL_TERMINAL_ARTIFACT_FANOUT_RETRY_BASE_MS = 1_000;
export const FISCAL_TERMINAL_ARTIFACT_FANOUT_RETRY_MAX_MS = 60_000;

export type FiscalTerminalArtifactType =
  | "SIGNED_FISCAL_XML"
  | "TAX_AUTHORITY_RESPONSE_XML";

export function billingDocumentArtifactRetrievalDeduplicationKey(
  billingDocumentId: string,
  artifactType: FiscalTerminalArtifactType,
): string {
  return artifactType === "SIGNED_FISCAL_XML"
    ? `billing-document.fiscal-terminal:signed-xml:${billingDocumentId}:v1`
    : `billing-document.fiscal-terminal:tax-response-xml:${billingDocumentId}:v1`;
}
