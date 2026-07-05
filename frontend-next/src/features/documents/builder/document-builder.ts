import { ContractFormState } from "@/features/contracts-form/types";
import {
  buildContractPdfHtml,
  type TenantLegalInfo,
  type BankAccountForContract,
} from "@/features/contracts-form/pdf-template";

/**
 * Document package returned by the Document Builder.
 * 
 * Contains all generated HTML documents for the contract package.
 */
export interface DocumentPackage {
  contractHtml: string;
  minorAnnexHtml: string | null;
  liabilityWaiverHtml: string | null;
}

/**
 * Document Builder - Single entry point for document generation.
 * 
 * This is the public API for the Document Framework.
 * 
 * Currently delegates to the existing contract renderer.
 * Future versions will conditionally generate multiple documents based on business rules.
 * 
 * @param state - Contract form state
 * @param assets - Logo and signature images
 * @param tenantLegalInfo - Tenant legal configuration
 * @param bankAccounts - Bank accounts for payment information
 * @returns Document package with all generated HTML documents
 */
export function buildDocumentPackage(
  state: ContractFormState,
  assets: { logoSrc: string | null; representativeSignSrc: string | null },
  tenantLegalInfo: TenantLegalInfo | null,
  bankAccounts: BankAccountForContract[] = [],
): DocumentPackage {
  // Currently, the builder simply delegates to the existing contract renderer
  // The contract HTML already includes minor annexes via buildMinorAnnexHtml()
  const contractHtml = buildContractPdfHtml(
    state,
    assets,
    tenantLegalInfo,
    bankAccounts,
  );

  return {
    contractHtml,
    minorAnnexHtml: null,
    liabilityWaiverHtml: null,
  };
}
