import type {
  BillingDocumentDraftCommand,
  BillingDocumentFiscalPreparation,
  BillingDocumentFiscalAllocationResult,
  BillingDocumentIssuancePreflight,
  BillingDocumentWorkspace,
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
  findIssuancePreflight(
    tenantId: string,
    billingDocumentId: string,
  ): Promise<BillingDocumentIssuancePreflight | null>;
  requestElectronicIssuance(
    tenantId: string,
    billingDocumentId: string,
    actorUserId: string,
    preparation: BillingDocumentFiscalPreparation | null,
  ): Promise<BillingDocumentFiscalAllocationResult>;
  findWorkspace(tenantId: string, documentId: string): Promise<BillingDocumentWorkspace | null>;
}
