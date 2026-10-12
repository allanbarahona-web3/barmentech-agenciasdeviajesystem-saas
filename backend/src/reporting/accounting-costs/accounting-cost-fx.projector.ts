import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { convertDailyExchangeRateAmount, DailyExchangeRateResolver } from "../../exchange-rate/daily-exchange-rate.resolver";
import { calendarDateInTimezone } from "../period/reporting-period.resolver";
import type { AccountingCostConversion, AccountingCostRow } from "./accounting-costs.types";

/** Report-only conversion. It resolves current historical authority; it is not a purchase FX snapshot. */
@Injectable()
export class AccountingCostFxProjector {
  constructor(private readonly dailyRates: DailyExchangeRateResolver) {}

  async projectRows(input: { tenantId: string; timezone: string; baseCurrency: string; rows: readonly AccountingCostRow[] }) {
    const requests = input.rows.map((row) => ({ currencyCode: row.currency, effectiveDate: calendarDateInTimezone(row.sourceDate, input.timezone) }));
    const resolutions = await this.dailyRates.resolvePersistedDailyExchangeRates({ tenantId: input.tenantId, requests });
    return input.rows.map((row) => ({ ...row, conversion: this.project(row, input.timezone, input.baseCurrency, resolutions) }));
  }

  project(row: AccountingCostRow, timezone: string, baseCurrency: string, resolutions: ReadonlyMap<string, ReturnTypeMap>): AccountingCostConversion {
    const effectiveOn = calendarDateInTimezone(row.sourceDate, timezone);
    const currency = row.currency.toUpperCase();
    if (currency === baseCurrency.toUpperCase()) return {
      status: "IDENTITY", baseCurrency, exchangeRate: "1", subtotal: row.subtotal, tax: row.tax, total: row.total,
      authority: "IDENTITY", effectiveOn, operation: "IDENTITY",
    };
    const resolution = resolutions.get(`${currency}\u0000${effectiveOn}`);
    if (!resolution || resolution.status !== "AVAILABLE" || !resolution.rate) return {
      status: "FX_MISSING", baseCurrency, exchangeRate: null, subtotal: null, tax: null, total: null, authority: null, effectiveOn, operation: null,
    };
    const subtotal = convertDailyExchangeRateAmount(new Prisma.Decimal(row.subtotal), currency, resolution);
    const tax = convertDailyExchangeRateAmount(new Prisma.Decimal(row.tax), currency, resolution);
    if (!subtotal || !tax) return { status: "FX_MISSING", baseCurrency, exchangeRate: null, subtotal: null, tax: null, total: null, authority: null, effectiveOn, operation: null };
    return {
      status: "AVAILABLE", baseCurrency, exchangeRate: resolution.rate.toFixed(), subtotal: subtotal.toFixed(), tax: tax.toFixed(), total: subtotal.plus(tax).toFixed(),
      authority: resolution.source === "BCCR" ? "BCCR_REFERENCE_SELL_318" : "MANUAL_SELL", effectiveOn,
      operation: currency === "USD" && baseCurrency === "CRC" ? "MULTIPLY" : "DIVIDE",
    };
  }
}

type ReturnTypeMap = {
  baseCurrencyCode: string; source: "MANUAL" | "BCCR"; effectiveDate: string; status: "AVAILABLE" | "MISSING" | "NOT_REQUIRED"; rate?: Prisma.Decimal;
};
