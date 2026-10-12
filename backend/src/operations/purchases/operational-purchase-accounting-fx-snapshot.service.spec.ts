import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { OfficialExchangeRateResolver } from "../../official-exchange-rates/official-exchange-rate.resolver";
import { OperationalPurchaseAccountingFxSnapshotService } from "./operational-purchase-accounting-fx-snapshot.service";

describe("OperationalPurchaseAccountingFxSnapshotService", () => {
  it("keeps creation backward compatible when accounting currency is not configured", async () => {
    const c = context({ accountingCurrencyCode: null });

    await expect(c.service.resolve(request(c.tx))).resolves.toBeUndefined();
    expect(c.tx.exchangeRate.findUnique).not.toHaveBeenCalled();
    expect(c.officialRates.resolveExactObservation).not.toHaveBeenCalled();
  });

  it("freezes an IDENTITY snapshot without consulting an FX authority", async () => {
    const c = context({ accountingCurrencyCode: "usd" });

    await expect(c.service.resolve(request(c.tx))).resolves.toMatchObject({
      accountingCurrencyCode: "USD", exchangeRate: decimal("1"), exchangeRateAuthority: "IDENTITY",
      exchangeRateEffectiveDate: new Date("2026-10-10T00:00:00.000Z"), exchangeRateObservationId: null,
      exchangeRateIndicator: null, exchangeRateOperation: "IDENTITY",
    });
    expect(c.tx.exchangeRate.findUnique).not.toHaveBeenCalled();
    expect(c.officialRates.resolveExactObservation).not.toHaveBeenCalled();
  });

  it("uses the tenant-local economic date and freezes the exact BCCR sell observation", async () => {
    const c = context({ accountingCurrencyCode: "CRC", exchangeRateSource: "BCCR" });
    c.officialRates.resolveExactObservation.mockResolvedValue(official("observation-a", "502.123456789012"));

    await expect(c.service.resolve(request(c.tx))).resolves.toMatchObject({
      accountingCurrencyCode: "CRC", exchangeRate: decimal("502.123456789012"),
      exchangeRateAuthority: "BCCR_REFERENCE_SELL_318", exchangeRateObservationId: "observation-a",
      exchangeRateIndicator: "318", exchangeRateOperation: "MULTIPLY",
    });
    expect(c.officialRates.resolveExactObservation).toHaveBeenCalledWith({
      countryCode: "CR", foreignCurrencyCode: "USD", localCurrencyCode: "CRC",
      rateType: "REFERENCE_SELL", effectiveDate: "2026-10-10",
    });
  });

  it("uses the exact manual sell rate and keeps the persisted snapshot independent of later edits", async () => {
    const c = context({ accountingCurrencyCode: "CRC", exchangeRateSource: "MANUAL" });
    c.tx.exchangeRate.findUnique.mockResolvedValueOnce({ sellRate: decimal("501.1234") }).mockResolvedValueOnce({ sellRate: decimal("599.0000") });

    const first = await c.service.resolve(request(c.tx));
    const second = await c.service.resolve(request(c.tx));

    expect(first).toMatchObject({ exchangeRate: decimal("501.1234"), exchangeRateAuthority: "MANUAL_SELL", exchangeRateObservationId: null, exchangeRateIndicator: null, exchangeRateOperation: "MULTIPLY" });
    expect(second).toMatchObject({ exchangeRate: decimal("599.0000") });
    expect(first?.exchangeRate.toFixed()).toBe("501.1234");
    expect(c.tx.exchangeRate.findUnique).toHaveBeenCalledWith({
      where: { date_tenantId: { tenantId: "tenant-a", date: new Date(2026, 9, 10) } },
      select: { sellRate: true },
    });
    expect(c.officialRates.resolveExactObservation).not.toHaveBeenCalled();
  });

  it("records DIVIDE when converting the inverse supported direction", async () => {
    const c = context({ accountingCurrencyCode: "USD", exchangeRateSource: "MANUAL" });
    c.tx.exchangeRate.findUnique.mockResolvedValue({ sellRate: decimal("500") });

    await expect(c.service.resolve(request(c.tx, { purchaseCurrency: "CRC" }))).resolves.toMatchObject({
      exchangeRate: decimal("500"), exchangeRateOperation: "DIVIDE",
    });
  });

  it.each([
    ["MANUAL", null],
    ["BCCR", "official-missing"],
  ] as const)("fails closed when %s cannot resolve the configured accounting rate", async (exchangeRateSource, officialFailure) => {
    const c = context({ accountingCurrencyCode: "CRC", exchangeRateSource });
    if (officialFailure) c.officialRates.resolveExactObservation.mockRejectedValue(new Error(officialFailure));
    else c.tx.exchangeRate.findUnique.mockResolvedValue(null);

    await expect(c.service.resolve(request(c.tx))).rejects.toMatchObject({
      response: expect.objectContaining({ message: "OPERATIONAL_PURCHASE_ACCOUNTING_FX_UNAVAILABLE" }),
    });
  });

  it("does not use a foreign 1:1 or unsupported pair fallback", async () => {
    const c = context({ accountingCurrencyCode: "EUR", exchangeRateSource: "MANUAL" });

    await expect(c.service.resolve(request(c.tx))).rejects.toBeInstanceOf(BadRequestException);
    expect(c.tx.exchangeRate.findUnique).not.toHaveBeenCalled();
    expect(c.officialRates.resolveExactObservation).not.toHaveBeenCalled();
  });
});

function context(configuration: { accountingCurrencyCode: string | null; exchangeRateSource?: "MANUAL" | "BCCR" }) {
  const tx = {
    tenantBillingConfiguration: {
      findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Costa_Rica", exchangeRateSource: "MANUAL", ...configuration }),
    },
    exchangeRate: { findUnique: jest.fn() },
  };
  const officialRates = { resolveExactObservation: jest.fn() };
  return {
    tx,
    officialRates,
    service: new OperationalPurchaseAccountingFxSnapshotService(officialRates as unknown as OfficialExchangeRateResolver),
  };
}

function request(tx: any, overrides: Record<string, unknown> = {}) {
  return { tx, tenantId: "tenant-a", purchaseCurrency: "USD", purchasedAt: new Date("2026-10-11T02:00:00.000Z"), ...overrides };
}

function official(id: string, value: string) {
  return { id, value, sourceIndicatorCode: "318" } as Awaited<ReturnType<OfficialExchangeRateResolver["resolveExactObservation"]>>;
}

function decimal(value: string) { return new Prisma.Decimal(value); }
