import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DateUtils } from "../common/utils/date.utils";
import { OfficialExchangeRateResolver } from "../official-exchange-rates/official-exchange-rate.resolver";
import { PrismaService } from "../prisma/prisma.service";
import { ExchangeRateService } from "./exchange-rate.service";

export type CurrentExchangeRateSource = "MANUAL" | "BCCR";
export type CurrentExchangeRateStatus = "AVAILABLE" | "INCOMPLETE" | "MISSING";

export type CurrentExchangeRate = {
  date: string;
  effectiveDate: string;
  source: CurrentExchangeRateSource;
  buyRate: number;
  sellRate: number;
  retrievedAt?: Date;
  id?: string;
  setByName?: string;
  notes?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type CurrentExchangeRateResolution = {
  rate: CurrentExchangeRate | null;
  status: CurrentExchangeRateStatus;
};

/**
 * Resolves the tenant's active source into the stable current-rate contract
 * used by global UI consumers. It deliberately does not replace the manual
 * history service or the Finance single-rate resolver.
 */
@Injectable()
export class CurrentExchangeRateResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly manualRates: ExchangeRateService,
    private readonly officialRates: OfficialExchangeRateResolver,
  ) {}

  async resolveCurrentExchangeRate(tenantId: string): Promise<CurrentExchangeRateResolution> {
    const configuration = await this.configuration(tenantId);
    const effectiveDate = costaRicaToday();

    if (configuration.exchangeRateSource === "MANUAL") {
      const rate = await this.manualRates.findExactDailyRate(tenantId, effectiveDate);
      if (!rate || !positive(rate.buyRate) || !positive(rate.sellRate)) {
        return { rate: null, status: "MISSING" };
      }
      return {
        rate: {
          id: rate.id,
          date: effectiveDate,
          effectiveDate,
          source: "MANUAL",
          buyRate: Number(rate.buyRate),
          sellRate: Number(rate.sellRate),
          setByName: rate.setByName,
          notes: rate.notes,
          createdAt: rate.createdAt,
          updatedAt: rate.updatedAt,
        },
        status: "AVAILABLE",
      };
    }

    const [buy, sell] = await Promise.allSettled([
      this.officialRates.resolveExactObservation({
        countryCode: "CR",
        foreignCurrencyCode: "USD",
        localCurrencyCode: "CRC",
        rateType: "REFERENCE_BUY",
        effectiveDate,
      }),
      this.officialRates.resolveExactObservation({
        countryCode: "CR",
        foreignCurrencyCode: "USD",
        localCurrencyCode: "CRC",
        rateType: "REFERENCE_SELL",
        effectiveDate,
      }),
    ]);

    if (buy.status !== "fulfilled" || sell.status !== "fulfilled") {
      return {
        rate: null,
        status: buy.status === "rejected" && sell.status === "rejected" ? "MISSING" : "INCOMPLETE",
      };
    }

    const buyRate = new Prisma.Decimal(buy.value.value);
    const sellRate = new Prisma.Decimal(sell.value.value);
    if (!positive(buyRate) || !positive(sellRate)) {
      return { rate: null, status: "INCOMPLETE" };
    }

    return {
      rate: {
        date: effectiveDate,
        effectiveDate,
        source: "BCCR",
        buyRate: Number(buyRate),
        sellRate: Number(sellRate),
        retrievedAt: latest(buy.value.retrievedAt, sell.value.retrievedAt),
      },
      status: "AVAILABLE",
    };
  }

  private async configuration(tenantId: string): Promise<{ exchangeRateSource: CurrentExchangeRateSource }> {
    const configuration = await (this.prisma.tenantBillingConfiguration as unknown as {
      findUnique(input: unknown): Promise<{ exchangeRateSource?: string } | null>;
    }).findUnique({
      where: { tenantId },
      select: { exchangeRateSource: true },
    });
    return { exchangeRateSource: configuration?.exchangeRateSource === "BCCR" ? "BCCR" : "MANUAL" };
  }
}

function costaRicaToday(): string {
  return DateUtils.getCostaRicaToday().toISOString().slice(0, 10);
}

function positive(value: Prisma.Decimal): boolean {
  return value.isFinite() && value.greaterThan(0);
}

function latest(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? left : right;
}
