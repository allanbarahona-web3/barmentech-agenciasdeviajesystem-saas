import type { ExactDecimalString, ReportAmounts, ReportDocumentProjection, ReportTaxLine, ReportingProjection } from "../contracts/reporting.contracts";
import { multiplyDecimal } from "./exact-decimal";

export function presentationCurrency(currencyCode: string, request: ReportingProjection): string {
  return request.mode === "ORIGINAL" ? currencyCode : request.targetCurrencyCode;
}

export function projectAmounts(amounts: ReportAmounts, metadata: ReportDocumentProjection, request: ReportingProjection): ReportAmounts {
  if (request.mode === "ORIGINAL") return amounts;
  assertTarget(metadata, request);
  return mapAmounts(amounts, (value) => projectDecimal(value, metadata));
}

export function projectTaxLine(tax: ReportTaxLine, metadata: ReportDocumentProjection, request: ReportingProjection): ReportTaxLine {
  if (request.mode === "ORIGINAL") return tax;
  assertTarget(metadata, request);
  return {
    ...tax,
    taxableBase: projectDecimal(tax.taxableBase, metadata),
    grossTaxAmount: projectDecimal(tax.grossTaxAmount, metadata),
    ...(tax.exemptionAmount === undefined ? {} : { exemptionAmount: projectDecimal(tax.exemptionAmount, metadata) }),
    taxCollected: projectDecimal(tax.taxCollected, metadata),
  };
}

function projectDecimal(value: ExactDecimalString, metadata: ReportDocumentProjection): ExactDecimalString {
  if (metadata.operation === "IDENTITY") return value;
  if (metadata.operation === "MULTIPLY") return multiplyDecimal(value, metadata.rate);
  // Division requires an adapter-declared finite precision policy; no current MVP adapter uses it.
  throw new Error("REPORTING_PROJECTION_DIVISION_UNSUPPORTED");
}

function assertTarget(metadata: ReportDocumentProjection, request: Extract<ReportingProjection, { mode: "TARGET_CURRENCY" }>) {
  if (metadata.targetCurrencyCode !== request.targetCurrencyCode) throw new Error("REPORTING_PROJECTION_TARGET_UNAVAILABLE");
}

function mapAmounts(amounts: ReportAmounts, map: (value: ExactDecimalString) => ExactDecimalString): ReportAmounts {
  return { grossSales: map(amounts.grossSales), discounts: map(amounts.discounts), taxableSales: map(amounts.taxableSales), exemptSales: map(amounts.exemptSales), exoneratedSales: map(amounts.exoneratedSales), grossTax: map(amounts.grossTax), exoneratedTax: map(amounts.exoneratedTax), taxCollected: map(amounts.taxCollected), total: map(amounts.total) };
}
