import { Inject, Injectable } from "@nestjs/common";
import {
  REPORT_DOCUMENT_READER,
  REPORT_TAX_AGGREGATION_READER,
  type ExactDecimalString,
  type ReportDocumentReader,
  type ReportDocumentReadFilter,
  type ReportExecutionContext,
  type ReportTaxAggregationReader,
  type ReportTaxLine,
  type ReportingProjection,
  type ResolvedReportingPeriod,
} from "../contracts/reporting.contracts";
import { addDecimal, applyDecimalEffect } from "../core/exact-decimal";
import { presentationCurrency, projectAmounts, projectTaxLine } from "../core/report-projection";

export interface SalesTaxReportRequest { page: number; pageSize: number; filter?: ReportDocumentReadFilter; projection?: ReportingProjection; }

export interface SalesTaxReportTaxGroup {
  taxCode: string;
  rateCode?: string;
  rate: ExactDecimalString;
  documentCount: number;
  taxableBase: ExactDecimalString;
  grossTaxAmount: ExactDecimalString;
  /** Present only when the adapter persisted an explicit tax-line exemption amount. */
  exemptionAmount?: ExactDecimalString;
  taxCollected: ExactDecimalString;
}

export interface SalesTaxReportResult {
  reportKey: "SALES_TAX";
  period: ResolvedReportingPeriod;
  generatedAt: string;
  projectionMode: "ORIGINAL" | "CRC";
  presentationCurrencyCode?: string;
  /** Header totals remain full-document values when detail is restricted by a tax-line match. */
  headerTotalsScope: "ALL_FILTERED_DOCUMENTS" | "DOCUMENTS_MATCHING_TAX_FILTER";
  currencies: Array<{
    currencyCode: string;
    documentCount: number;
    /** Exact header-level values; they are intentionally not assigned to a tax-rate group. */
    exemptSales: ExactDecimalString;
    exoneratedSales: ExactDecimalString;
    grossTax: ExactDecimalString;
    exoneratedTax: ExactDecimalString;
    taxCollected: ExactDecimalString;
    taxGroups: SalesTaxReportTaxGroup[];
  }>;
  documents: Array<{
    documentId: string;
    documentNumber: string;
    documentTypeCode: string;
    issuedOn: string;
    customer: { name: string | null; identificationType: string | null; identification: string | null };
    currencyCode: string;
    originalCurrencyCode: string;
    originalAmounts: import("../contracts/reporting.contracts").ReportAmounts;
    projection: import("../contracts/reporting.contracts").ReportDocumentProjection;
    effect: "INCREASE" | "DECREASE";
    taxableSales: ExactDecimalString;
    exemptSales: ExactDecimalString;
    exoneratedSales: ExactDecimalString;
    grossTax: ExactDecimalString;
    exoneratedTax: ExactDecimalString;
    taxCollected: ExactDecimalString;
    total: ExactDecimalString;
    taxes: readonly ReportTaxLine[];
  }>;
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

type CurrencySummary = Omit<SalesTaxReportResult["currencies"][number], "currencyCode" | "taxGroups"> & {
  taxGroups: Map<string, MutableTaxGroup>;
};

type MutableTaxGroup = SalesTaxReportTaxGroup & { hasExemptionAmount: boolean };

/** Generic tax aggregation over reporting ports only; it has no ERP or country persistence imports. */
@Injectable()
export class SalesTaxReportService {
  constructor(
    @Inject(REPORT_DOCUMENT_READER) private readonly documents: ReportDocumentReader,
    @Inject(REPORT_TAX_AGGREGATION_READER) private readonly taxes: ReportTaxAggregationReader,
  ) {}

  async execute(
    context: ReportExecutionContext,
    period: ResolvedReportingPeriod,
    request: SalesTaxReportRequest,
  ): Promise<SalesTaxReportResult> {
    const projection = request.projection ?? { mode: "ORIGINAL" } as const;
    const [headers, taxAggregates, documentPage] = await Promise.all([
      this.documents.readDocumentAggregates(context, period, request.filter),
      this.taxes.readTaxAggregation(context, period, request.filter),
      this.documents.readDocumentPage(context, period, { page: request.page, pageSize: request.pageSize, ...(request.filter ? { filter: request.filter } : {}), includeTaxes: true }),
    ]);
    const currencies = new Map<string, CurrencySummary>();

    for (const header of headers) {
      const currencyCode = presentationCurrency(header.currencyCode, projection);
      const amounts = projectAmounts(header.amounts, header.projection, projection);
      const current = currencySummary(currencies.get(currencyCode));
      current.documentCount += header.documentCount;
      current.exemptSales = sumEffect(current.exemptSales, amounts.exemptSales, header.effect);
      current.exoneratedSales = sumEffect(current.exoneratedSales, amounts.exoneratedSales, header.effect);
      current.grossTax = sumEffect(current.grossTax, amounts.grossTax, header.effect);
      current.exoneratedTax = sumEffect(current.exoneratedTax, amounts.exoneratedTax, header.effect);
      current.taxCollected = sumEffect(current.taxCollected, amounts.taxCollected, header.effect);
      currencies.set(currencyCode, current);
    }

    for (const aggregate of taxAggregates) {
      const currencyCode = presentationCurrency(aggregate.currencyCode, projection);
      const currency = currencySummary(currencies.get(currencyCode));
      const tax = projectTaxLine(aggregate.tax, aggregate.projection, projection);
      const key = taxGroupKey(tax);
      const group = currency.taxGroups.get(key) ?? newTaxGroup(tax);
      group.documentCount += aggregate.documentCount;
      group.taxableBase = sumEffect(group.taxableBase, tax.taxableBase, aggregate.effect);
      group.grossTaxAmount = sumEffect(group.grossTaxAmount, tax.grossTaxAmount, aggregate.effect);
      group.taxCollected = sumEffect(group.taxCollected, tax.taxCollected, aggregate.effect);
      if (tax.exemptionAmount !== undefined) {
        group.exemptionAmount = sumEffect(group.exemptionAmount ?? "0", tax.exemptionAmount, aggregate.effect);
        group.hasExemptionAmount = true;
      }
      currency.taxGroups.set(key, group);
      currencies.set(currencyCode, currency);
    }

    return {
      reportKey: "SALES_TAX",
      projectionMode: projection.mode === "ORIGINAL" ? "ORIGINAL" : "CRC",
      ...(projection.mode === "TARGET_CURRENCY" ? { presentationCurrencyCode: projection.targetCurrencyCode } : {}),
      period,
      generatedAt: new Date().toISOString(),
      headerTotalsScope: hasTaxFilter(request.filter) ? "DOCUMENTS_MATCHING_TAX_FILTER" : "ALL_FILTERED_DOCUMENTS",
      currencies: [...currencies.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currencyCode, summary]) => ({
        currencyCode,
        documentCount: summary.documentCount,
        exemptSales: summary.exemptSales,
        exoneratedSales: summary.exoneratedSales,
        grossTax: summary.grossTax,
        exoneratedTax: summary.exoneratedTax,
        taxCollected: summary.taxCollected,
        taxGroups: [...summary.taxGroups.values()]
          .sort((left, right) => taxGroupKey(left).localeCompare(taxGroupKey(right)))
          .map(({ hasExemptionAmount, ...group }) => hasExemptionAmount ? group : omitExemptionAmount(group)),
      })),
      documents: documentPage.items.map((document) => {
        const amounts = projectAmounts(document.amounts, document.projection, projection);
        return ({
        documentId: document.documentId,
        documentNumber: document.documentNumber,
        documentTypeCode: document.documentTypeCode,
        issuedOn: document.issuedOn,
        customer: document.customer,
        currencyCode: presentationCurrency(document.currencyCode, projection), originalCurrencyCode: document.currencyCode, originalAmounts: document.amounts, projection: document.projection,
        effect: document.effect,
        taxableSales: amounts.taxableSales,
        exemptSales: amounts.exemptSales,
        exoneratedSales: amounts.exoneratedSales,
        grossTax: amounts.grossTax,
        exoneratedTax: amounts.exoneratedTax,
        taxCollected: amounts.taxCollected,
        total: amounts.total,
        taxes: document.taxes.map((tax) => projectTaxLine(tax, document.projection, projection)),
      }); }),
      pagination: {
        page: request.page,
        pageSize: request.pageSize,
        totalItems: documentPage.totalItems,
        totalPages: documentPage.totalItems === 0 ? 0 : Math.ceil(documentPage.totalItems / request.pageSize),
      },
    };
  }
}

function hasTaxFilter(filter: ReportDocumentReadFilter | undefined): boolean {
  return Boolean(filter?.taxCode || filter?.rateCode || filter?.rate);
}

function currencySummary(value: CurrencySummary | undefined): CurrencySummary {
  return value ?? { documentCount: 0, exemptSales: "0", exoneratedSales: "0", grossTax: "0", exoneratedTax: "0", taxCollected: "0", taxGroups: new Map() };
}

function newTaxGroup(tax: ReportTaxLine): MutableTaxGroup {
  return {
    taxCode: tax.taxCode,
    ...(tax.rateCode ? { rateCode: tax.rateCode } : {}),
    rate: tax.rate,
    documentCount: 0,
    taxableBase: "0",
    grossTaxAmount: "0",
    ...(tax.exemptionAmount === undefined ? {} : { exemptionAmount: "0" }),
    hasExemptionAmount: false,
    taxCollected: "0",
  };
}

function taxGroupKey(tax: Pick<ReportTaxLine, "taxCode" | "rateCode" | "rate">): string {
  return `${tax.taxCode}\u0000${tax.rateCode ?? ""}\u0000${tax.rate}`;
}

function sumEffect(current: ExactDecimalString, value: ExactDecimalString, effect: "INCREASE" | "DECREASE"): ExactDecimalString {
  return addDecimal(current, applyDecimalEffect(value, effect));
}

function omitExemptionAmount(group: SalesTaxReportTaxGroup): SalesTaxReportTaxGroup {
  const { exemptionAmount: _unused, ...withoutExemption } = group;
  return withoutExemption;
}
