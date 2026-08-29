import { ContractFormState } from "@/features/contracts-form/types";
import { formatBusinessDate } from "@/shared/regional";
import { getClientIdentificationTypeLabel } from '@/features/customers/client-identification';

/**
 * Helper functions for HTML generation.
 * These are exported for use by document renderers in the Document Framework.
 */

export const esc = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const formatDate = formatBusinessDate;

export const formatMoney = (value: string): string => {
  const amount = Number.parseFloat(String(value || "").trim());
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
};

export const escapeAttr = (value: unknown): string => esc(value);

export const getResponsibleAdultIdentity = (
  state: ContractFormState,
  travelingWith: string,
): { idType: string; idNumber: string } => {
  if (travelingWith === state.clientFullName) {
    return {
      idType: getClientIdentificationTypeLabel(state.clientIdType),
      idNumber: state.clientIdNumber,
    };
  }

  const companion = state.companions.find((item) => item.fullName === travelingWith);
  if (companion) {
    return {
      idType: getClientIdentificationTypeLabel(companion.idType),
      idNumber: companion.idNumber,
    };
  }

  return { idType: "ID", idNumber: "" };
};

export type TenantLegalInfo = {
  name: string;
  contactPhone: string | null;
  contactWhatsApp: string | null;
  contactEmail: string | null;
  businessAddress: string | null;
  legalName: string | null;
  legalId: string | null;
  representativeName: string | null;
  representativeId: string | null;
  representativeTitle: string | null;
  representativeMaritalStatus: string | null;
  representativeAddress: string | null;
  representativePowers: string | null;
};

export type BankAccountForContract = {
  bankName: string;
  accountNumber: string;
  accountType: string;
  currency: string;
  sinpeNumber?: string | null;
  accountHolderName: string;
};

/**
 * Re-export the contract document renderer from the Document Framework.
 * 
 * This file now acts as a compatibility layer to maintain the existing public API
 * while the implementation has been moved to the Document Framework structure.
 */
export { buildContractPdfHtml } from "@/features/documents/contract/contract-document";
