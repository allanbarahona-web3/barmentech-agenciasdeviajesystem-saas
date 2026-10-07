import { Injectable } from "@nestjs/common";
import { AccountReceivableStatus, Prisma } from "@prisma/client";
import { measureOperationsTimingStage } from "../../common/performance/operations-timing";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import {
  financeEligibilitySourceKey,
  normalizeFinanceEligibilitySources,
  requiredFinanceEligibilityTenantId,
} from "./finance-eligibility-reader.utils";
import type {
  CommercialSourceRef,
  EligibilityFinancialStatus,
  FinanceEligibilityReader,
  FinanceEligibilityResult,
  ReadFinanceEligibilityRequest,
} from "./finance-eligibility-reader.port";

export const CUSTOM_QUOTATION_LINE_SOURCE_TYPE = "CUSTOM_QUOTATION_LINE";

const CUSTOM_QUOTATION_SALES_ORDER_SOURCE_TYPE = "CUSTOM_QUOTATION_VERSION";
const SALES_ORDER_BILLING_SOURCE_TYPE = "SALES_ORDER";
const BILLING_DOCUMENT_RECEIVABLE_SOURCE_TYPE = "BILLING_DOCUMENT";
const ELECTRONIC_INVOICE_DOCUMENT_TYPE = "01";

type Tx = any;
type Database = { $transaction<T>(work: (transaction: Tx) => Promise<T>): Promise<T> };
type AuthorityRow = {
  requestKey: string;
  sourceLineId: string | null;
  versionId: string | null;
  quotationId: string | null;
  quotationStatus: string | null;
  versionStatus: string | null;
  versionSalesOrderId: string | null;
  lineId: string | null;
  lineVersionId: string | null;
  lineSoldAmount: Prisma.Decimal | null;
  salesOrderLineId: string | null;
  lineSalesOrderId: string | null;
  salesOrderLineTotal: Prisma.Decimal | null;
  salesOrderId: string | null;
  salesOrderSourceType: string | null;
  salesOrderSourceId: string | null;
  salesOrderStatus: string | null;
  billingDocumentId: string | null;
  accountReceivableSourceId: string | null;
  currencyCode: string | null;
  originalAmount: Prisma.Decimal | null;
  outstandingAmount: Prisma.Decimal | null;
  accountReceivableStatus: AccountReceivableStatus | null;
  settledAt: Date | null;
  updatedAt: Date | null;
};

/**
 * Finance-owned resolver for immutable Custom Quotation version-line work.
 * Billing currently settles an accepted SalesOrder invoice as a whole: Billing
 * lines have no persisted SalesOrderLine allocation identity. Consequently a
 * quotation line becomes eligible only when its sole accepted primary invoice
 * has a fully settled AR; no payment allocation is inferred per line.
 */
@Injectable()
export class CustomQuotationFinanceEligibilityAdapter implements FinanceEligibilityReader {
  private readonly database: Database;

  constructor(prisma: PrismaService) {
    this.database = prisma as unknown as Database;
  }

  async readMany(request: ReadFinanceEligibilityRequest): Promise<FinanceEligibilityResult[]> {
    const sources = normalizeFinanceEligibilitySources(request.sources);
    if (sources.length === 0) return [];

    const quotationSources = sources.filter(
      (source) => source.sourceType === CUSTOM_QUOTATION_LINE_SOURCE_TYPE,
    );
    if (quotationSources.length === 0) {
      return sources.map((source) => missingFinancialData(source));
    }

    return runTenantTransaction<Tx, FinanceEligibilityResult[]>(
      this.database,
      requiredFinanceEligibilityTenantId(request.tenantId),
      async (tx) => {
        const rows = await measureOperationsTimingStage<AuthorityRow[]>(
          "finance.custom_quotation.authority",
          () => customQuotationAuthorityRows(tx, request.tenantId, quotationSources),
        );
        const rowByRequestKey = new Map(rows.map((row) => [row.requestKey, row]));
        return sources.map((source) => {
          if (source.sourceType !== CUSTOM_QUOTATION_LINE_SOURCE_TYPE) {
            return missingFinancialData(source);
          }
          return eligibilityFromAuthorityRow(
            source,
            rowByRequestKey.get(financeEligibilitySourceKey(source)),
          );
        });
      },
    );
  }
}

function customQuotationAuthorityRows(
  tx: Tx,
  tenantId: string,
  sources: readonly CommercialSourceRef[],
) {
  const requested = sources.map((source) => Prisma.sql`(
    CAST(${financeEligibilitySourceKey(source)} AS text), CAST(${source.sourceId} AS text),
    CAST(${source.sourceLineId ?? null} AS text)
  )`);
  return tx.$queryRaw<AuthorityRow[]>`
    WITH requested("requestKey", "sourceId", "sourceLineId") AS (
      VALUES ${Prisma.join(requested)}
    )
    SELECT requested."requestKey", requested."sourceLineId",
      version.id AS "versionId", quotation.id AS "quotationId",
      quotation.status::text AS "quotationStatus", version.status::text AS "versionStatus",
      version."salesOrderId" AS "versionSalesOrderId",
      version_line.id AS "lineId", version_line."customQuotationVersionId" AS "lineVersionId",
      version_line."soldAmount" AS "lineSoldAmount",
      sales_link."salesOrderLineId", sales_link."lineSalesOrderId", sales_link."salesOrderLineTotal", sales_link."salesOrderId",
      sales_link."salesOrderSourceType", sales_link."salesOrderSourceId", sales_link."salesOrderStatus",
      billing.id AS "billingDocumentId", receivable."sourceId" AS "accountReceivableSourceId",
      receivable."currencyCode", receivable."originalAmount", receivable."outstandingAmount",
      receivable.status::text AS "accountReceivableStatus", receivable."settledAt", receivable."updatedAt"
    FROM requested
    LEFT JOIN "custom_quotation_versions" version
      ON version.id = requested."sourceId" AND version."tenantId" = ${tenantId}
    LEFT JOIN "custom_quotations" quotation
      ON quotation.id = version."customQuotationId" AND quotation."tenantId" = ${tenantId}
    LEFT JOIN "custom_quotation_version_lines" version_line
      ON version_line.id = requested."sourceLineId" AND version_line."tenantId" = ${tenantId}
    LEFT JOIN LATERAL (
      SELECT
        CASE WHEN COUNT(*) = 1 THEN MIN(line.id) ELSE NULL END AS "salesOrderLineId",
        CASE WHEN COUNT(*) = 1 THEN MIN(line."salesOrderId") ELSE NULL END AS "lineSalesOrderId",
        CASE WHEN COUNT(*) = 1 THEN MIN(line.total) ELSE NULL END AS "salesOrderLineTotal",
        CASE WHEN COUNT(*) = 1 THEN MIN(sales.id) ELSE NULL END AS "salesOrderId",
        CASE WHEN COUNT(*) = 1 THEN MIN(sales."sourceType") ELSE NULL END AS "salesOrderSourceType",
        CASE WHEN COUNT(*) = 1 THEN MIN(sales."sourceId") ELSE NULL END AS "salesOrderSourceId",
        CASE WHEN COUNT(*) = 1 THEN MIN(sales.status) ELSE NULL END AS "salesOrderStatus"
      FROM "sales_order_lines" line
      JOIN "sales_orders" sales
        ON sales.id = line."salesOrderId" AND sales."tenantId" = ${tenantId}
      WHERE line."tenantId" = ${tenantId}
        AND line."customQuotationVersionLineId" = version_line.id
    ) sales_link ON true
    LEFT JOIN LATERAL (
      SELECT CASE WHEN COUNT(*) = 1 THEN MIN(document.id) ELSE NULL END AS id
      FROM "billing_documents" document
      WHERE document."tenantId" = ${tenantId}
        AND document."sourceType" = ${SALES_ORDER_BILLING_SOURCE_TYPE}
        AND document."sourceId" = sales_link."salesOrderId"
        AND document."sourceRole" = 'PRIMARY'
        AND document."documentTypeCode" = ${ELECTRONIC_INVOICE_DOCUMENT_TYPE}
        AND document."taxAuthorityStatus" = 'ACCEPTED'
    ) billing ON true
    LEFT JOIN "account_receivables" receivable
      ON receivable."tenantId" = ${tenantId}
      AND receivable."sourceType" = ${BILLING_DOCUMENT_RECEIVABLE_SOURCE_TYPE}
      AND receivable."sourceId" = billing.id
  `;
}

function eligibilityFromAuthorityRow(
  source: CommercialSourceRef,
  row: AuthorityRow | undefined,
): FinanceEligibilityResult {
  if (
    !source.sourceLineId || !row || !row.versionId || !row.quotationId ||
    !row.lineId || !validLineAmount(row.lineSoldAmount)
  ) {
    return missingFinancialData(source);
  }
  if (row.versionId !== source.sourceId || row.lineId !== source.sourceLineId || row.lineVersionId !== source.sourceId) {
    return sourceNotFinanciallyActive(source);
  }
  if (row.quotationStatus !== "ACCEPTED" || row.versionStatus !== "ACCEPTED") {
    return sourceNotFinanciallyActive(source);
  }
  if (!row.salesOrderLineId || !row.salesOrderId) return missingFinancialData(source);
  if (
    row.versionSalesOrderId !== row.salesOrderId ||
    row.lineSalesOrderId !== row.salesOrderId ||
    !row.salesOrderLineTotal?.equals(row.lineSoldAmount) ||
    row.salesOrderSourceType !== CUSTOM_QUOTATION_SALES_ORDER_SOURCE_TYPE ||
    row.salesOrderSourceId !== source.sourceId ||
    row.salesOrderStatus !== "CREATED"
  ) {
    return sourceNotFinanciallyActive(source);
  }
  if (!row.billingDocumentId || !row.accountReceivableSourceId || !validFinancialAmounts(row)) {
    return missingFinancialData(source);
  }
  return eligibilityFromReceivable(source, row);
}

function eligibilityFromReceivable(
  source: CommercialSourceRef,
  receivable: AuthorityRow,
): FinanceEligibilityResult {
  const financial = {
    originalAmount: receivable.originalAmount!.toFixed(),
    outstandingAmount: receivable.outstandingAmount!.toFixed(),
    currency: receivable.currencyCode!,
    financialStatus: financialStatus(receivable.accountReceivableStatus!),
    settledAt: validDate(receivable.settledAt) ? receivable.settledAt : null,
    lastFinancialChangeAt: validDate(receivable.updatedAt) ? receivable.updatedAt : null,
  };
  if (receivable.accountReceivableStatus === AccountReceivableStatus.CANCELLED) {
    return { source, eligibility: "BLOCKED", reason: "SOURCE_NOT_FINANCIALLY_ACTIVE", financial };
  }
  const settled =
    receivable.accountReceivableStatus === AccountReceivableStatus.SETTLED &&
    receivable.outstandingAmount!.isZero() &&
    validDate(receivable.settledAt);
  return settled
    ? { source, eligibility: "ELIGIBLE", reason: "SETTLED", financial }
    : { source, eligibility: "BLOCKED", reason: "OUTSTANDING_BALANCE", financial };
}

function validLineAmount(value: Prisma.Decimal | null): value is Prisma.Decimal {
  return Boolean(value?.isFinite() && value.greaterThanOrEqualTo(0));
}

function validFinancialAmounts(receivable: AuthorityRow): boolean {
  return Boolean(
    receivable.currencyCode && /^[A-Z]{3}$/.test(receivable.currencyCode) &&
    receivable.originalAmount?.isFinite() && receivable.originalAmount.greaterThan(0) &&
    receivable.outstandingAmount?.isFinite() && receivable.outstandingAmount.greaterThanOrEqualTo(0) &&
    receivable.outstandingAmount?.lessThanOrEqualTo(receivable.originalAmount),
  );
}

function financialStatus(status: AccountReceivableStatus): EligibilityFinancialStatus {
  if (status === AccountReceivableStatus.SETTLED) return "SETTLED";
  if (status === AccountReceivableStatus.CANCELLED) return "CANCELLED";
  if (status === AccountReceivableStatus.OPEN || status === AccountReceivableStatus.PARTIALLY_SETTLED) return "OUTSTANDING";
  return "UNKNOWN";
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function sourceNotFinanciallyActive(source: CommercialSourceRef): FinanceEligibilityResult {
  return { source, eligibility: "BLOCKED", reason: "SOURCE_NOT_FINANCIALLY_ACTIVE" };
}

function missingFinancialData(source: CommercialSourceRef): FinanceEligibilityResult {
  return { source, eligibility: "BLOCKED", reason: "FINANCIAL_DATA_MISSING" };
}
