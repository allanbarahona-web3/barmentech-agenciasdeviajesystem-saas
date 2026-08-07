/**
 * Shared Template Components
 * 
 * Centralized exports for all reusable document template components.
 * These components can be used across all document types:
 * - Contracts
 * - Minor Authorizations
 * - Insurance Waivers
 * - Future legal documents
 */

// Helper functions
export {
  escapeHtml,
  escapeAttribute,
  formatDate,
  formatMoney,
  contractValue,
  padNumber,
  clause,
  signatureBlock,
  companySignatureBlock,
} from "./template-helpers";

// Document styles
export { documentStyles } from "./document-styles";

// Header components
export {
  documentHeader,
  documentTitle,
  documentMetadataTable,
  sectionHeading,
} from "./document-header";

export type { CompanyInfo, DocumentMetadata } from "./document-header";

// Footer components
export { documentFooter } from "./document-footer";

// Signature components
export {
  signaturePage,
  minorAuthorizationAnnex,
  liabilityWaiverDocument,
} from "./signature-components";

export type { SignerInfo, CompanySignerInfo } from "./signature-components";

// Base layout
export { documentLayout } from "./document-layout";

export type { DocumentLayoutOptions } from "./document-layout";
