import { Prisma } from "@prisma/client";
import { ReportingAccessPolicy } from "../access/reporting-access-policy";
import { ReportingPeriodResolver } from "../period/reporting-period.resolver";
import { AccountingCostsService } from "./accounting-costs.service";
import { AccountingCostFxProjector } from "./accounting-cost-fx.projector";
import { OperationalPurchaseAccountingCostAdapter } from "./operational-purchase-accounting-cost.adapter";
import { AccountingCostEvidenceService } from "./accounting-cost-evidence.service";
import { DailyExchangeRateResolver } from "../../exchange-rate/daily-exchange-rate.resolver";
import { parseAccountingCostsQuery } from "./accounting-costs.dto";

const decimal = (value: string) => new Prisma.Decimal(value);
const context = { tenantId: "tenant-a", actorUserId: "user-a", role: "CONTADOR" as any, timezone: "America/Costa_Rica", reportKey: "ACCOUNTING_COSTS" as const };
const period = { startOn: "2026-10-10", endOn: "2026-10-10" };

describe("Accounting Costs reporting", () => {
  it("normalizes OperationalPurchase financial authority, direct evidence, cancelled status, and base-trip context", async () => {
    const prisma = purchasePrisma({ accountingCurrencyCode: "CRC", exchangeRate: decimal("500"), exchangeRateAuthority: "BCCR_REFERENCE_SELL_318", exchangeRateEffectiveDate: new Date("2026-10-10T00:00:00.000Z"), exchangeRateObservationId: "observation-a", exchangeRateIndicator: "318", exchangeRateOperation: "MULTIPLY" });
    const adapter = new OperationalPurchaseAccountingCostAdapter(prisma as never);
    const result = await adapter.readPage(context, period, { page: 1, pageSize: 20 });
    expect(result.items[0]).toMatchObject({ sourceType: "OPERATIONAL_PURCHASE", sourceId: "purchase-a", counterparty: { kind: "SUPPLIER", name: "Purchase provider" }, subtotal: "12.5", tax: "0", total: "12.5", evidence: { available: true, count: 2 }, status: "CANCELLED", cancelled: true, context: { sourceCategory: "BASE_TRIP", requirementDescription: "Immutable requirement" } });
    expect(result.items[0].fxSnapshot).toMatchObject({ accountingCurrencyCode: "CRC", exchangeRate: decimal("500"), exchangeRateAuthority: "BCCR_REFERENCE_SELL_318", exchangeRateObservationId: "observation-a", exchangeRateIndicator: "318", exchangeRateOperation: "MULTIPLY" });
    expect(prisma.operationalPurchase.findMany.mock.calls[0][0].orderBy).toEqual([{ purchasedAt: "desc" }, { id: "desc" }]);
  });

  it("derives total from the persisted OperationalPurchase subtotal and tax without CostSnapshot input", async () => {
    const prisma = purchasePrisma({ amount: decimal("12.5"), taxAmount: decimal("1.25") });
    const result = await new OperationalPurchaseAccountingCostAdapter(prisma as never).readPage(context, period, { page: 1, pageSize: 20 });
    expect(result.items[0]).toMatchObject({ subtotal: "12.5", tax: "1.25", total: "13.75" });
    expect(prisma).not.toHaveProperty("costSnapshot");
  });

  it("uses immutable requirement context and bounded CQ enrichment", async () => {
    const prisma = purchasePrisma({ sourceType: "CUSTOM_QUOTATION_LINE", sourceId: "version-a", travelPackageId: null, customerId: "customer-a" });
    prisma.customQuotationVersion.findMany.mockResolvedValue([{ id: "version-a", versionNumber: 2, customQuotationId: "quotation-a", customQuotation: { quotationNumber: "CQ-1" }, salesOrder: { orderNumber: "SO-1" } }]);
    const result = await new OperationalPurchaseAccountingCostAdapter(prisma as never).readPage(context, period, { page: 1, pageSize: 20 });
    expect(result.items[0].context).toMatchObject({ sourceCategory: "CUSTOM_QUOTATION", customer: { id: "customer-a", name: "Customer" }, quotation: { versionId: "version-a", number: "CQ-1" }, salesOrderNumber: "SO-1" });
    expect(prisma.customQuotationVersion.findMany).toHaveBeenCalledTimes(1);
  });

  it("maps Additional Service requirement context without reading a mutable catalog", async () => {
    const prisma = purchasePrisma({ sourceType: "ADDITIONAL_SERVICE_ORDER_LINE" });
    const result = await new OperationalPurchaseAccountingCostAdapter(prisma as never).readPage(context, period, { page: 1, pageSize: 20 });
    expect(result.items[0].context).toMatchObject({ sourceCategory: "ADDITIONAL_SERVICES", requirementDescription: "Immutable requirement" });
    expect(prisma).not.toHaveProperty("additionalServiceCatalog");
  });

  it("batches FX by distinct currency/effective date and never treats a missing rate as identity", async () => {
    const rates = { resolvePersistedDailyExchangeRates: jest.fn().mockResolvedValue(new Map([["USD\u00002026-10-10", { baseCurrencyCode: "CRC", source: "BCCR", effectiveDate: "2026-10-10", status: "AVAILABLE", rate: decimal("500") }], ["EUR\u00002026-10-10", { baseCurrencyCode: "CRC", source: "BCCR", effectiveDate: "2026-10-10", status: "MISSING" }]])) };
    const projector = new AccountingCostFxProjector(rates as never);
    const rows = await projector.projectRows({ tenantId: "tenant-a", timezone: "America/Costa_Rica", accountingCurrencyCode: "CRC", rows: [row({ currency: "USD", subtotal: "2", tax: "0.5", total: "2.5" }), row({ sourceId: "p2", currency: "USD", subtotal: "3", tax: "0", total: "3" }), row({ sourceId: "p3", currency: "EUR", subtotal: "9", tax: "1", total: "10" }), row({ sourceId: "p4", currency: "CRC", subtotal: "7", tax: "2", total: "9" })] });
    expect(rates.resolvePersistedDailyExchangeRates).toHaveBeenCalledWith(expect.objectContaining({ requests: expect.arrayContaining([{ currencyCode: "USD", effectiveDate: "2026-10-10" }]) }));
    expect(rows.map((value) => value.conversion.status)).toEqual(["AVAILABLE", "AVAILABLE", "FX_MISSING", "IDENTITY"]);
    expect(rows[0].conversion).toMatchObject({ exchangeRate: "500", subtotal: "1000", tax: "250", total: "1250", authority: "BCCR_REFERENCE_SELL_318" });
    expect(rows[2].conversion.subtotal).toBeNull(); expect(rows[3].conversion.total).toBe("9");
  });

  it("uses complete frozen identity, BCCR, and manual snapshots without any historical lookup", async () => {
    const rates = { resolvePersistedDailyExchangeRates: jest.fn() };
    const projector = new AccountingCostFxProjector(rates as never);
    const rows = await projector.projectRows({
      tenantId: "tenant-a", timezone: "America/Costa_Rica", accountingCurrencyCode: "COP", rows: [
        row({ currency: "CRC", subtotal: "2", tax: "0.5", total: "2.5", fxSnapshot: snapshot({ accountingCurrencyCode: "CRC", exchangeRate: decimal("1"), exchangeRateAuthority: "IDENTITY", exchangeRateOperation: "IDENTITY" }) }),
        row({ sourceId: "bccr", currency: "USD", subtotal: "2", tax: "0.5", total: "2.5", fxSnapshot: snapshot({ exchangeRate: decimal("500.25"), exchangeRateAuthority: "BCCR_REFERENCE_SELL_318", exchangeRateOperation: "MULTIPLY", exchangeRateObservationId: "observation-a", exchangeRateIndicator: "318" }) }),
        row({ sourceId: "manual", currency: "CRC", subtotal: "1000.5", tax: "0", total: "1000.5", fxSnapshot: snapshot({ accountingCurrencyCode: "USD", exchangeRate: decimal("500.25"), exchangeRateAuthority: "MANUAL_SELL", exchangeRateOperation: "DIVIDE" }) }),
      ],
    });
    expect(rates.resolvePersistedDailyExchangeRates).not.toHaveBeenCalled();
    expect(rows.map((value) => value.conversion.status)).toEqual(["IDENTITY", "AVAILABLE", "AVAILABLE"]);
    expect(rows[1].conversion).toMatchObject({ baseCurrency: "CRC", subtotal: "1000.5", tax: "250.125", total: "1250.625", authority: "BCCR_REFERENCE_SELL_318" });
    expect(rows[2].conversion).toMatchObject({ baseCurrency: "USD", subtotal: "2", total: "2", authority: "MANUAL_SELL", operation: "DIVIDE" });
  });

  it("uses the read-only exact-date resolver only for legacy rows with every snapshot field absent", async () => {
    const rates = { resolvePersistedDailyExchangeRates: jest.fn().mockResolvedValue(new Map([["USD\u00002026-10-10", { source: "MANUAL", status: "AVAILABLE", rate: decimal("500") }]])) };
    const projector = new AccountingCostFxProjector(rates as never);
    const rows = await projector.projectRows({ tenantId: "tenant-a", timezone: "America/Costa_Rica", accountingCurrencyCode: "CRC", rows: [row({ fxSnapshot: legacySnapshot() })] });
    expect(rates.resolvePersistedDailyExchangeRates).toHaveBeenCalledWith({ tenantId: "tenant-a", baseCurrencyCode: "CRC", requests: [{ currencyCode: "USD", effectiveDate: "2026-10-10" }] });
    expect(rows[0].conversion).toMatchObject({ status: "AVAILABLE", subtotal: "1000", authority: "MANUAL_SELL" });
  });

  it("marks a partial or corrupt snapshot invalid instead of reinterpreting it as legacy", async () => {
    const rates = { resolvePersistedDailyExchangeRates: jest.fn() };
    const projector = new AccountingCostFxProjector(rates as never);
    const rows = await projector.projectRows({ tenantId: "tenant-a", timezone: "America/Costa_Rica", accountingCurrencyCode: "CRC", rows: [row({ fxSnapshot: snapshot({ exchangeRate: decimal("500"), exchangeRateAuthority: "BCCR_REFERENCE_SELL_318", exchangeRateOperation: "MULTIPLY", exchangeRateObservationId: null, exchangeRateIndicator: "318" }) })] });
    expect(rows[0].conversion).toMatchObject({ status: "FX_SNAPSHOT_INVALID", subtotal: null, total: null });
    expect(rates.resolvePersistedDailyExchangeRates).not.toHaveBeenCalled();
  });

  it("returns full-result original/base summaries and marks missing conversion partial", async () => {
    const source = { sourceType: "OPERATIONAL_PURCHASE", readPage: jest.fn().mockResolvedValue({ items: [row()], totalItems: 1 }), readSummary: jest.fn().mockResolvedValue([{ currency: "USD", effectiveOn: "2026-10-10", count: 2, subtotal: decimal("5"), tax: decimal("1") }, { currency: "EUR", effectiveOn: "2026-10-10", count: 1, subtotal: decimal("9"), tax: decimal("0") }]) };
    const fx = { projectRows: jest.fn().mockResolvedValue([row({ conversion: available("CRC", "500", "1000", "0", "1000") }), row({ conversion: available("CRC", "500", "2500", "500", "3000") }), row({ conversion: missing("CRC") })]) };
    const prisma = { tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Costa_Rica", accountingCurrencyCode: "CRC", defaultCurrencyCode: "USD" }) } };
    const service = new AccountingCostsService(prisma as never, new ReportingAccessPolicy(), new ReportingPeriodResolver(), source as never, fx as never);
    const report = await service.execute({ tenantId: "tenant-a", actorUserId: "user-a", role: "CONTADOR" as any, period: { kind: "CUSTOM", startOn: "2026-10-10", endOn: "2026-10-10" }, read: { page: 1, pageSize: 20 } });
    expect(report.summaries).toMatchObject({ byCurrency: [{ currency: "EUR", count: 1 }, { currency: "USD", count: 2, total: "6" }], base: { baseCurrency: "CRC", countConverted: 2, total: "3000", isPartial: true, missingConversionCount: 1 }, missingConversionsByCurrency: [{ currency: "EUR", count: 1 }] });
    expect(report.summaries.baseByCurrency).toEqual([{ baseCurrency: "CRC", countConverted: 2, subtotal: "2500", tax: "500", total: "3000" }]);
    expect(prisma.tenantBillingConfiguration.findUnique).toHaveBeenCalledWith({ where: { tenantId: "tenant-a" }, select: { fiscalTimezone: true, accountingCurrencyCode: true } });
  });

  it("marks the base summary partial and exposes the invalid snapshot count", async () => {
    const source = { sourceType: "OPERATIONAL_PURCHASE", readPage: jest.fn().mockResolvedValue({ items: [row()], totalItems: 1 }), readSummary: jest.fn().mockResolvedValue([{ currency: "USD", effectiveOn: "2026-10-10", count: 1, subtotal: decimal("5"), tax: decimal("0"), fxSnapshot: legacySnapshot() }]) };
    const fx = { projectRows: jest.fn().mockResolvedValue([row({ conversion: available("CRC", "500", "1000", "0", "1000") }), row({ conversion: { ...missing("CRC"), status: "FX_SNAPSHOT_INVALID" } })]) };
    const prisma = { tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Costa_Rica", accountingCurrencyCode: "CRC" }) } };
    const report = await new AccountingCostsService(prisma as never, new ReportingAccessPolicy(), new ReportingPeriodResolver(), source as never, fx as never).execute({ tenantId: "tenant-a", actorUserId: "user-a", role: "CONTADOR" as any, period: { kind: "CUSTOM", startOn: "2026-10-10", endOn: "2026-10-10" }, read: { page: 1, pageSize: 20 } });
    expect(report.summaries.base).toMatchObject({ isPartial: true, missingConversionCount: 1, invalidSnapshotCount: 1, countConverted: 0 });
  });

  it("scopes evidence to the tenant and direct purchase without exposing object keys", async () => {
    const prisma = { operationalPurchase: { findFirst: jest.fn().mockResolvedValue({ id: "purchase-a" }) }, operationalEvidence: { findMany: jest.fn().mockResolvedValue([evidence()]), count: jest.fn().mockResolvedValue(1), findFirst: jest.fn().mockResolvedValue(evidence()) } };
    const storage = { generateSignedUrl: jest.fn().mockResolvedValue("https://signed") };
    const service = new AccountingCostEvidenceService(prisma as never, storage as never);
    const list = await service.list("tenant-a", "purchase-a", 1, 20); const access = await service.access("tenant-a", "purchase-a", "evidence-a");
    expect(prisma.operationalEvidence.findMany.mock.calls[0][0].where).toEqual({ tenantId: "tenant-a", operationalPurchaseId: "purchase-a" });
    expect(list.items[0]).not.toHaveProperty("objectKey"); expect(access).not.toHaveProperty("objectKey"); expect(access.url).toBe("https://signed");
  });

  it("uses a persisted BCCR batch lookup without invoking the write-capable official resolver", async () => {
    const official = { resolveExactObservation: jest.fn() };
    const prisma = { tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ defaultCurrencyCode: "CRC", exchangeRateSource: "BCCR" }) }, officialExchangeRateObservation: { findMany: jest.fn().mockResolvedValue([{ effectiveDate: new Date("2026-10-10T00:00:00.000Z"), value: decimal("500.1") }]) }, exchangeRate: { findMany: jest.fn() } };
    const resolver = new DailyExchangeRateResolver(prisma as never, {} as never, official as never);
    const result = await resolver.resolvePersistedDailyExchangeRates({ tenantId: "tenant-a", requests: [{ currencyCode: "USD", effectiveDate: "2026-10-10" }] });
    expect(result.get("USD\u00002026-10-10")).toMatchObject({ status: "AVAILABLE", rate: decimal("500.1") });
    expect(official.resolveExactObservation).not.toHaveBeenCalled();
  });

  it("uses the exact-date manual sell rate as current historical report authority", async () => {
    const prisma = { tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ defaultCurrencyCode: "CRC", exchangeRateSource: "MANUAL" }) }, officialExchangeRateObservation: { findMany: jest.fn() }, exchangeRate: { findMany: jest.fn().mockResolvedValue([{ date: new Date(2026, 9, 10), sellRate: decimal("499.5") }]) } };
    const result = await new DailyExchangeRateResolver(prisma as never, {} as never, {} as never).resolvePersistedDailyExchangeRates({ tenantId: "tenant-a", requests: [{ currencyCode: "USD", effectiveDate: "2026-10-10" }] });
    expect(result.get("USD\u00002026-10-10")).toMatchObject({ source: "MANUAL", status: "AVAILABLE", rate: decimal("499.5") });
    expect(prisma.officialExchangeRateObservation.findMany).not.toHaveBeenCalled();
  });

  it("caps pagination at 25 and exposes supported accounting filters", () => {
    expect(() => parseAccountingCostsQuery({ pageSize: "26" } as any)).toThrow("REPORTING_PAGINATION_INVALID");
    expect(parseAccountingCostsQuery({ periodPreset: "CUSTOM", dateFrom: "2026-10-10", dateTo: "2026-10-10", counterpartySearch: "Sup", currency: "usd", servicePurposeCode: "AIRFARE", status: "CANCELLED", travelPackageId: "trip-a", customerId: "customer-a" } as any).read).toMatchObject({ pageSize: 20, filter: { counterpartySearch: "Sup", currency: "USD", servicePurposeCode: "AIRFARE", status: "CANCELLED" }, operational: { travelPackageId: "trip-a", customerId: "customer-a" } });
  });
});

function purchasePrisma(overrides: Record<string, unknown> = {}) { const customerId = overrides.customerId ?? null; const purchase = { id: "purchase-a", purchasedAt: new Date("2026-10-11T02:00:00.000Z"), providerName: "Purchase provider", supplierReference: "ref", supplierInvoiceNumber: "invoice", amount: decimal("12.5"), taxAmount: null, currency: "USD", accountingCurrencyCode: null, exchangeRate: null, exchangeRateAuthority: null, exchangeRateEffectiveDate: null, exchangeRateObservationId: null, exchangeRateIndicator: null, exchangeRateOperation: null, _count: { evidence: 2 }, operationalFulfillment: { status: "CANCELLED", operationalRequirement: { sourceType: "TRAVEL_PACKAGE_COST_COMPONENT", sourceId: "project-a", sourceVersionId: null, description: "Immutable requirement", servicePurposeCode: "AIRFARE", servicePurposeName: "Airfare", travelPackageId: "travel-a", customerId, travelPackage: { name: "Package", packageCode: "PKG-1" }, customer: customerId ? { fullName: "Customer" } : null, ...overrides } }, ...overrides }; return { operationalPurchase: { findMany: jest.fn().mockResolvedValue([purchase]), count: jest.fn().mockResolvedValue(1) }, customQuotationVersion: { findMany: jest.fn().mockResolvedValue([]) } }; }
function row(overrides: any = {}): any { return { sourceType: "OPERATIONAL_PURCHASE", sourceId: "purchase-a", sourceDate: new Date("2026-10-11T02:00:00.000Z"), description: "", counterparty: { kind: "SUPPLIER", name: "provider" }, subtotal: "2", tax: "0", total: "2", currency: "USD", conversion: missing("CRC"), reference: { supplierReference: null, documentNumber: null }, evidence: { available: false, count: 0 }, status: "", cancelled: false, context: { sourceCategory: "BASE_TRIP", servicePurpose: { code: "", name: "" }, requirementDescription: "" }, ...overrides }; }
function snapshot(overrides: any = {}) { return { accountingCurrencyCode: "CRC", exchangeRate: null, exchangeRateAuthority: null, exchangeRateEffectiveDate: new Date("2026-10-10T00:00:00.000Z"), exchangeRateObservationId: null, exchangeRateIndicator: null, exchangeRateOperation: null, ...overrides }; }
function legacySnapshot() { return { accountingCurrencyCode: null, exchangeRate: null, exchangeRateAuthority: null, exchangeRateEffectiveDate: null, exchangeRateObservationId: null, exchangeRateIndicator: null, exchangeRateOperation: null }; }
function available(baseCurrency: string, exchangeRate: string, subtotal: string, tax: string, total: string) { return { status: "AVAILABLE", baseCurrency, exchangeRate, subtotal, tax, total, authority: "BCCR_REFERENCE_SELL_318", effectiveOn: "2026-10-10", operation: "MULTIPLY" }; }
function missing(baseCurrency: string) { return { status: "FX_MISSING", baseCurrency, exchangeRate: null, subtotal: null, tax: null, total: null, authority: null, effectiveOn: "2026-10-10", operation: null }; }
function evidence() { return { id: "evidence-a", originalFilename: "invoice.pdf", mimeType: "application/pdf", byteSize: 4, evidenceType: "SUPPLIER_INVOICE", createdAt: new Date(), objectKey: "private/key" }; }
