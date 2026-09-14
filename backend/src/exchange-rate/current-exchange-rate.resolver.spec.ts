import { Prisma } from "@prisma/client";
import { CurrentExchangeRateResolver } from "./current-exchange-rate.resolver";
import { ExchangeRateService } from "./exchange-rate.service";
import { OfficialExchangeRateResolver } from "../official-exchange-rates/official-exchange-rate.resolver";
import { PrismaService } from "../prisma/prisma.service";
import { DateUtils } from "../common/utils/date.utils";

describe("CurrentExchangeRateResolver", () => {
  it("keeps the manual current-rate contract on the tenant's exact daily row", async () => {
    const { resolver, manualRates, officialRates } = subject("MANUAL");
    manualRates.findExactDailyRate.mockResolvedValue(manualRate());

    await expect(resolver.resolveCurrentExchangeRate("tenant-a")).resolves.toMatchObject({
      status: "AVAILABLE",
      rate: {
        date: today(), effectiveDate: today(), source: "MANUAL", buyRate: 500.1, sellRate: 503.2,
        id: "manual-a", setByName: "Admin",
      },
    });
    expect(manualRates.findExactDailyRate).toHaveBeenCalledWith("tenant-a", today());
    expect(officialRates.resolveExactObservation).not.toHaveBeenCalled();
  });

  it("resolves and exposes persisted BCCR buy 317 and sell 318 together", async () => {
    const { resolver, manualRates, officialRates } = subject("BCCR");
    officialRates.resolveExactObservation
      .mockResolvedValueOnce(official("REFERENCE_BUY", "501.1234", "317"))
      .mockResolvedValueOnce(official("REFERENCE_SELL", "503.5678", "318"));

    await expect(resolver.resolveCurrentExchangeRate("tenant-a")).resolves.toMatchObject({
      status: "AVAILABLE",
      rate: { date: today(), effectiveDate: today(), source: "BCCR", buyRate: 501.1234, sellRate: 503.5678 },
    });
    expect(officialRates.resolveExactObservation).toHaveBeenNthCalledWith(1, expect.objectContaining({ rateType: "REFERENCE_BUY", effectiveDate: today() }));
    expect(officialRates.resolveExactObservation).toHaveBeenNthCalledWith(2, expect.objectContaining({ rateType: "REFERENCE_SELL", effectiveDate: today() }));
    expect(manualRates.findExactDailyRate).not.toHaveBeenCalled();
  });

  it("does not fabricate a BCCR current rate when one official side is missing", async () => {
    const { resolver, officialRates } = subject("BCCR");
    officialRates.resolveExactObservation
      .mockResolvedValueOnce(official("REFERENCE_BUY", "501.1234", "317"))
      .mockRejectedValueOnce(new Error("not available"));

    await expect(resolver.resolveCurrentExchangeRate("tenant-a")).resolves.toEqual({ rate: null, status: "INCOMPLETE" });
  });

  it("reports MISSING when neither BCCR observation is available", async () => {
    const { resolver, officialRates } = subject("BCCR");
    officialRates.resolveExactObservation.mockRejectedValue(new Error("not available"));

    await expect(resolver.resolveCurrentExchangeRate("tenant-a")).resolves.toEqual({ rate: null, status: "MISSING" });
  });
});

function subject(source: "MANUAL" | "BCCR") {
  const prisma = {
    tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ exchangeRateSource: source }) },
  };
  const manualRates = { findExactDailyRate: jest.fn() };
  const officialRates = { resolveExactObservation: jest.fn() };
  return {
    resolver: new CurrentExchangeRateResolver(
      prisma as unknown as PrismaService,
      manualRates as unknown as ExchangeRateService,
      officialRates as unknown as OfficialExchangeRateResolver,
    ),
    manualRates,
    officialRates,
  };
}

function manualRate() {
  return {
    id: "manual-a", date: new Date(`${today()}T00:00:00.000Z`), buyRate: new Prisma.Decimal("500.1"), sellRate: new Prisma.Decimal("503.2"),
    source: "MANUAL", setByName: "Admin", notes: null, createdAt: new Date(), updatedAt: new Date(),
  };
}

function official(rateType: "REFERENCE_BUY" | "REFERENCE_SELL", value: string, sourceIndicatorCode: string) {
  return {
    id: `${rateType}-a`, countryCode: "CR", foreignCurrencyCode: "USD", localCurrencyCode: "CRC", rateType,
    effectiveDate: today(), value, sourceAuthority: "BCCR", sourceIndicatorCode,
    retrievedAt: new Date("2026-09-13T10:00:00.000Z"), sourcePublishedAt: null, requestIdentity: "request", responseHash: "hash", newlyPersisted: true,
  };
}

function today() { return DateUtils.getCostaRicaToday().toISOString().slice(0, 10); }
