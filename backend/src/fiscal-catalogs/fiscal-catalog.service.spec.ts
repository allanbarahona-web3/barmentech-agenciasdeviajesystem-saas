import { Decimal } from "@prisma/client/runtime/library";
import { CabysProviderError, CabysProviderItem } from "./cabys-catalog.provider";
import { FiscalCatalogService, normalizeCabysSearchText } from "./fiscal-catalog.service";

const providerItem: CabysProviderItem = { code: "2349002011500", description: "Pan pita o pan árabe", referenceTaxPercentage: "1.0000" };
const localItem = { code: providerItem.code, description: "Descripción local", referenceTaxPercentage: new Decimal("13.0000") };

function setup() {
  const prisma = {
    tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ countryCode: "CR" }) },
    fiscalCatalogRelease: { findFirst: jest.fn() },
    fiscalCabysEntry: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
    fiscalUnitOfMeasureEntry: { findMany: jest.fn(), findFirst: jest.fn() },
    fiscalTaxEntry: { findMany: jest.fn(), findFirst: jest.fn() },
    fiscalTaxRateEntry: { findMany: jest.fn(), findFirst: jest.fn() },
  };
  const provider = { search: jest.fn(), findExact: jest.fn() };
  return { prisma, provider, service: new FiscalCatalogService(prisma as never, provider) };
}

describe("FiscalCatalogService", () => {
  it("normalizes CABYS text deterministically", () => expect(normalizeCabysSearchText("  PAN   Árabe  ")).toBe("pan arabe"));

  it("defaults missing billing configuration to CR and rejects unsupported country", async () => {
    const context = setup(); context.prisma.tenantBillingConfiguration.findUnique.mockResolvedValueOnce(null); context.prisma.fiscalCatalogRelease.findFirst.mockResolvedValue(null); context.provider.search.mockResolvedValue([]);
    await expect(context.service.searchCabys("tenant", "pan", 20)).resolves.toMatchObject({ meta: { mode: "LIVE" } });
    context.prisma.tenantBillingConfiguration.findUnique.mockResolvedValueOnce({ countryCode: "US" });
    await expect(context.service.searchCabys("tenant", "pan", 20)).rejects.toMatchObject({ response: expect.objectContaining({ code: "UNSUPPORTED_COUNTRY" }) });
  });

  it("requires a tenant-bound user", async () => {
    const context = setup(); await expect(context.service.units(undefined)).rejects.toMatchObject({ response: expect.objectContaining({ code: "TENANT_REQUIRED" }) });
  });

  it("merges local and provider results, preferring provider data, without writes", async () => {
    const context = setup(); context.prisma.fiscalCatalogRelease.findFirst.mockResolvedValue({ id: "cabys", version: "local" }); context.prisma.fiscalCabysEntry.findMany.mockResolvedValue([localItem]); context.provider.search.mockResolvedValue([providerItem]);
    const result = await context.service.searchCabys("tenant", "pan", 20);
    expect(result.items).toEqual([{ ...providerItem, persisted: true, source: "FACTURA_EN_CR" }]);
    expect(result.meta).toEqual({ query: "pan", top: 20, mode: "LIVE", degraded: false });
    expect(context.prisma.fiscalCabysEntry.create).not.toHaveBeenCalled();
  });

  it("returns a successful empty live result", async () => {
    const context = setup(); context.prisma.fiscalCatalogRelease.findFirst.mockResolvedValue(null); context.provider.search.mockResolvedValue([]);
    await expect(context.service.searchCabys("tenant", "none", 20)).resolves.toEqual({ items: [], meta: { query: "none", top: 20, mode: "LIVE", degraded: false } });
  });

  it("uses local degraded fallback and otherwise exposes a stable provider error", async () => {
    const context = setup(); context.prisma.fiscalCatalogRelease.findFirst.mockResolvedValue({ id: "cabys" }); context.prisma.fiscalCabysEntry.findMany.mockResolvedValue([localItem]); context.provider.search.mockRejectedValue(new CabysProviderError("CABYS_PROVIDER_TIMEOUT"));
    await expect(context.service.searchCabys("tenant", "pan", 20)).resolves.toMatchObject({ items: [expect.objectContaining({ source: "LOCAL" })], meta: { mode: "LOCAL_FALLBACK", degraded: true } });
    context.prisma.fiscalCabysEntry.findMany.mockResolvedValueOnce([]);
    await expect(context.service.searchCabys("tenant", "pan", 20)).rejects.toMatchObject({ response: expect.objectContaining({ code: "CABYS_PROVIDER_TIMEOUT" }) });
  });

  it("returns exact local CABYS without a provider call", async () => {
    const context = setup(); context.prisma.fiscalCatalogRelease.findFirst.mockResolvedValue({ id: "cabys" }); context.prisma.fiscalCabysEntry.findFirst.mockResolvedValue(localItem);
    await expect(context.service.findCabys("tenant", providerItem.code)).resolves.toMatchObject({ persisted: true, source: "LOCAL" });
    expect(context.provider.findExact).not.toHaveBeenCalled();
  });

  it("returns CABYS_NOT_FOUND for exact provider miss", async () => {
    const context = setup(); context.prisma.fiscalCatalogRelease.findFirst.mockResolvedValue(null); context.provider.findExact.mockResolvedValue(null);
    await expect(context.service.findCabys("tenant", providerItem.code)).rejects.toMatchObject({ response: expect.objectContaining({ code: "CABYS_NOT_FOUND" }) });
  });

  it("requires an active CABYS release before confirmation", async () => {
    const context = setup(); context.prisma.fiscalCatalogRelease.findFirst.mockResolvedValue(null);
    await expect(context.service.confirmCabys("tenant", providerItem.code)).rejects.toMatchObject({ response: expect.objectContaining({ code: "FISCAL_CATALOG_NOT_READY" }) });
    expect(context.provider.findExact).not.toHaveBeenCalled();
  });

  it("confirms exactly one provider item with Decimal and normalized search text", async () => {
    const context = setup(); context.prisma.fiscalCatalogRelease.findFirst.mockResolvedValue({ id: "cabys" }); context.provider.findExact.mockResolvedValue(providerItem); context.prisma.fiscalCabysEntry.create.mockImplementation(({ data }: { data: { code: string; description: string; referenceTaxPercentage: Decimal } }) => Promise.resolve(data));
    await expect(context.service.confirmCabys("tenant", providerItem.code)).resolves.toMatchObject({ code: providerItem.code, persisted: true });
    const data = context.prisma.fiscalCabysEntry.create.mock.calls[0][0].data;
    expect(data.searchText).toBe("2349002011500 pan pita o pan arabe");
    expect(data.referenceTaxPercentage).toBeInstanceOf(Decimal);
    expect(context.prisma.fiscalCabysEntry.create).toHaveBeenCalledTimes(1);
  });

  it("is idempotent and handles concurrent P2002 by returning the winner", async () => {
    const context = setup(); context.prisma.fiscalCatalogRelease.findFirst.mockResolvedValue({ id: "cabys" }); context.prisma.fiscalCabysEntry.findFirst.mockResolvedValueOnce(localItem);
    await expect(context.service.confirmCabys("tenant", providerItem.code)).resolves.toMatchObject({ persisted: true });
    expect(context.provider.findExact).not.toHaveBeenCalled();
    context.prisma.fiscalCabysEntry.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(localItem); context.provider.findExact.mockResolvedValue(providerItem); context.prisma.fiscalCabysEntry.create.mockRejectedValue({ code: "P2002" });
    await expect(context.service.confirmCabys("tenant", providerItem.code)).resolves.toMatchObject({ persisted: true });
  });

  it("rejects a provider exact-code mismatch", async () => {
    const context = setup(); context.prisma.fiscalCatalogRelease.findFirst.mockResolvedValue({ id: "cabys" }); context.provider.findExact.mockResolvedValue({ ...providerItem, code: "9999999999999" });
    await expect(context.service.confirmCabys("tenant", providerItem.code)).rejects.toMatchObject({ response: expect.objectContaining({ code: "CABYS_NOT_FOUND" }) });
  });

  it("reads only active coding entries and serializes active rates as strings", async () => {
    const context = setup(); context.prisma.fiscalCatalogRelease.findFirst.mockResolvedValue({ id: "coding", version: "4.4" }); context.prisma.fiscalUnitOfMeasureEntry.findMany.mockResolvedValue([{ code: "Sp", name: "Servicios Profesionales" }]); context.prisma.fiscalTaxEntry.findMany.mockResolvedValue([{ code: "01", name: "IVA" }]); context.prisma.fiscalTaxEntry.findFirst.mockResolvedValue({ id: "iva" }); context.prisma.fiscalTaxRateEntry.findMany.mockResolvedValue([{ code: "08", name: "Tarifa general 13%", percentage: new Decimal("13.0000") }]);
    await expect(context.service.units("tenant")).resolves.toMatchObject({ release: { version: "4.4" } });
    await expect(context.service.taxes("tenant")).resolves.toMatchObject({ items: [{ code: "01" }] });
    await expect(context.service.taxRates("tenant", "01")).resolves.toMatchObject({ items: [{ code: "08", percentage: "13.0000" }] });
    expect(context.prisma.fiscalTaxRateEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ isActive: true }) }));
    expect(context.provider.search).not.toHaveBeenCalled(); expect(context.provider.findExact).not.toHaveBeenCalled();
  });

  it("requires an ACTIVE coding release and an active tax entry", async () => {
    const context = setup(); context.prisma.fiscalCatalogRelease.findFirst.mockResolvedValueOnce(null);
    await expect(context.service.units("tenant")).rejects.toMatchObject({ response: expect.objectContaining({ code: "FISCAL_CATALOG_NOT_READY" }) });
    context.prisma.fiscalCatalogRelease.findFirst.mockResolvedValueOnce({ id: "coding", version: "4.4" }); context.prisma.fiscalTaxEntry.findFirst.mockResolvedValueOnce(null);
    await expect(context.service.taxRates("tenant", "99")).rejects.toMatchObject({ response: expect.objectContaining({ code: "FISCAL_CATALOG_ENTRY_NOT_FOUND" }) });
  });

  it("resolves authoritative active unit, tax, rate, and percentage", async () => {
    const context = setup();
    context.prisma.fiscalCatalogRelease.findFirst.mockResolvedValueOnce({ id: "cabys" }).mockResolvedValueOnce({ id: "coding", version: "4.4" });
    context.prisma.fiscalCabysEntry.findFirst.mockResolvedValue({ id: "cabys-entry" });
    context.prisma.fiscalUnitOfMeasureEntry.findFirst.mockResolvedValue({ code: "Sp" });
    context.prisma.fiscalTaxEntry.findFirst.mockResolvedValue({ id: "iva", code: "01" });
    context.prisma.fiscalTaxRateEntry.findFirst.mockResolvedValue({ code: "11", percentage: new Decimal("0.0000") });
    await expect(context.service.resolveFiscalSelection("tenant", { cabysCode: providerItem.code, unitOfMeasureCode: "Sp", taxCode: "01", taxRateCode: "11" }, false)).resolves.toEqual({ cabysCode: providerItem.code, unitOfMeasureCode: "Sp", taxCode: "01", taxRateCode: "11", taxPercentage: "0.0000" });
  });

  it("rejects missing or inactive authoritative entries", async () => {
    const context = setup(); context.prisma.fiscalCatalogRelease.findFirst.mockResolvedValue({ id: "cabys" }); context.prisma.fiscalCabysEntry.findFirst.mockResolvedValue(null);
    await expect(context.service.resolveFiscalSelection("tenant", { cabysCode: providerItem.code, unitOfMeasureCode: "Sp", taxCode: "01", taxRateCode: "08" }, false)).rejects.toMatchObject({ response: expect.objectContaining({ code: "FISCAL_CATALOG_ENTRY_NOT_FOUND" }) });
  });

  it("evaluates fiscal readiness in bounded batches and treats malformed stored percentages as invalid", async () => {
    const context = setup();
    context.prisma.fiscalCatalogRelease.findFirst
      .mockResolvedValueOnce({ id: "cabys" })
      .mockResolvedValueOnce({ id: "coding" });
    context.prisma.fiscalCabysEntry.findMany.mockResolvedValue([{ code: providerItem.code }]);
    context.prisma.fiscalUnitOfMeasureEntry.findMany.mockResolvedValue([{ code: "Sp" }]);
    context.prisma.fiscalTaxEntry.findMany.mockResolvedValue([{ id: "iva", code: "01" }]);
    context.prisma.fiscalTaxRateEntry.findMany.mockResolvedValue([
      { taxEntryId: "iva", code: "08", percentage: new Decimal("13.0000") },
    ]);

    const result = await context.service.evaluateFiscalProfiles("tenant", [
      { additionalServiceCatalogId: "ready", cabysCode: providerItem.code, unitOfMeasureCode: "Sp", taxCode: "01", taxRateCode: "08", taxPercentage: "13", isActive: true },
      { additionalServiceCatalogId: "invalid", cabysCode: providerItem.code, unitOfMeasureCode: "Sp", taxCode: "01", taxRateCode: "08", taxPercentage: "not-a-decimal", isActive: true },
      { additionalServiceCatalogId: "inactive", cabysCode: providerItem.code, unitOfMeasureCode: "Sp", taxCode: "01", taxRateCode: "08", taxPercentage: "13.0000", isActive: false },
    ]);

    expect(result.get("ready")).toEqual({ status: "READY", isReady: true, issues: [] });
    expect(result.get("invalid")).toEqual({ status: "INVALID", isReady: false, issues: ["TAX_PERCENTAGE_MISMATCH"] });
    expect(result.get("inactive")).toEqual({ status: "INACTIVE", isReady: false, issues: [] });
    expect(context.prisma.fiscalCabysEntry.findMany).toHaveBeenCalledTimes(1);
    expect(context.prisma.fiscalUnitOfMeasureEntry.findMany).toHaveBeenCalledTimes(1);
    expect(context.prisma.fiscalTaxEntry.findMany).toHaveBeenCalledTimes(1);
    expect(context.prisma.fiscalTaxRateEntry.findMany).toHaveBeenCalledTimes(1);
    expect(context.provider.findExact).not.toHaveBeenCalled();
  });
});
