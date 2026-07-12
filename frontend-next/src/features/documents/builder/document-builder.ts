import { ContractFormState } from "@/features/contracts-form/types";
import {
  buildContractPdfHtml,
  type TenantLegalInfo,
  type BankAccountForContract,
} from "@/features/contracts-form/pdf-template";

/**
 * Document types supported by the Document Framework.
 */
export enum DocumentType {
  CONTRACT = "CONTRACT",
  MINOR_ANNEX = "MINOR_ANNEX",
  LIABILITY_WAIVER = "LIABILITY_WAIVER",
}

/**
 * A generated document within a document package.
 */
export interface GeneratedDocument {
  /** Unique identifier for this document instance */
  id: string;
  /** Type of document */
  type: DocumentType;
  /** Human-readable title */
  title: string;
  /** Generated HTML content */
  html: string;
  /** Whether this document is required for the package */
  required: boolean;
}

/**
 * Document package returned by the Document Builder.
 * 
 * Contains a collection of generated documents for the contract package.
 */
export interface DocumentPackage {
  /** Collection of generated documents */
  documents: GeneratedDocument[];
}

/**
 * Document Builder - Single entry point for document generation.
 * 
 * This is the public API for the Document Framework.
 * 
 * Currently generates only the main contract document.
 * Future versions will conditionally generate multiple documents based on business rules.
 * 
 * @param state - Contract form state
 * @param assets - Logo and signature images
 * @param tenantLegalInfo - Tenant legal configuration
 * @param bankAccounts - Bank accounts for payment information
 * @returns Document package with collection of generated documents
 */
export function buildDocumentPackage(
  state: ContractFormState,
  assets: { logoSrc: string | null; representativeSignSrc: string | null },
  tenantLegalInfo: TenantLegalInfo | null,
  bankAccounts: BankAccountForContract[] = [],
): DocumentPackage {
  // Generate the main contract document
  const contractHtml = buildContractPdfHtml(
    state,
    assets,
    tenantLegalInfo,
    bankAccounts,
  );

  // Return a generic document package
  // For now, only the CONTRACT document is included
  // Future stories will add conditional documents (Minor Annex, Liability Waiver, etc.)
  return {
    documents: [
      {
        id: `contract-${state.contractNumber}`,
        type: DocumentType.CONTRACT,
        title: "Travel Contract",
        html: contractHtml,
        required: true,
      },
    ],
  };
}
