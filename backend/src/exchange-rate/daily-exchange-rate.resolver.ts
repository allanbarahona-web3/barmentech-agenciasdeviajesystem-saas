import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DateUtils } from "../common/utils/date.utils";
import { OfficialExchangeRateResolver } from "../official-exchange-rates/official-exchange-rate.resolver";
import { PrismaService } from "../prisma/prisma.service";
import { ExchangeRateService } from "./exchange-rate.service";

export type DailyExchangeRateSource = "MANUAL" | "BCCR";
export type DailyExchangeRateStatus = "AVAILABLE" | "MISSING" | "NOT_REQUIRED";

export type DailyExchangeRateResolution = {
  baseCurrencyCode: string;
  source: DailyExchangeRateSource;
  effectiveDate: string;
  status: DailyExchangeRateStatus;
  rate?: Prisma.Decimal;
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
