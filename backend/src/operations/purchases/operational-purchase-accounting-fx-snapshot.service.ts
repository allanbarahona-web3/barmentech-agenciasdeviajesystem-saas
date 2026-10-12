import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DEFAULT_FISCAL_TIMEZONE, tenantCalendarDateForInstant } from "../../finance/tenant-fiscal-date";
import { OfficialExchangeRateResolver } from "../../official-exchange-rates/official-exchange-rate.resolver";

type AccountingExchangeRateOperation = "IDENTITY" | "MULTIPLY" | "DIVIDE";

type SnapshotTransaction = {
  tenantBillingConfiguration: {
    findUnique(input: unknown): Promise<{
      accountingCurrencyCode: string | null;
      exchangeRateSource: "MANUAL" | "BCCR";
      fiscalTimezone: string;
    } | null>;
  };
  exchangeRate: {
    findUnique(input: unknown): Promise<{ sellRate: Prisma.Decimal } | null>;
  };
};

export type OperationalPurchaseAccountingFxSnapshot = {
  accountingCurrencyCode: string;
  exchangeRate: Prisma.Decimal;
  exchangeRateAuthority: "IDENTITY" | "BCCR_REFERENCE_SELL_318" | "MANUAL_SELL";
  exchangeRateEffectiveDate: Date;
  exchangeRateObservationId: string | null;
  exchangeRateIndicator: string | null;
  exchangeRateOperation: AccountingExchangeRateOperation;
};

/**
 * Resolves the rate that is frozen with a new OperationalPurchase. It uses the
 * established manual-rate and BCCR authorities; it never derives a rate from
 * document defaults or from a current-date fallback.
 */
@Injectable()
export class OperationalPurchaseAccountingFxSnapshotService {
  constructor(private readonly officialRates: OfficialExchangeRateResolver) {}

  async resolve(input: {
    tx: SnapshotTransaction;
    tenantId: string;
    purchaseCurrency: string;
    purchasedAt: Date;
  }): Promise<OperationalPurchaseAccountingFxSnapshot | undefined> {
    const configuration = await input.tx.tenantBillingConfiguration.findUnique({
      where: { tenantId: input.tenantId },
      select: { accountingCurrencyCode: true, exchangeRateSource: true, fiscalTimezone: true },
    });
    const accountingCurrencyCode = normalizeCurrency(configuration?.accountingCurrencyCode);

    // Null is the explicitly supported historical-compatibility state: a
    // purchase remains valid but has no accounting FX snapshot.
    if (!accountingCurrencyCode) return undefined;

    const purchaseCurrency = normalizeCurrency(input.purchaseCurrency);
    const timezone = configuration?.fiscalTimezone || DEFAULT_FISCAL_TIMEZONE;
    const effectiveOn = tenantCalendarDateForInstant(input.purchasedAt, timezone);
    const exchangeRateEffectiveDate = dateOnly(effectiveOn);

    if (purchaseCurrency === accountingCurrencyCode) {
      return {
        accountingCurrencyCode,
        exchangeRate: new Prisma.Decimal(1),
        exchangeRateAuthority: "IDENTITY",
        exchangeRateEffectiveDate,
        exchangeRateObservationId: null,
        exchangeRateIndicator: null,
        exchangeRateOperation: "IDENTITY",
      };
    }

    const operation = usdCrcOperation(purchaseCurrency, accountingCurrencyCode);
    if (!operation) throw unavailable();

    if (configuration?.exchangeRateSource === "BCCR") {
      try {
        const observation = await this.officialRates.resolveExactObservation({
          countryCode: "CR",
          foreignCurrencyCode: "USD",
          localCurrencyCode: "CRC",
          rateType: "REFERENCE_SELL",
          effectiveDate: effectiveOn,
        });
        const exchangeRate = new Prisma.Decimal(observation.value);
        if (!positive(exchangeRate)) throw unavailable();
        return {
          accountingCurrencyCode,
          exchangeRate,
          exchangeRateAuthority: "BCCR_REFERENCE_SELL_318",
          exchangeRateEffectiveDate,
          exchangeRateObservationId: observation.id,
          exchangeRateIndicator: observation.sourceIndicatorCode,
          exchangeRateOperation: operation,
        };
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        throw unavailable();
      }
    }

    const manualRate = await input.tx.exchangeRate.findUnique({
      where: { date_tenantId: { tenantId: input.tenantId, date: localDate(effectiveOn) } },
      select: { sellRate: true },
    });
    if (!manualRate || !positive(manualRate.sellRate)) throw unavailable();
    return {
      accountingCurrencyCode,
      exchangeRate: manualRate.sellRate,
      exchangeRateAuthority: "MANUAL_SELL",
      exchangeRateEffectiveDate,
      exchangeRateObservationId: null,
      exchangeRateIndicator: null,
      exchangeRateOperation: operation,
    };
  }
}

function normalizeCurrency(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function usdCrcOperation(fromCurrency: string, toCurrency: string): AccountingExchangeRateOperation | null {
  if (fromCurrency === "USD" && toCurrency === "CRC") return "MULTIPLY";
  if (fromCurrency === "CRC" && toCurrency === "USD") return "DIVIDE";
  return null;
}

function positive(value: Prisma.Decimal): boolean {
  return value.isFinite() && value.greaterThan(0);
}

function unavailable(): BadRequestException {
  return new BadRequestException("OPERATIONAL_PURCHASE_ACCOUNTING_FX_UNAVAILABLE");
}

// The database column is DATE. Build it from the resolved tenant calendar date,
// never from the UTC calendar date of purchasedAt.
function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

// This matches the existing manual ExchangeRate exact-date key convention.
function localDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
