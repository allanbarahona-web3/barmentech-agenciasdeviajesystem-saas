import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ReportingAccessPolicy } from "../access/reporting-access-policy";
import { addDecimal } from "../core/exact-decimal";
import { ReportingPeriodResolver, type ReportingPeriodSelection } from "../period/reporting-period.resolver";
import { PrismaService } from "../../prisma/prisma.service";
import { tenantCalendarDateStartAsUtc } from "../../finance/tenant-fiscal-date";
import { AccountingCostFxProjector } from "./accounting-cost-fx.projector";
import { OperationalPurchaseAccountingCostAdapter } from "./operational-purchase-accounting-cost.adapter";
import type { AccountingCostReadRequest, AccountingCostRow, AccountingCostSourceReader, AccountingCostSummaryRow } from "./accounting-costs.types";
import { type UserRole } from "@prisma/client";

export type AuthenticatedAccountingCostsRequest = { tenantId: string; actorUserId: string; role: UserRole; period: ReportingPeriodSelection; read: AccountingCostReadRequest };

@Injectable()
export class AccountingCostsService {
  constructor(private readonly prisma: PrismaService, private readonly access: ReportingAccessPolicy, private readonly periods: ReportingPeriodResolver, private readonly purchases: OperationalPurchaseAccountingCostAdapter, private readonly fx: AccountingCostFxProjector) {}

  async execute(request: AuthenticatedAccountingCostsRequest) {
    // Keep this cast isolated until generated Prisma client types are refreshed after the additive schema migration.
    const configuration = await (this.prisma.tenantBillingConfiguration as unknown as { findUnique(input: unknown): Promise<{ fiscalTimezone: string; accountingCurrencyCode: string | null } | null> }).findUnique({ where: { tenantId: request.tenantId }, select: { fiscalTimezone: true, accountingCurrencyCode: true } });
    const timezone = configuration?.fiscalTimezone ?? "UTC";
    const accountingCurrencyCode = configuration?.accountingCurrencyCode?.toUpperCase() ?? null;
    const context = this.access.createReadContext({ tenantId: request.tenantId, actorUserId: request.actorUserId, role: request.role, timezone }, "ACCOUNTING_COSTS");
    const period = this.periods.resolve(request.period, timezone);
    const reader = this.reader(request.read);
    const [sourcePage, summaryRows] = await Promise.all([
      reader.readPage(context, period, request.read),
      reader.readSummary(context, period, request.read),
    ]);
    // One distinct (currency, effective-date) FX batch serves both the page and
    // full-filter summaries; no rate lookup is performed per purchase.
    const summaryProjectionRows = summaryRows.map((value) => summaryProjectionRow(value, timezone));
    const projected = await this.fx.projectRows({ tenantId: request.tenantId, timezone, accountingCurrencyCode, rows: [...sourcePage.items, ...summaryProjectionRows] });
    const rows = projected.slice(0, sourcePage.items.length);
    const summaryConversions = projected.slice(sourcePage.items.length);
    return {
      reportKey: "ACCOUNTING_COSTS" as const, period, generatedAt: new Date().toISOString(), timezone, accountingCurrencyCode, rows,
      summaries: summaries(summaryRows, summaryConversions, accountingCurrencyCode),
      pagination: { page: request.read.page, pageSize: request.read.pageSize, totalItems: sourcePage.totalItems, totalPages: sourcePage.totalItems === 0 ? 0 : Math.ceil(sourcePage.totalItems / request.read.pageSize) },
    };
  }

  private reader(request: AccountingCostReadRequest): AccountingCostSourceReader {
    const readers: readonly AccountingCostSourceReader[] = [this.purchases];
    const reader = readers.find((candidate) => candidate.sourceType === (request.filter?.sourceType ?? "OPERATIONAL_PURCHASE"));
    if (!reader) throw new Error("ACCOUNTING_COST_SOURCE_UNSUPPORTED");
    return reader;
  }
}

function summaryProjectionRow(value: AccountingCostSummaryRow, timezone: string): AccountingCostRow {
  const subtotal = value.subtotal.toFixed(), tax = value.tax.toFixed();
  return {
    sourceType: "OPERATIONAL_PURCHASE", sourceId: `summary:${value.currency}:${value.effectiveOn}`, sourceDate: tenantCalendarDateStartAsUtc(value.effectiveOn, timezone), description: "", counterparty: { kind: "OTHER", name: "" }, subtotal, tax, total: value.subtotal.plus(value.tax).toFixed(), currency: value.currency,
    conversion: { status: "FX_MISSING", baseCurrency: "", exchangeRate: null, subtotal: null, tax: null, total: null, authority: null, effectiveOn: value.effectiveOn, operation: null }, reference: { supplierReference: null, documentNumber: null }, evidence: { available: false, count: 0 }, status: "", cancelled: false,
    context: { sourceCategory: "OTHER", servicePurpose: { code: "", name: "" }, requirementDescription: "" }, fxSnapshot: value.fxSnapshot,
  };
}

function summaries(source: readonly AccountingCostSummaryRow[], converted: readonly AccountingCostRow[], accountingCurrencyCode: string | null) {
  const original = new Map<string, { count: number; subtotal: string; tax: string; total: string }>();
  const missing = new Map<string, { count: number; subtotal: string; tax: string; total: string }>();
  const base = new Map<string, { countConverted: number; subtotal: string; tax: string; total: string }>();
  let missingConversionCount = 0, invalidSnapshotCount = 0;
  for (let index = 0; index < source.length; index += 1) {
    const sourceRow = source[index], conversion = converted[index].conversion, subtotal = sourceRow.subtotal.toFixed(), tax = sourceRow.tax.toFixed(), total = sourceRow.subtotal.plus(sourceRow.tax).toFixed();
    accumulate(original, sourceRow.currency, sourceRow.count, subtotal, tax, total);
    if (conversion.status === "FX_MISSING" || conversion.status === "FX_SNAPSHOT_INVALID") {
      missingConversionCount += sourceRow.count;
      if (conversion.status === "FX_SNAPSHOT_INVALID") invalidSnapshotCount += sourceRow.count;
      accumulate(missing, sourceRow.currency, sourceRow.count, subtotal, tax, total);
      continue;
    }
    const current = base.get(conversion.baseCurrency) ?? { countConverted: 0, subtotal: "0", tax: "0", total: "0" };
    current.countConverted += sourceRow.count;
    current.subtotal = addDecimal(current.subtotal, conversion.subtotal!); current.tax = addDecimal(current.tax, conversion.tax!); current.total = addDecimal(current.total, conversion.total!);
    base.set(conversion.baseCurrency, current);
  }
  const baseByCurrency = [...base.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([baseCurrency, value]) => ({ baseCurrency, ...value }));
  const configured = accountingCurrencyCode ? base.get(accountingCurrencyCode) : undefined;
  return {
    byCurrency: [...original.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, value]) => ({ currency, ...value })),
    base: { baseCurrency: accountingCurrencyCode ?? "", countConverted: configured?.countConverted ?? 0, subtotal: configured?.subtotal ?? "0", tax: configured?.tax ?? "0", total: configured?.total ?? "0", isPartial: missingConversionCount > 0, missingConversionCount, invalidSnapshotCount },
    baseByCurrency,
    missingConversionsByCurrency: [...missing.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, value]) => ({ currency, ...value })),
  };
}
function accumulate(target: Map<string, { count: number; subtotal: string; tax: string; total: string }>, currency: string, count: number, subtotal: string, tax: string, total: string) { const current = target.get(currency) ?? { count: 0, subtotal: "0", tax: "0", total: "0" }; current.count += count; current.subtotal = addDecimal(current.subtotal, subtotal); current.tax = addDecimal(current.tax, tax); current.total = addDecimal(current.total, total); target.set(currency, current); }
