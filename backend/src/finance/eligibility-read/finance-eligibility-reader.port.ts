export const FINANCE_ELIGIBILITY_READER = Symbol("FINANCE_ELIGIBILITY_READER");

/**
 * Identifies a commercial origin without exposing Finance persistence identity.
 * Additional source types can be introduced without changing this read contract.
 */
export type CommercialSourceRef = {
  sourceType: "CONTRACT" | (string & {});
  sourceId: string;
  sourceLineId?: string;
  versionId?: string;
  opaqueSourceKey?: string;
};

export type ReadFinanceEligibilityRequest = {
  tenantId: string;
  sources: readonly CommercialSourceRef[];
};

export type FinanceEligibility = "ELIGIBLE" | "BLOCKED";

export type FinanceEligibilityReason =
  | "SETTLED"
  | "OUTSTANDING_BALANCE"
  | "CONTRACT_CANCELLED"
  | "CONTRACT_NOT_ACTIVE"
  | "FINANCIAL_DATA_MISSING";

/** Stable Finance-neutral summary; it deliberately does not mirror Prisma enums. */
export type EligibilityFinancialStatus =
  | "SETTLED"
  | "OUTSTANDING"
  | "CANCELLED"
  | "UNKNOWN";

export type FinanceEligibilityFinancialContext = {
  originalAmount: string;
  outstandingAmount: string;
  currency: string;
  financialStatus: EligibilityFinancialStatus;
  settledAt: Date | null;
  lastFinancialChangeAt: Date | null;
};

export type FinanceEligibilityResult = {
  source: CommercialSourceRef;
  eligibility: FinanceEligibility;
  reason: FinanceEligibilityReason;
  financial?: FinanceEligibilityFinancialContext;
};

/**
 * Finance-owned, source-agnostic authorization read boundary for supplier-spend
 * consumers. Implementations retain ownership of their financial lifecycle.
 */
export interface FinanceEligibilityReader {
  readMany(
    request: ReadFinanceEligibilityRequest,
  ): Promise<FinanceEligibilityResult[]>;
}
