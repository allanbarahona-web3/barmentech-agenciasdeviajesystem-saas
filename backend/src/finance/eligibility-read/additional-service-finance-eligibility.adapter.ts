import { Injectable } from "@nestjs/common";
import { AccountReceivableStatus, Prisma } from "@prisma/client";
import { measureOperationsTimingStage } from "../../common/performance/operations-timing";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import {
  normalizeFinanceEligibilitySources,
  requiredFinanceEligibilityTenantId,
  financeEligibilitySourceKey,
} from "./finance-eligibility-reader.utils";
import type {
  CommercialSourceRef,
  EligibilityFinancialStatus,
  FinanceEligibilityReader,
  FinanceEligibilityResult,
  ReadFinanceEligibilityRequest,
} from "./finance-eligibility-reader.port";

export const ADDITIONAL_SERVICE_ORDER_LINE_SOURCE_TYPE = "ADDITIONAL_SERVICE_ORDER_LINE";

const ADDITIONAL_SERVICE_SALES_ORDER_SOURCE_TYPE = "ADDITIONAL_SERVICE_ORDER";
const SALES_ORDER_BILLING_SOURCE_TYPE = "SALES_ORDER";
const BILLING_DOCUMENT_RECEIVABLE_SOURCE_TYPE = "BILLING_DOCUMENT";
const ELECTRONIC_INVOICE_DOCUMENT_TYPE = "01";

type Tx = any;
type Database = { $transaction<T>(work: (transaction: Tx) => Promise<T>): Promise<T> };
type AuthorityRow = {
  requestKey: string;
  sourceLineId: string | null;
  travelPackageId: string | null;
  orderId: string | null;
  orderTravelPackageId: string | null;
  commercialStatus: string | null;
  orderStatus: string | null;
  proposalApprovedAt: Date | null;
  lineId: string | null;
  lineOrderId: string | null;
  salesOrderId: string | null;
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

/** Finance-owned resolver for Additional Service work identities. */
@Injectable()
export class AdditionalServiceFinanceEligibilityAdapter implements FinanceEligibilityReader {
  private readonly database: Database;

  constructor(prisma: PrismaService) { this.database = prisma as unknown as Database; }

  async readMany(request: ReadFinanceEligibilityRequest): Promise<FinanceEligibilityResult[]> {
    const sources = normalizeFinanceEligibilitySources(request.sources);
    if (sources.length === 0) return [];

    const additionalSources = sources.filter((source) => source.sourceType === ADDITIONAL_SERVICE_ORDER_LINE_SOURCE_TYPE);
    if (additionalSources.length === 0) return sources.map((source) => missingFinancialData(source));

    return runTenantTransaction<Tx, FinanceEligibilityResult[]>(
      this.database,
      requiredFinanceEligibilityTenantId(request.tenantId),
      async (tx) => {
        // One Finance-owned authority read validates the entire source chain for the bounded batch.
        const rows = await measureOperationsTimingStage<AuthorityRow[]>(
          "finance.additional_service.authority",
          () => additionalServiceAuthorityRows(tx, request.tenantId, additionalSources),
        );
        const rowByRequestKey = new Map(rows.map((row) => [row.requestKey, row]));
        return sources.map((source) => {
          if (source.sourceType !== ADDITIONAL_SERVICE_ORDER_LINE_SOURCE_TYPE) return missingFinancialData(source);
          return eligibilityFromAuthorityRow(source, rowByRequestKey.get(financeEligibilitySourceKey(source)));
        });
      },
    );
  }
}

function additionalServiceAuthorityRows(tx: Tx, tenantId: string, sources: readonly CommercialSourceRef[]) {
  const requested = sources.map((source) => Prisma.sql`(
    CAST(${financeEligibilitySourceKey(source)} AS text), CAST(${source.sourceId} AS text),
    CAST(${source.sourceLineId ?? null} AS text), CAST(${source.travelPackageId ?? null} AS text)
  )`);
  return tx.$queryRaw<AuthorityRow[]>`
    WITH requested("requestKey", "sourceId", "sourceLineId", "travelPackageId") AS (
      VALUES ${Prisma.join(requested)}
    )
    SELECT requested."requestKey", requested."sourceLineId", requested."travelPackageId",
      orders.id AS "orderId", orders."travelPackageId" AS "orderTravelPackageId", orders."commercialStatus"::text AS "commercialStatus",
      orders.status::text AS "orderStatus", orders."proposalApprovedAt", lines.id AS "lineId", lines."orderId" AS "lineOrderId",
      sales.id AS "salesOrderId", sales.status AS "salesOrderStatus", billing.id AS "billingDocumentId",
      receivable."sourceId" AS "accountReceivableSourceId", receivable."currencyCode", receivable."originalAmount",
      receivable."outstandingAmount", receivable.status::text AS "accountReceivableStatus", receivable."settledAt", receivable."updatedAt"
    FROM requested
    LEFT JOIN "additional_service_orders" orders ON orders.id = requested."sourceId" AND orders."tenantId" = ${tenantId}
    LEFT JOIN "additional_service_order_lines" lines ON lines.id = requested."sourceLineId" AND lines."tenantId" = ${tenantId}
    LEFT JOIN "sales_orders" sales ON sales."tenantId" = ${tenantId} AND sales."sourceType" = ${ADDITIONAL_SERVICE_SALES_ORDER_SOURCE_TYPE} AND sales."sourceId" = orders.id
    LEFT JOIN LATERAL (
      SELECT CASE WHEN COUNT(*) = 1 THEN MIN(document.id) ELSE NULL END AS id
      FROM "billing_documents" document
      WHERE document."tenantId" = ${tenantId} AND document."sourceType" = ${SALES_ORDER_BILLING_SOURCE_TYPE}
        AND document."sourceId" = sales.id AND document."sourceRole" = 'PRIMARY'
        AND document."documentTypeCode" = ${ELECTRONIC_INVOICE_DOCUMENT_TYPE} AND document."taxAuthorityStatus" = 'ACCEPTED'
    ) billing ON true
    LEFT JOIN "account_receivables" receivable ON receivable."tenantId" = ${tenantId}
      AND receivable."sourceType" = ${BILLING_DOCUMENT_RECEIVABLE_SOURCE_TYPE} AND receivable."sourceId" = billing.id
  `;
}

function eligibilityFromAuthorityRow(source: CommercialSourceRef, row: AuthorityRow | undefined): FinanceEligibilityResult {
  if (!source.sourceLineId || !source.travelPackageId || !row || !row.orderId || !row.lineId) return missingFinancialData(source);
  if (row.lineOrderId !== source.sourceId || row.orderTravelPackageId !== source.travelPackageId) return sourceNotFinanciallyActive(source);
  if (row.commercialStatus !== "APPROVED" || row.orderStatus === "CANCELLED" || !validDate(row.proposalApprovedAt)) return sourceNotFinanciallyActive(source);
  if (!row.salesOrderId) return missingFinancialData(source);
  if (row.salesOrderStatus !== "CREATED") return sourceNotFinanciallyActive(source);
  if (!row.billingDocumentId || !row.accountReceivableSourceId || !validFinancialAmounts(row)) return missingFinancialData(source);
  return eligibilityFromReceivable(source, row);
}

function eligibilityFromReceivable(source: CommercialSourceRef, receivable: AuthorityRow): FinanceEligibilityResult {
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
  const settled = receivable.accountReceivableStatus === AccountReceivableStatus.SETTLED
    && receivable.outstandingAmount!.isZero() && validDate(receivable.settledAt);
  return settled
    ? { source, eligibility: "ELIGIBLE", reason: "SETTLED", financial }
    : { source, eligibility: "BLOCKED", reason: "OUTSTANDING_BALANCE", financial };
}

function validFinancialAmounts(receivable: AuthorityRow): boolean {
  return Boolean(
    receivable.currencyCode && /^[A-Z]{3}$/.test(receivable.currencyCode)
    && receivable.originalAmount?.isFinite() && receivable.originalAmount.greaterThan(0)
    && receivable.outstandingAmount?.isFinite() && receivable.outstandingAmount.greaterThanOrEqualTo(0)
    && receivable.outstandingAmount?.lessThanOrEqualTo(receivable.originalAmount),
  );
}

function financialStatus(status: AccountReceivableStatus): EligibilityFinancialStatus {
  if (status === AccountReceivableStatus.SETTLED) return "SETTLED";
  if (status === AccountReceivableStatus.CANCELLED) return "CANCELLED";
  if (status === AccountReceivableStatus.OPEN || status === AccountReceivableStatus.PARTIALLY_SETTLED) return "OUTSTANDING";
  return "UNKNOWN";
}
function validDate(value: unknown): value is Date { return value instanceof Date && !Number.isNaN(value.getTime()); }
function sourceNotFinanciallyActive(source: CommercialSourceRef): FinanceEligibilityResult { return { source, eligibility: "BLOCKED", reason: "SOURCE_NOT_FINANCIALLY_ACTIVE" }; }
function missingFinancialData(source: CommercialSourceRef): FinanceEligibilityResult { return { source, eligibility: "BLOCKED", reason: "FINANCIAL_DATA_MISSING" }; }
