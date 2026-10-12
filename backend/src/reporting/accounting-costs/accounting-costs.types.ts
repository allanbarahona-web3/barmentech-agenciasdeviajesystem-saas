import type { Prisma } from "@prisma/client";
import type { ReportExecutionContext, ResolvedReportingPeriod } from "../contracts/reporting.contracts";

export const ACCOUNTING_COST_SOURCE_TYPES = ["OPERATIONAL_PURCHASE"] as const;
export type AccountingCostSourceType = typeof ACCOUNTING_COST_SOURCE_TYPES[number];
export type AccountingCostCounterpartyKind = "SUPPLIER" | "EMPLOYEE" | "INSTITUTION" | "OTHER";
export type AccountingCostConversionStatus = "IDENTITY" | "AVAILABLE" | "FX_MISSING";

export type AccountingCostFilter = {
  sourceType?: AccountingCostSourceType;
  counterpartySearch?: string;
  currency?: string;
  servicePurposeCode?: string;
  status?: string;
};

export type OperationalPurchaseAccountingCostFilter = {
  travelPackageId?: string;
  customerId?: string;
};

export type AccountingCostReadRequest = {
  page: number;
  pageSize: number;
  filter?: AccountingCostFilter;
  operational?: OperationalPurchaseAccountingCostFilter;
};

export type AccountingCostSourceContext = {
  sourceCategory: "BASE_TRIP" | "ADDITIONAL_SERVICES" | "CUSTOM_QUOTATION" | "OTHER";
  travelPackageId?: string;
  travelPackage?: { name: string; code: string };
  customer?: { id: string; name: string };
  quotation?: { id: string; versionId: string; versionNumber: number; number: string | null };
  salesOrderNumber?: string;
  servicePurpose: { code: string; name: string };
  requirementDescription: string;
};

export type AccountingCostConversion = {
  status: AccountingCostConversionStatus;
  baseCurrency: string;
  exchangeRate: string | null;
  subtotal: string | null;
  tax: string | null;
  total: string | null;
  authority: "IDENTITY" | "BCCR_REFERENCE_SELL_318" | "MANUAL_SELL" | null;
  effectiveOn: string;
  operation: "IDENTITY" | "MULTIPLY" | "DIVIDE" | null;
};

export type AccountingCostRow = {
  sourceType: AccountingCostSourceType;
  sourceId: string;
  sourceDate: Date;
  description: string;
  counterparty: { kind: AccountingCostCounterpartyKind; name: string };
  subtotal: string;
  tax: string;
  total: string;
  currency: string;
  conversion: AccountingCostConversion;
  reference: { supplierReference: string | null; documentNumber: string | null };
  evidence: { available: boolean; count: number };
  status: string;
  cancelled: boolean;
  context: AccountingCostSourceContext;
};

export type AccountingCostSummaryRow = {
  currency: string;
  effectiveOn: string;
  count: number;
  subtotal: Prisma.Decimal;
  tax: Prisma.Decimal;
};

export type AccountingCostSourcePage = { items: readonly AccountingCostRow[]; totalItems: number };
export type AccountingCostSourceReader = {
  readonly sourceType: AccountingCostSourceType;
  readPage(context: ReportExecutionContext, period: ResolvedReportingPeriod, request: AccountingCostReadRequest): Promise<AccountingCostSourcePage>;
  readSummary(context: ReportExecutionContext, period: ResolvedReportingPeriod, request: AccountingCostReadRequest): Promise<readonly AccountingCostSummaryRow[]>;
};
