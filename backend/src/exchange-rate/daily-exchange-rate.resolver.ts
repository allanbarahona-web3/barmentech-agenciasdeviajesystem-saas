import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DateUtils } from "../common/utils/date.utils";
import { OfficialExchangeRateResolver } from "../official-exchange-rates/official-exchange-rate.resolver";
import { PrismaService } from "../prisma/prisma.service";
import { ExchangeRateService } from "./exchange-rate.service";
import { normalizeCurrencySettlementAmount } from "../finance/currency-settlement.policy";

export type DailyExchangeRateSource = "MANUAL" | "BCCR";
export type DailyExchangeRateStatus = "AVAILABLE" | "MISSING" | "NOT_REQUIRED";

export type DailyExchangeRateResolution = {
  baseCurrencyCode: string;
  source: DailyExchangeRateSource;
  effectiveDate: string;
  status: DailyExchangeRateStatus;
  rate?: Prisma.Decimal;
};

export type PersistedDailyExchangeRateRequest = { currencyCode: string; effectiveDate: string };

/**
 * The non-persistent settlement result shared by invoice-payment approval and
 * its read-only preview. Persistence of this value remains the approval
 * workflow's responsibility.
 */
export type DailySettlementResolution = {
  currencyCode: string;
  amount: Prisma.Decimal;
  exchangeRate: Prisma.Decimal | null;
  exchangeRateSource: DailyExchangeRateSource | null;
  exchangeRateEffectiveDate: string | null;
};

@Injectable()
export class DailyExchangeRateResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly manualRates: ExchangeRateService,
    private readonly officialRates: OfficialExchangeRateResolver,
  ) {}

  async resolveDailyExchangeRate(input: {
    tenantId: string;
    currencyCodes: readonly string[];
    effectiveDate?: string;
  }): Promise<DailyExchangeRateResolution> {
    const configuration = await this.configuration(input.tenantId);
    const effectiveDate = input.effectiveDate ?? costaRicaToday();
    const baseCurrencyCode = configuration.defaultCurrencyCode;
    const source = configuration.exchangeRateSource;
    const foreignCurrencies = [...new Set(input.currencyCodes.map((currencyCode) => currencyCode.toUpperCase()))]
      .filter((currencyCode) => currencyCode !== baseCurrencyCode);

    if (foreignCurrencies.length === 0) {
      return { baseCurrencyCode, source, effectiveDate, status: "NOT_REQUIRED" };
    }
    if (!supportsUsdCrc(baseCurrencyCode, foreignCurrencies)) {
      return { baseCurrencyCode, source, effectiveDate, status: "MISSING" };
    }

    if (source === "MANUAL") {
      const rate = await this.manualRates.findExactDailyRate(input.tenantId, effectiveDate);
      if (!rate || !positive(rate.sellRate)) {
        return { baseCurrencyCode, source, effectiveDate, status: "MISSING" };
      }
      return { baseCurrencyCode, source, effectiveDate, status: "AVAILABLE", rate: rate.sellRate };
    }

    try {
      const observation = await this.officialRates.resolveExactObservation({
        countryCode: "CR",
        foreignCurrencyCode: "USD",
        localCurrencyCode: "CRC",
        rateType: "REFERENCE_SELL",
        effectiveDate,
      });
      const rate = new Prisma.Decimal(observation.value);
      if (!positive(rate)) {
        return { baseCurrencyCode, source, effectiveDate, status: "MISSING" };
      }
      return { baseCurrencyCode, source, effectiveDate, status: "AVAILABLE", rate };
    } catch {
      return { baseCurrencyCode, source, effectiveDate, status: "MISSING" };
    }
  }

  /**
   * Read-only historical lookup for reporting. Unlike resolveDailyExchangeRate,
   * this method never calls the BCCR provider and never creates an observation.
   */
  async resolvePersistedDailyExchangeRates(input: {
    tenantId: string;
    requests: readonly PersistedDailyExchangeRateRequest[];
  }): Promise<Map<string, DailyExchangeRateResolution>> {
    const configuration = await this.configuration(input.tenantId);
    const requests = [...new Map(input.requests.map((request) => {
      const currencyCode = request.currencyCode.toUpperCase();
      return [`${currencyCode}\u0000${request.effectiveDate}`, { currencyCode, effectiveDate: request.effectiveDate }];
    })).values()];
    const result = new Map<string, DailyExchangeRateResolution>();
    const foreign = requests.filter((request) => request.currencyCode !== configuration.defaultCurrencyCode);
    const dates = [...new Set(foreign.map((request) => request.effectiveDate))];

    const manual = configuration.exchangeRateSource === "MANUAL" && dates.length
      ? await (this.prisma.exchangeRate as any).findMany({
        where: { tenantId: input.tenantId, date: { in: dates.map(localDate) } },
        select: { date: true, sellRate: true },
      })
      : [];
    const official = configuration.exchangeRateSource === "BCCR" && dates.length
      ? await this.prisma.officialExchangeRateObservation.findMany({
        where: {
          countryCode: "CR", foreignCurrencyCode: "USD", localCurrencyCode: "CRC",
          rateType: "REFERENCE_SELL", sourceAuthority: "BCCR", sourceIndicatorCode: "318",
          effectiveDate: { in: dates.map(utcDate) },
        },
        select: { effectiveDate: true, value: true },
      })
      : [];
    const manualByDate = new Map<string, Prisma.Decimal>(manual.map((rate: any) => [localDateKey(rate.date), rate.sellRate as Prisma.Decimal]));
    const officialByDate = new Map<string, Prisma.Decimal>(official.map((rate) => [utcDateKey(rate.effectiveDate), rate.value]));

    for (const request of requests) {
      const key = `${request.currencyCode}\u0000${request.effectiveDate}`;
      if (request.currencyCode === configuration.defaultCurrencyCode) {
        result.set(key, { baseCurrencyCode: configuration.defaultCurrencyCode, source: configuration.exchangeRateSource, effectiveDate: request.effectiveDate, status: "NOT_REQUIRED" });
        continue;
      }
      if (!supportsUsdCrc(configuration.defaultCurrencyCode, [request.currencyCode])) {
        result.set(key, { baseCurrencyCode: configuration.defaultCurrencyCode, source: configuration.exchangeRateSource, effectiveDate: request.effectiveDate, status: "MISSING" });
        continue;
      }
      const rate = configuration.exchangeRateSource === "MANUAL" ? manualByDate.get(request.effectiveDate) : officialByDate.get(request.effectiveDate);
      result.set(key, rate && positive(rate)
        ? { baseCurrencyCode: configuration.defaultCurrencyCode, source: configuration.exchangeRateSource, effectiveDate: request.effectiveDate, status: "AVAILABLE", rate }
        : { baseCurrencyCode: configuration.defaultCurrencyCode, source: configuration.exchangeRateSource, effectiveDate: request.effectiveDate, status: "MISSING" });
    }
    return result;
  }

  private async configuration(tenantId: string): Promise<{
    defaultCurrencyCode: string;
    exchangeRateSource: DailyExchangeRateSource;
  }> {
    // The database migration adds exchangeRateSource. Keep this cast isolated so
    // this backend remains type-checkable until the operator runs Prisma generate.
    const configuration = await (this.prisma.tenantBillingConfiguration as unknown as {
      findUnique(input: unknown): Promise<{
        defaultCurrencyCode: string;
        exchangeRateSource?: string;
      } | null>;
    }).findUnique({
      where: { tenantId },
      select: { defaultCurrencyCode: true, exchangeRateSource: true },
    });
    return {
      defaultCurrencyCode: configuration?.defaultCurrencyCode?.toUpperCase() ?? "CRC",
      exchangeRateSource: configuration?.exchangeRateSource === "BCCR" ? "BCCR" : "MANUAL",
    };
  }
}

export function convertDailyExchangeRateAmount(
  amount: Prisma.Decimal,
  currencyCode: string,
  resolution: DailyExchangeRateResolution,
): Prisma.Decimal | null {
  const fromCurrencyCode = currencyCode.toUpperCase();
  if (fromCurrencyCode === resolution.baseCurrencyCode) return amount;
  if (resolution.status !== "AVAILABLE" || !resolution.rate) return null;
  if (fromCurrencyCode === "USD" && resolution.baseCurrencyCode === "CRC") {
    return amount.times(resolution.rate);
  }
  if (fromCurrencyCode === "CRC" && resolution.baseCurrencyCode === "USD") {
    return amount.dividedBy(resolution.rate);
  }
  return null;
}

/** Converts between the supported settlement currencies using one resolved daily rate. */
export function convertDailySettlementAmount(
  amount: Prisma.Decimal,
  fromCurrencyCode: string,
  toCurrencyCode: string,
  resolution: DailyExchangeRateResolution,
): Prisma.Decimal | null {
  const from = fromCurrencyCode.toUpperCase();
  const to = toCurrencyCode.toUpperCase();
  if (from === to) return amount;
  if (resolution.status !== "AVAILABLE" || !resolution.rate || !positive(resolution.rate)) return null;
  if (from === "CRC" && to === "USD") return amount.dividedBy(resolution.rate);
  if (from === "USD" && to === "CRC") return amount.times(resolution.rate);
  return null;
}

/**
 * Resolves and converts the current daily settlement amount without creating
 * a Payment or a settlement snapshot. This is deliberately the same path used
 * immediately before invoice-payment approval persists its immutable snapshot.
 */
export async function resolveDailySettlement(input: {
  resolver: DailyExchangeRateResolver;
  tenantId: string;
  receivedCurrencyCode: string;
  settlementCurrencyCode: string;
  receivedAmount: Prisma.Decimal;
}): Promise<DailySettlementResolution | null> {
  const receivedCurrencyCode = input.receivedCurrencyCode.toUpperCase();
  const settlementCurrencyCode = input.settlementCurrencyCode.toUpperCase();
  if (receivedCurrencyCode === settlementCurrencyCode) {
    return {
      currencyCode: settlementCurrencyCode,
      amount: normalizeCurrencySettlementAmount(input.receivedAmount, settlementCurrencyCode),
      exchangeRate: null,
      exchangeRateSource: null,
      exchangeRateEffectiveDate: null,
    };
  }

  const rate = await input.resolver.resolveDailyExchangeRate({
    tenantId: input.tenantId,
    currencyCodes: [receivedCurrencyCode, settlementCurrencyCode],
  });
  if (rate.status !== "AVAILABLE" || !rate.rate) return null;
  const amount = convertDailySettlementAmount(
    input.receivedAmount,
    receivedCurrencyCode,
    settlementCurrencyCode,
    rate,
  );
  if (!amount || !amount.isFinite() || amount.lessThanOrEqualTo(0)) return null;

  return {
    currencyCode: settlementCurrencyCode,
    amount: normalizeCurrencySettlementAmount(amount, settlementCurrencyCode),
    exchangeRate: rate.rate,
    exchangeRateSource: rate.source,
    exchangeRateEffectiveDate: rate.effectiveDate,
  };
}

function costaRicaToday(): string {
  return DateUtils.getCostaRicaToday().toISOString().slice(0, 10);
}

function supportsUsdCrc(baseCurrencyCode: string, foreignCurrencies: readonly string[]): boolean {
  return ["USD", "CRC"].includes(baseCurrencyCode)
    && foreignCurrencies.every((currencyCode) => ["USD", "CRC"].includes(currencyCode));
}

function positive(value: Prisma.Decimal): boolean {
  return value.isFinite() && value.greaterThan(0);
}

function utcDate(value: string): Date { return new Date(`${value}T00:00:00.000Z`); }
function localDate(value: string): Date { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); }
function localDateKey(value: Date): string { return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-"); }
function utcDateKey(value: Date): string { return [value.getUTCFullYear(), String(value.getUTCMonth() + 1).padStart(2, "0"), String(value.getUTCDate()).padStart(2, "0")].join("-"); }
