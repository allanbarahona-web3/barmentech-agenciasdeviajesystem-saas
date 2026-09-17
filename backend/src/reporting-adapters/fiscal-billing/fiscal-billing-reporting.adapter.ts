import { Injectable } from "@nestjs/common";
import { BillingTaxAuthorityStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type {
  ExactDecimalString,
  ReportDocumentAggregate,
  ReportDocumentPage,
  ReportDocumentPageRequest,
  ReportDocumentProjection,
  ReportDocument,
  ReportDocumentEffect,
  ReportDocumentReadFilter,
  ReportDocumentReader,
  ReportExecutionContext,
  ReportTaxAggregation,
  ReportTaxAggregationReader,
  ResolvedReportingPeriod,
} from "../../reporting/contracts/reporting.contracts";

const DOCUMENT_EFFECTS: Readonly<Record<string, ReportDocumentEffect>> = {
  "01": "INCREASE",
  "02": "INCREASE",
  "03": "DECREASE",
  "04": "INCREASE",
};

/**
 * ERP fiscal adapter. It owns BillingDocument persistence and country document
 * mappings while returning only generic reporting contracts to the core.
 */
@Injectable()
export class FiscalBillingReportingAdapter implements ReportDocumentReader, ReportTaxAggregationReader {
  constructor(private readonly prisma: PrismaService) {}

  async readDocuments(
    context: ReportExecutionContext,
    period: ResolvedReportingPeriod,
    filter?: ReportDocumentReadFilter,
  ): Promise<readonly ReportDocument[]> {
    const documents = await this.prisma.billingDocument.findMany({
      where: reportingWhere(context, period, filter),
      orderBy: newestFirstOrder,
      select: {
        id: true,
        fiscalNumber: true,
        haciendaKey: true,
        documentTypeCode: true,
        fiscalIssueDate: true,
        taxAuthorityFinalizedAt: true,
        receiverName: true,
        receiverIdentificationType: true,
        receiverIdentification: true,
        currencyCode: true,
        exchangeRate: true,
        fiscalExchangeRateEffectiveDate: true,
        fiscalExchangeRateSourceAuthority: true,
        grossSubtotal: true,
        discountTotal: true,
        taxableTotal: true,
        exemptTotal: true,
        exoneratedTotal: true,
        grossTaxTotal: true,
        exoneratedTaxTotal: true,
        netTaxTotal: true,
        total: true,
        lines: {
          orderBy: { lineNumber: "asc" },
          select: {
            taxes: {
              orderBy: { taxOrder: "asc" },
              select: {
                taxCode: true,
                rateCode: true,
                ratePercentage: true,
                taxableBase: true,
                taxAmount: true,
                netTaxAmount: true,
                exemption: { select: { exemptedAmount: true } },
              },
            },
          },
        },
      },
    });

    return documents.flatMap((document) => {
      const effect = DOCUMENT_EFFECTS[document.documentTypeCode];
      if (!effect || !document.fiscalNumber || !document.fiscalIssueDate) return [];
      return [{
        documentId: document.id,
        documentNumber: document.fiscalNumber,
        ...(document.haciendaKey ? { authorityKey: document.haciendaKey } : {}),
        documentTypeCode: document.documentTypeCode,
        effect,
        status: "ACCEPTED",
        issuedOn: calendarDate(document.fiscalIssueDate),
        ...(document.taxAuthorityFinalizedAt ? { acceptedAt: document.taxAuthorityFinalizedAt.toISOString() } : {}),
        customer: {
          name: document.receiverName,
          identificationType: document.receiverIdentificationType,
          identification: document.receiverIdentification,
        },
        currencyCode: document.currencyCode,
        projection: fiscalProjection(document),
        amounts: {
          grossSales: exact(document.grossSubtotal),
          discounts: exact(document.discountTotal),
          taxableSales: exact(document.taxableTotal),
          exemptSales: exact(document.exemptTotal),
          exoneratedSales: exact(document.exoneratedTotal),
          grossTax: exact(document.grossTaxTotal),
          exoneratedTax: exact(document.exoneratedTaxTotal),
          taxCollected: exact(document.netTaxTotal),
          total: exact(document.total),
        },
        taxes: document.lines.flatMap((line) => line.taxes.map((tax) => ({
          taxCode: tax.taxCode,
          ...(tax.rateCode ? { rateCode: tax.rateCode } : {}),
          rate: exact(tax.ratePercentage),
          taxableBase: exact(tax.taxableBase),
          grossTaxAmount: exact(tax.taxAmount),
          ...(tax.exemption ? { exemptionAmount: exact(tax.exemption.exemptedAmount) } : {}),
          taxCollected: exact(tax.netTaxAmount),
        }))),
      }];
    });
  }

  async readDocumentAggregates(
    context: ReportExecutionContext,
    period: ResolvedReportingPeriod,
    filter?: ReportDocumentReadFilter,
  ): Promise<readonly ReportDocumentAggregate[]> {
    const groups = await this.prisma.billingDocument.groupBy({
      by: ["currencyCode", "documentTypeCode", "exchangeRate", "fiscalExchangeRateEffectiveDate", "fiscalExchangeRateSourceAuthority"],
      where: reportingWhere(context, period, filter),
      _count: { _all: true },
      _sum: {
        grossSubtotal: true,
        discountTotal: true,
        taxableTotal: true,
        exemptTotal: true,
        exoneratedTotal: true,
        grossTaxTotal: true,
        exoneratedTaxTotal: true,
        netTaxTotal: true,
        total: true,
      },
    });
    return groups.flatMap((group) => {
      const effect = DOCUMENT_EFFECTS[group.documentTypeCode];
      if (!effect) return [];
      return [{
        currencyCode: group.currencyCode,
        projection: fiscalProjection(group),
        effect,
        documentCount: group._count._all,
        amounts: {
          grossSales: exactOrZero(group._sum.grossSubtotal),
          discounts: exactOrZero(group._sum.discountTotal),
          taxableSales: exactOrZero(group._sum.taxableTotal),
          exemptSales: exactOrZero(group._sum.exemptTotal),
          exoneratedSales: exactOrZero(group._sum.exoneratedTotal),
          grossTax: exactOrZero(group._sum.grossTaxTotal),
          exoneratedTax: exactOrZero(group._sum.exoneratedTaxTotal),
          taxCollected: exactOrZero(group._sum.netTaxTotal),
          total: exactOrZero(group._sum.total),
        },
      }];
    });
  }

  async readDocumentPage(
    context: ReportExecutionContext,
    period: ResolvedReportingPeriod,
    request: ReportDocumentPageRequest,
  ): Promise<ReportDocumentPage> {
    const where = reportingWhere(context, period, request.filter);
    const [totalItems, documents] = await Promise.all([
      this.prisma.billingDocument.count({ where }),
      this.prisma.billingDocument.findMany({
        where,
        skip: (request.page - 1) * request.pageSize,
        take: request.pageSize,
        orderBy: newestFirstOrder,
        select: request.includeTaxes ? documentTaxDetailSelect : documentSummarySelect,
      }),
    ]);
    return {
      totalItems,
      items: request.includeTaxes
        ? (documents as DocumentTaxDetail[]).flatMap((document) => mapDocumentWithTaxes(document))
        : (documents as DocumentSummary[]).flatMap((document) => mapDocumentSummary(document)),
    };
  }

  /** Set-based fiscal tax grouping; country persistence never crosses this adapter boundary. */
  async readTaxAggregation(
    context: ReportExecutionContext,
    period: ResolvedReportingPeriod,
    filter?: ReportDocumentReadFilter,
  ): Promise<readonly ReportTaxAggregation[]> {
    const documentTypeClause = filter?.documentTypeCodes?.length
      ? Prisma.sql`AND document."documentTypeCode" IN (${Prisma.join([...filter.documentTypeCodes])})`
      : Prisma.empty;
    const currencyClause = filter?.currencyCode
      ? Prisma.sql`AND document."currencyCode" = ${filter.currencyCode}`
      : Prisma.empty;
    const saleConditionClause = rawSaleConditionClause(filter?.saleCondition);
    const taxClause = rawTaxClause(filter);
    const rows = await this.prisma.$queryRaw<TaxAggregationRow[]>(Prisma.sql`
      SELECT
        document."currencyCode" AS "currencyCode",
        document."exchangeRate" AS "exchangeRate",
        document."fiscalExchangeRateEffectiveDate" AS "fiscalExchangeRateEffectiveDate",
        document."fiscalExchangeRateSourceAuthority" AS "fiscalExchangeRateSourceAuthority",
        document."documentTypeCode" AS "documentTypeCode",
        tax."taxCode" AS "taxCode",
        tax."rateCode" AS "rateCode",
        tax."ratePercentage" AS "rate",
        COUNT(DISTINCT document.id) AS "documentCount",
        COALESCE(SUM(tax."taxableBase"), 0) AS "taxableBase",
        COALESCE(SUM(tax."taxAmount"), 0) AS "grossTaxAmount",
        SUM(exemption."exemptedAmount") AS "exemptionAmount",
        COALESCE(SUM(tax."netTaxAmount"), 0) AS "taxCollected"
      FROM "billing_line_taxes" tax
      INNER JOIN "billing_document_lines" line
        ON line.id = tax."billingDocumentLineId" AND line."tenantId" = tax."tenantId"
      INNER JOIN "billing_documents" document
        ON document.id = line."billingDocumentId" AND document."tenantId" = line."tenantId"
      LEFT JOIN "billing_line_tax_exemptions" exemption
        ON exemption."billingLineTaxId" = tax.id AND exemption."tenantId" = tax."tenantId"
      WHERE tax."tenantId" = ${context.tenantId}
        AND document."tenantId" = ${context.tenantId}
        AND document."taxAuthorityStatus" = ${BillingTaxAuthorityStatus.ACCEPTED}::"BillingTaxAuthorityStatus"
        AND document."fiscalIssueDate" >= ${dateOnly(period.startOn)}
        AND document."fiscalIssueDate" <= ${dateOnly(period.endOn)}
        ${documentTypeClause}
        ${currencyClause}
        ${saleConditionClause}
        ${taxClause}
      GROUP BY document."currencyCode", document."documentTypeCode", document."exchangeRate", document."fiscalExchangeRateEffectiveDate", document."fiscalExchangeRateSourceAuthority", tax."taxCode", tax."rateCode", tax."ratePercentage"
    `);
    return rows.flatMap((row) => {
      const effect = DOCUMENT_EFFECTS[row.documentTypeCode];
      if (!effect) return [];
      return [{
        currencyCode: row.currencyCode,
        projection: fiscalProjection(row),
        effect,
        documentCount: count(row.documentCount),
        tax: {
          taxCode: row.taxCode,
          ...(row.rateCode ? { rateCode: row.rateCode } : {}),
          rate: exact(row.rate),
          taxableBase: exactOrZero(row.taxableBase),
          grossTaxAmount: exactOrZero(row.grossTaxAmount),
          ...(row.exemptionAmount === null ? {} : { exemptionAmount: exact(row.exemptionAmount) }),
          taxCollected: exactOrZero(row.taxCollected),
        },
      }];
    });
  }
}

const documentSummarySelect = Prisma.validator<Prisma.BillingDocumentSelect>()({
  id: true,
  fiscalNumber: true,
  haciendaKey: true,
  documentTypeCode: true,
  fiscalIssueDate: true,
  taxAuthorityFinalizedAt: true,
  receiverName: true,
  receiverIdentificationType: true,
  receiverIdentification: true,
  currencyCode: true,
  exchangeRate: true,
  fiscalExchangeRateEffectiveDate: true,
  fiscalExchangeRateSourceAuthority: true,
  grossSubtotal: true,
  discountTotal: true,
  taxableTotal: true,
  exemptTotal: true,
  exoneratedTotal: true,
  grossTaxTotal: true,
  exoneratedTaxTotal: true,
  netTaxTotal: true,
  total: true,
});

type DocumentSummary = Prisma.BillingDocumentGetPayload<{ select: typeof documentSummarySelect }>;

const documentTaxDetailSelect = Prisma.validator<Prisma.BillingDocumentSelect>()({
  ...documentSummarySelect,
  lines: {
    orderBy: { lineNumber: "asc" },
    select: {
      taxes: {
        orderBy: { taxOrder: "asc" },
        select: {
          taxCode: true, rateCode: true, ratePercentage: true, taxableBase: true,
          taxAmount: true, netTaxAmount: true, exemption: { select: { exemptedAmount: true } },
        },
      },
    },
  },
});

type DocumentTaxDetail = Prisma.BillingDocumentGetPayload<{ select: typeof documentTaxDetailSelect }>;

type TaxAggregationRow = {
  currencyCode: string;
  exchangeRate: { toFixed(): string } | null;
  fiscalExchangeRateEffectiveDate: Date | null;
  fiscalExchangeRateSourceAuthority: string | null;
  documentTypeCode: string;
  taxCode: string;
  rateCode: string | null;
  rate: unknown;
  documentCount: number | bigint;
  taxableBase: unknown;
  grossTaxAmount: unknown;
  exemptionAmount: unknown | null;
  taxCollected: unknown;
};

/** CR-only mapping of the frozen fiscal snapshot into a generic projection contract. */
function fiscalProjection(document: {
  currencyCode: string;
  exchangeRate: { toFixed(): string } | null;
  fiscalExchangeRateEffectiveDate: Date | null;
  fiscalExchangeRateSourceAuthority: string | null;
  fiscalIssueDate?: Date | null;
}): ReportDocumentProjection {
  if (document.currencyCode === "CRC") {
    return { sourceCurrencyCode: "CRC", targetCurrencyCode: "CRC", rate: "1", operation: "IDENTITY", rateAuthority: "IDENTITY", effectiveOn: document.fiscalIssueDate ? calendarDate(document.fiscalIssueDate) : "" };
  }
  if (document.currencyCode === "USD" && document.exchangeRate && document.fiscalExchangeRateEffectiveDate && document.fiscalExchangeRateSourceAuthority) {
    return {
      sourceCurrencyCode: "USD", targetCurrencyCode: "CRC", rate: exact(document.exchangeRate), operation: "MULTIPLY",
      rateAuthority: document.fiscalExchangeRateSourceAuthority,
      effectiveOn: calendarDate(document.fiscalExchangeRateEffectiveDate),
    };
  }
  throw new Error("REPORTING_FISCAL_PROJECTION_UNAVAILABLE");
}

const newestFirstOrder: Prisma.BillingDocumentOrderByWithRelationInput[] = [
  { fiscalIssueDate: "desc" },
  { fiscalEmissionAt: "desc" },
  { id: "desc" },
];

function reportingWhere(
  context: ReportExecutionContext,
  period: ResolvedReportingPeriod,
  filter?: ReportDocumentReadFilter,
): Prisma.BillingDocumentWhereInput {
  return {
    tenantId: context.tenantId,
    taxAuthorityStatus: BillingTaxAuthorityStatus.ACCEPTED,
    fiscalIssueDate: { gte: dateOnly(period.startOn), lte: dateOnly(period.endOn) },
    ...(filter?.documentTypeCodes?.length
      ? { documentTypeCode: { in: [...filter.documentTypeCodes] } }
      : {}),
    ...(filter?.currencyCode ? { currencyCode: filter.currencyCode } : {}),
    ...saleConditionWhere(filter?.saleCondition),
    ...(hasTaxFilter(filter) ? { lines: { some: { taxes: { some: taxWhere(filter ?? {}) } } } } : {}),
  };
}

function saleConditionWhere(condition: ReportDocumentReadFilter["saleCondition"]): Prisma.BillingDocumentWhereInput {
  if (condition === "CASH") return { paymentConditionCode: "01" };
  if (condition === "CREDIT") return { paymentConditionCode: "02" };
  if (condition === "OTHER") return { OR: [{ paymentConditionCode: null }, { paymentConditionCode: { notIn: ["01", "02"] } }] };
  return {};
}

function rawSaleConditionClause(condition: ReportDocumentReadFilter["saleCondition"]): Prisma.Sql {
  if (condition === "CASH") return Prisma.sql`AND document."paymentConditionCode" = ${"01"}`;
  if (condition === "CREDIT") return Prisma.sql`AND document."paymentConditionCode" = ${"02"}`;
  if (condition === "OTHER") return Prisma.sql`AND (document."paymentConditionCode" IS NULL OR document."paymentConditionCode" NOT IN ('01', '02'))`;
  return Prisma.empty;
}

function hasTaxFilter(filter: ReportDocumentReadFilter | undefined): boolean {
  return Boolean(filter?.taxCode || filter?.rateCode || filter?.rate);
}

function taxWhere(filter: ReportDocumentReadFilter): Prisma.BillingLineTaxWhereInput {
  return {
    ...(filter.taxCode ? { taxCode: filter.taxCode } : {}),
    ...(filter.rateCode ? { rateCode: filter.rateCode } : {}),
    ...(filter.rate ? { ratePercentage: new Prisma.Decimal(filter.rate) } : {}),
  };
}

function rawTaxClause(filter: ReportDocumentReadFilter | undefined): Prisma.Sql {
  if (!filter || !hasTaxFilter(filter)) return Prisma.empty;
  return Prisma.sql`
    ${filter.taxCode ? Prisma.sql`AND tax."taxCode" = ${filter.taxCode}` : Prisma.empty}
    ${filter.rateCode ? Prisma.sql`AND tax."rateCode" = ${filter.rateCode}` : Prisma.empty}
    ${filter.rate ? Prisma.sql`AND tax."ratePercentage" = ${new Prisma.Decimal(filter.rate)}` : Prisma.empty}
  `;
}

function mapDocumentSummary(document: DocumentSummary): ReportDocument[] {
  const effect = DOCUMENT_EFFECTS[document.documentTypeCode];
  if (!effect || !document.fiscalNumber || !document.fiscalIssueDate) return [];
  return [{
    documentId: document.id,
    documentNumber: document.fiscalNumber,
    ...(document.haciendaKey ? { authorityKey: document.haciendaKey } : {}),
    documentTypeCode: document.documentTypeCode,
    effect,
    status: "ACCEPTED",
    issuedOn: calendarDate(document.fiscalIssueDate),
    ...(document.taxAuthorityFinalizedAt ? { acceptedAt: document.taxAuthorityFinalizedAt.toISOString() } : {}),
    customer: { name: document.receiverName, identificationType: document.receiverIdentificationType, identification: document.receiverIdentification },
    currencyCode: document.currencyCode,
    projection: fiscalProjection(document),
    amounts: {
      grossSales: exact(document.grossSubtotal),
      discounts: exact(document.discountTotal),
      taxableSales: exact(document.taxableTotal),
      exemptSales: exact(document.exemptTotal),
      exoneratedSales: exact(document.exoneratedTotal),
      grossTax: exact(document.grossTaxTotal),
      exoneratedTax: exact(document.exoneratedTaxTotal),
      taxCollected: exact(document.netTaxTotal),
      total: exact(document.total),
    },
    taxes: [],
  }];
}

function mapDocumentWithTaxes(document: DocumentTaxDetail): ReportDocument[] {
  return mapDocumentSummary(document).map((summary) => ({
    ...summary,
    taxes: document.lines.flatMap((line) => line.taxes.map((tax) => ({
      taxCode: tax.taxCode,
      ...(tax.rateCode ? { rateCode: tax.rateCode } : {}),
      rate: exact(tax.ratePercentage),
      taxableBase: exact(tax.taxableBase),
      grossTaxAmount: exact(tax.taxAmount),
      ...(tax.exemption ? { exemptionAmount: exact(tax.exemption.exemptedAmount) } : {}),
      taxCollected: exact(tax.netTaxAmount),
    }))),
  }));
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function calendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function exact(value: unknown): ExactDecimalString {
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)) return value;
  if (value && typeof value === "object" && "toFixed" in value && typeof value.toFixed === "function") {
    return value.toFixed() as string;
  }
  throw new Error("REPORTING_FISCAL_DECIMAL_INVALID");
}

function exactOrZero(value: unknown): ExactDecimalString {
  return value === null ? "0" : exact(value);
}

function count(value: number | bigint): number {
  const parsed = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("REPORTING_FISCAL_COUNT_INVALID");
  return parsed;
}
