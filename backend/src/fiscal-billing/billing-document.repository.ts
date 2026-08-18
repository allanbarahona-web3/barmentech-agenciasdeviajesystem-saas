import type {
  BillingDocumentDraftCommand,
  PrimaryDocumentSummary,
} from "./billing-document.types";

export const BILLING_DOCUMENT_REPOSITORY = Symbol(
  "BILLING_DOCUMENT_REPOSITORY",
);

export interface BillingDocumentRepository {
  findPrimaryDocument(
    tenantId: string,
    sourceType: string,
    sourceId: string,
  ): Promise<PrimaryDocumentSummary | null>;
  createDraft(
    command: BillingDocumentDraftCommand,
  ): Promise<PrimaryDocumentSummary>;
  findWorkspace(tenantId: string, documentId: string): Promise<unknown | null>;
}
