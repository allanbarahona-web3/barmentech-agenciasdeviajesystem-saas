import { Prisma } from "@prisma/client";
import { OfficialExchangeRateResolver } from "../official-exchange-rates/official-exchange-rate.resolver";
import { PrismaService } from "../prisma/prisma.service";
import { DailyExchangeRateResolver, convertDailyExchangeRateAmount, convertDailySettlementAmount, resolveDailySettlement } from "./daily-exchange-rate.resolver";
import { ExchangeRateService } from "./exchange-rate.service";

describe("DailyExchangeRateResolver", () => {
  it("uses the tenant's exact-date manual sell rate as a Decimal", async () => {
    const { resolver, prisma, manualRates, officialRates } = subject({ exchangeRateSource: "MANUAL" });
    manualRates.findExactDailyRate.mockResolvedValue(manualRate({ sellRate: decimal("501.1234") }));

    await expect(resolver.resolveDailyExchangeRate({
      tenantId: "tenant-a", currencyCodes: ["CRC", "USD"], effectiveDate: "2026-09-12",
    })).resolves.toMatchObject({
      baseCurrencyCode: "CRC", source: "MANUAL", effectiveDate: "2026-09-12", status: "AVAILABLE", rate: decimal("501.1234"),
    });

    expect(prisma.tenantBillingConfiguration.findUnique).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a" },
      select: { defaultCurrencyCode: true, exchangeRateSource: true },
    });
    expect(manualRates.findExactDailyRate).toHaveBeenCalledWith("tenant-a", "2026-09-12");
    expect(officialRates.resolveExactObservation).not.toHaveBeenCalled();
  });

  it("reports MISSING for a manual tenant without an exact daily rate", async () => {
    const { resolver, manualRates, officialRates } = subject({ exchangeRateSource: "MANUAL" });
    manualRates.findExactDailyRate.mockResolvedValue(null);

    await expect(resolver.resolveDailyExchangeRate({
      tenantId: "tenant-a", currencyCodes: ["USD"], effectiveDate: "2026-09-12",
    })).resolves.toEqual({
      baseCurrencyCode: "CRC", source: "MANUAL", effectiveDate: "2026-09-12", status: "MISSING",
    });
    expect(officialRates.resolveExactObservation).not.toHaveBeenCalled();
  });

  it("delegates BCCR resolution through the same Fiscal official resolver and ignores a same-day manual rate", async () => {
    const { resolver, manualRates, officialRates } = subject({ exchangeRateSource: "BCCR" });
    manualRates.findExactDailyRate.mockResolvedValue(manualRate({ sellRate: decimal("499.9999") }));
    officialRates.resolveExactObservation.mockResolvedValue(officialObservation("502.2222"));

    const result = await resolver.resolveDailyExchangeRate({
      tenantId: "tenant-a", currencyCodes: ["USD"], effectiveDate: "2026-09-12",
    });

    expect(result).toMatchObject({ source: "BCCR", status: "AVAILABLE", rate: decimal("502.2222") });
    expect(officialRates.resolveExactObservation).toHaveBeenCalledWith({
      countryCode: "CR", foreignCurrencyCode: "USD", localCurrencyCode: "CRC", rateType: "REFERENCE_SELL", effectiveDate: "2026-09-12",
    });
    expect(manualRates.findExactDailyRate).not.toHaveBeenCalled();
  });

  it("reports MISSING when the official resolver has no applicable BCCR rate", async () => {
    const { resolver, officialRates } = subject({ exchangeRateSource: "BCCR" });
    officialRates.resolveExactObservation.mockRejectedValue(new Error("OFFICIAL_EXCHANGE_RATE_NOT_AVAILABLE"));

    await expect(resolver.resolveDailyExchangeRate({
      tenantId: "tenant-a", currencyCodes: ["USD"], effectiveDate: "2026-09-12",
    })).resolves.toMatchObject({ source: "BCCR", status: "MISSING" });
  });

  it("does not look up FX when all activity is already in the base currency", async () => {
    const { resolver, manualRates, officialRates } = subject({ exchangeRateSource: "MANUAL" });

    await expect(resolver.resolveDailyExchangeRate({
      tenantId: "tenant-a", currencyCodes: ["CRC"], effectiveDate: "2026-09-12",
    })).resolves.toEqual({
      baseCurrencyCode: "CRC", source: "MANUAL", effectiveDate: "2026-09-12", status: "NOT_REQUIRED",
    });
    expect(manualRates.findExactDailyRate).not.toHaveBeenCalled();
    expect(officialRates.resolveExactObservation).not.toHaveBeenCalled();
  });

  it("converts USD to CRC and CRC to USD with Decimal arithmetic", () => {
    const crcRate = resolution({ baseCurrencyCode: "CRC", rate: decimal("500.25") });
    const usdRate = resolution({ baseCurrencyCode: "USD", rate: decimal("500.25") });

    expect(convertDailyExchangeRateAmount(decimal("2"), "USD", crcRate)?.toFixed()).toBe("1000.5");
    expect(convertDailyExchangeRateAmount(decimal("1000.5"), "CRC", usdRate)?.toFixed()).toBe("2");
  });

  it("converts settlement money in both USD/CRC directions without Number arithmetic", () => {
    const resolved = resolution({ rate: decimal("449.94") });

    expect(convertDailySettlementAmount(decimal("100000"), "CRC", "USD", resolved)?.toDecimalPlaces(5, Prisma.Decimal.ROUND_HALF_UP).toFixed(5)).toBe("222.25186");
    expect(convertDailySettlementAmount(decimal("200"), "USD", "CRC", resolved)?.toFixed()).toBe("89988");
  });

  it("resolves the five-decimal settlement result shared by preview and approval", async () => {
    const resolver = { resolveDailyExchangeRate: jest.fn().mockResolvedValue(resolution({ rate: decimal("449.94") })) };

    await expect(resolveDailySettlement({
      resolver: resolver as unknown as DailyExchangeRateResolver,
      tenantId: "tenant-a",
      receivedCurrencyCode: "CRC",
      settlementCurrencyCode: "USD",
      receivedAmount: decimal("89988"),
    })).resolves.toMatchObject({
      currencyCode: "USD",
      amount: decimal("200.00000"),
      exchangeRate: decimal("449.94"),
      exchangeRateSource: "MANUAL",
      exchangeRateEffectiveDate: "2026-09-12",
    });
    expect(resolver.resolveDailyExchangeRate).toHaveBeenCalledTimes(1);
  });

  it("keeps the existing manual public API Number-normalized while exposing an internal Decimal read", async () => {
    const row = manualRate({ buyRate: decimal("499.1234"), sellRate: decimal("500.5678") });
    const prisma = { exchangeRate: { findUnique: jest.fn().mockResolvedValue(row) } };
    const service = new ExchangeRateService(prisma as unknown as PrismaService, {} as never, {} as never);

    await expect(service.getExchangeRate("tenant-a", "2026-09-12")).resolves.toMatchObject({
      buyRate: 499.1234,
      sellRate: 500.5678,
    });
    await expect(service.findExactDailyRate("tenant-a", "2026-09-12")).resolves.toMatchObject({
      buyRate: decimal("499.1234"),
      sellRate: decimal("500.5678"),
    });
  });
});

function subject(configuration: { defaultCurrencyCode?: string; exchangeRateSource?: string }) {
  const prisma = {
    tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ defaultCurrencyCode: "CRC", ...configuration }) },
  };
  const manualRates = { findExactDailyRate: jest.fn() };
  const officialRates = { resolveExactObservation: jest.fn() };
  return {
    resolver: new DailyExchangeRateResolver(
      prisma as unknown as PrismaService,
      manualRates as unknown as ExchangeRateService,
      officialRates as unknown as OfficialExchangeRateResolver,
    ),
    prisma,
    manualRates,
    officialRates,
  };
}

function manualRate(overrides: Record<string, unknown> = {}) {
  return {
    id: "rate-a", date: new Date("2026-09-12T00:00:00.000Z"), buyRate: decimal("499.5000"), sellRate: decimal("500.0000"),
    source: "MANUAL", setByName: "Agency", notes: null, createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
}

function officialObservation(value: string) {
  return { value } as Awaited<ReturnType<OfficialExchangeRateResolver["resolveExactObservation"]>>;
}

function resolution(overrides: Record<string, unknown> = {}) {
  return {
    baseCurrencyCode: "CRC", source: "MANUAL" as const, effectiveDate: "2026-09-12", status: "AVAILABLE" as const, rate: decimal("500"), ...overrides,
  };
}

function decimal(value: string) {
  return new Prisma.Decimal(value);
}
