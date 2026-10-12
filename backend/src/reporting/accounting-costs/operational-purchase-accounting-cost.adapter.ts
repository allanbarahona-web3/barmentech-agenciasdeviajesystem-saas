import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { nextTenantCalendarDate, tenantCalendarDateStartAsUtc } from "../../finance/tenant-fiscal-date";
import { PrismaService } from "../../prisma/prisma.service";
import type { ReportExecutionContext, ResolvedReportingPeriod } from "../contracts/reporting.contracts";
import type { AccountingCostReadRequest, AccountingCostRow, AccountingCostSourceContext, AccountingCostSourcePage, AccountingCostSourceReader, AccountingCostSummaryRow } from "./accounting-costs.types";

const SOURCE_TYPE = "OPERATIONAL_PURCHASE" as const;

/** Operations persistence adapter. Financial authority is always OperationalPurchase, never reservation data. */
@Injectable()
export class OperationalPurchaseAccountingCostAdapter implements AccountingCostSourceReader {
  readonly sourceType = SOURCE_TYPE;
  constructor(private readonly prisma: PrismaService) {}

  async readPage(context: ReportExecutionContext, period: ResolvedReportingPeriod, request: AccountingCostReadRequest): Promise<AccountingCostSourcePage> {
    const where = purchaseWhere(context, period, request);
    const [purchases, totalItems] = await Promise.all([
      this.prisma.operationalPurchase.findMany({
        where,
        orderBy: [{ purchasedAt: "desc" }, { id: "desc" }],
        skip: (request.page - 1) * request.pageSize,
        take: request.pageSize,
        select: purchaseSelect,
      }),
      this.prisma.operationalPurchase.count({ where }),
    ]);
    const versionIds = purchases
      .filter((purchase) => purchase.operationalFulfillment.operationalRequirement.sourceType === "CUSTOM_QUOTATION_LINE")
      .map((purchase) => purchase.operationalFulfillment.operationalRequirement.sourceId)
      .filter((value): value is string => Boolean(value));
    const versions = versionIds.length ? await this.prisma.customQuotationVersion.findMany({
      where: { tenantId: context.tenantId, id: { in: [...new Set(versionIds)] } },
      select: { id: true, versionNumber: true, customQuotationId: true, customQuotation: { select: { quotationNumber: true } }, salesOrder: { select: { orderNumber: true } } },
    }) : [];
    const quotations = new Map(versions.map((version) => [version.id, version]));
    return { items: purchases.map((purchase) => row(purchase, quotations.get(purchase.operationalFulfillment.operationalRequirement.sourceId ?? "") ?? null)), totalItems };
  }

  /** One set-based grouping query carries both original-currency and date-specific FX summary inputs. */
  async readSummary(context: ReportExecutionContext, period: ResolvedReportingPeriod, request: AccountingCostReadRequest): Promise<readonly AccountingCostSummaryRow[]> {
    const { start, end } = periodBounds(period, context.timezone);
    const clauses = sqlFilters(context, request, start, end);
    const rows = await this.prisma.$queryRaw<Array<{ currency: string; effectiveOn: string; count: bigint; subtotal: Prisma.Decimal; tax: Prisma.Decimal | null }>>(Prisma.sql`
      SELECT p."currency" AS "currency",
        to_char((p."purchasedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${context.timezone}, 'YYYY-MM-DD') AS "effectiveOn",
        COUNT(*)::bigint AS "count", SUM(p."amount") AS "subtotal", SUM(COALESCE(p."taxAmount", 0)) AS "tax"
      FROM "operational_purchases" p
      INNER JOIN "operational_fulfillments" f ON f."id" = p."operationalFulfillmentId" AND f."tenantId" = p."tenantId"
      INNER JOIN "operational_requirements" r ON r."id" = f."operationalRequirementId" AND r."tenantId" = f."tenantId"
      WHERE ${Prisma.join(clauses, " AND ")}
      GROUP BY p."currency", "effectiveOn"
      ORDER BY p."currency" ASC, "effectiveOn" ASC
    `);
    return rows.map((value) => ({ currency: value.currency, effectiveOn: value.effectiveOn, count: safeCount(value.count), subtotal: value.subtotal, tax: value.tax ?? new Prisma.Decimal(0) }));
  }
}

const purchaseSelect = {
  id: true, purchasedAt: true, providerName: true, supplierReference: true, supplierInvoiceNumber: true, amount: true, taxAmount: true, currency: true,
  _count: { select: { evidence: true } },
  operationalFulfillment: { select: {
    status: true,
    operationalRequirement: { select: {
      sourceType: true, sourceId: true, sourceVersionId: true, description: true, servicePurposeCode: true, servicePurposeName: true,
      travelPackageId: true, customerId: true,
      travelPackage: { select: { name: true, packageCode: true } },
      customer: { select: { fullName: true } },
    } },
  } },
} as const;

function purchaseWhere(context: ReportExecutionContext, period: ResolvedReportingPeriod, request: AccountingCostReadRequest): any {
  const { start, end } = periodBounds(period, context.timezone);
  const filter = request.filter;
  const operational = request.operational;
  return {
    tenantId: context.tenantId,
    purchasedAt: { gte: start, lt: end },
    ...(filter?.currency ? { currency: filter.currency } : {}),
    ...(filter?.counterpartySearch ? { providerName: { startsWith: filter.counterpartySearch, mode: "insensitive" } } : {}),
    operationalFulfillment: { operationalRequirement: {
      ...(filter?.servicePurposeCode ? { servicePurposeCode: filter.servicePurposeCode } : {}),
      ...(filter?.status ? {} : {}),
      ...(operational?.travelPackageId ? { travelPackageId: operational.travelPackageId } : {}),
      ...(operational?.customerId ? { customerId: operational.customerId } : {}),
    }, ...(filter?.status ? { status: filter.status as any } : {}) },
  };
}

function sqlFilters(context: ReportExecutionContext, request: AccountingCostReadRequest, start: Date, end: Date): Prisma.Sql[] {
  const filter = request.filter, operational = request.operational;
  const clauses = [Prisma.sql`p."tenantId" = ${context.tenantId}`, Prisma.sql`p."purchasedAt" >= ${start}`, Prisma.sql`p."purchasedAt" < ${end}`];
  if (filter?.currency) clauses.push(Prisma.sql`p."currency" = ${filter.currency}`);
  // Prefix search deliberately avoids assuming a pg_trgm extension or substring index.
  if (filter?.counterpartySearch) clauses.push(Prisma.sql`LOWER(p."providerName") LIKE ${`${filter.counterpartySearch.toLowerCase()}%`}`);
  if (filter?.servicePurposeCode) clauses.push(Prisma.sql`r."servicePurposeCode" = ${filter.servicePurposeCode}`);
  if (filter?.status) clauses.push(Prisma.sql`f."status" = ${filter.status}`);
  if (operational?.travelPackageId) clauses.push(Prisma.sql`r."travelPackageId" = ${operational.travelPackageId}`);
  if (operational?.customerId) clauses.push(Prisma.sql`r."customerId" = ${operational.customerId}`);
  return clauses;
}

function periodBounds(period: ResolvedReportingPeriod, timezone: string) { return { start: tenantCalendarDateStartAsUtc(period.startOn, timezone), end: tenantCalendarDateStartAsUtc(nextTenantCalendarDate(period.endOn), timezone) }; }
function safeCount(value: bigint) { if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("REPORTING_COUNT_UNSAFE"); return Number(value); }

function row(purchase: any, quotation: { id: string; versionNumber: number; customQuotationId: string; customQuotation: { quotationNumber: string }; salesOrder: { orderNumber: string } | null } | null): AccountingCostRow {
  const requirement = purchase.operationalFulfillment.operationalRequirement;
  const subtotal = new Prisma.Decimal(purchase.amount);
  const tax = new Prisma.Decimal(purchase.taxAmount ?? 0);
  return {
    sourceType: SOURCE_TYPE, sourceId: purchase.id, sourceDate: purchase.purchasedAt, description: requirement.description,
    counterparty: { kind: "SUPPLIER", name: purchase.providerName }, subtotal: subtotal.toFixed(), tax: tax.toFixed(), total: subtotal.plus(tax).toFixed(), currency: purchase.currency,
    conversion: { status: "FX_MISSING", baseCurrency: "", exchangeRate: null, subtotal: null, tax: null, total: null, authority: null, effectiveOn: "", operation: null },
    reference: { supplierReference: purchase.supplierReference, documentNumber: purchase.supplierInvoiceNumber }, evidence: { available: purchase._count.evidence > 0, count: purchase._count.evidence },
    status: purchase.operationalFulfillment.status, cancelled: purchase.operationalFulfillment.status === "CANCELLED", context: sourceContext(requirement, quotation),
  };
}

function sourceContext(requirement: any, quotation: { id: string; versionNumber: number; customQuotationId: string; customQuotation: { quotationNumber: string }; salesOrder: { orderNumber: string } | null } | null): AccountingCostSourceContext {
  const common = { servicePurpose: { code: requirement.servicePurposeCode, name: requirement.servicePurposeName }, requirementDescription: requirement.description };
  if (requirement.sourceType === "CUSTOM_QUOTATION_LINE") return {
    sourceCategory: "CUSTOM_QUOTATION", ...common,
    ...(requirement.customerId && requirement.customer ? { customer: { id: requirement.customerId, name: requirement.customer.fullName } } : {}),
    ...(quotation ? { quotation: { id: quotation.customQuotationId, versionId: quotation.id, versionNumber: quotation.versionNumber, number: quotation.customQuotation.quotationNumber }, ...(quotation.salesOrder ? { salesOrderNumber: quotation.salesOrder.orderNumber } : {}) } : {}),
  };
  const sourceCategory = requirement.sourceType === "ADDITIONAL_SERVICE_ORDER_LINE" ? "ADDITIONAL_SERVICES" : requirement.sourceType === "TRAVEL_PACKAGE_COST_COMPONENT" ? "BASE_TRIP" : "OTHER";
  return { sourceCategory, ...common, ...(requirement.travelPackageId ? { travelPackageId: requirement.travelPackageId } : {}), ...(requirement.travelPackage ? { travelPackage: { name: requirement.travelPackage.name, code: requirement.travelPackage.packageCode } } : {}) };
}
