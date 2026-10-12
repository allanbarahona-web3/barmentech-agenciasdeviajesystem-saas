import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DailyExchangeRateResolver } from "../../exchange-rate/daily-exchange-rate.resolver";
import { calendarDateInTimezone } from "../period/reporting-period.resolver";
import type { AccountingCostConversion, AccountingCostFxSnapshot, AccountingCostRow } from "./accounting-costs.types";

/** Complete purchase snapshots win; only fully absent snapshots use read-only legacy FX. */
@Injectable()
export class AccountingCostFxProjector {
  constructor(private readonly dailyRates: DailyExchangeRateResolver) {}

  async projectRows(input: { tenantId: string; timezone: string; accountingCurrencyCode: string | null; rows: readonly AccountingCostRow[] }) {
    const classified = input.rows.map((row) => ({ row, kind: snapshotKind(row), effectiveOn: calendarDateInTimezone(row.sourceDate, input.timezone) }));
    const requests = classified
      .filter((value) => value.kind === "LEGACY" && input.accountingCurrencyCode && value.row.currency.toUpperCase() !== input.accountingCurrencyCode.toUpperCase())
      .map((value) => ({ currencyCode: value.row.currency, effectiveDate: value.effectiveOn }));
    const resolutions = requests.length
      ? await this.dailyRates.resolvePersistedDailyExchangeRates({ tenantId: input.tenantId, requests, baseCurrencyCode: input.accountingCurrencyCode! })
      : new Map<string, LegacyResolution>();

    return classified.map(({ row, kind, effectiveOn }) => {
      const { fxSnapshot: _fxSnapshot, ...projected } = row;
      const conversion = kind === "VALID"
        ? snapshotConversion(row, row.fxSnapshot!)
        : kind === "INVALID"
          ? invalidSnapshotConversion(row, input.timezone)
          : legacyConversion(row, effectiveOn, input.accountingCurrencyCode, resolutions);
      return { ...projected, conversion };
    });
  }
}

type SnapshotKind = "VALID" | "LEGACY" | "INVALID";
type LegacyResolution = { source: "MANUAL" | "BCCR"; status: "AVAILABLE" | "MISSING" | "NOT_REQUIRED"; rate?: Prisma.Decimal };

function snapshotKind(row: AccountingCostRow): SnapshotKind {
  const snapshot = row.fxSnapshot;
  if (!snapshot || allSnapshotFieldsAbsent(snapshot)) return "LEGACY";
  return completeSnapshot(snapshot, row.currency) ? "VALID" : "INVALID";
}

function allSnapshotFieldsAbsent(snapshot: AccountingCostFxSnapshot): boolean {
  return snapshot.accountingCurrencyCode === null && snapshot.exchangeRate === null && snapshot.exchangeRateAuthority === null
    && snapshot.exchangeRateEffectiveDate === null && snapshot.exchangeRateObservationId === null
    && snapshot.exchangeRateIndicator === null && snapshot.exchangeRateOperation === null;
}

function completeSnapshot(snapshot: AccountingCostFxSnapshot, sourceCurrency: string): boolean {
  const currency = normalizeCurrency(snapshot.accountingCurrencyCode);
  const rate = snapshot.exchangeRate;
  if (!currency || !rate || !rate.isFinite() || !rate.greaterThan(0) || !validDate(snapshot.exchangeRateEffectiveDate)) return false;
  if (snapshot.exchangeRateAuthority === "IDENTITY") return currency === normalizeCurrency(sourceCurrency) && rate.equals(1) && snapshot.exchangeRateOperation === "IDENTITY";
  if (snapshot.exchangeRateOperation !== "MULTIPLY" && snapshot.exchangeRateOperation !== "DIVIDE") return false;
  if (snapshot.exchangeRateAuthority === "BCCR_REFERENCE_SELL_318") return normalizeCurrency(sourceCurrency) === "USD" && currency === "CRC" && Boolean(snapshot.exchangeRateObservationId) && snapshot.exchangeRateIndicator === "318";
  return snapshot.exchangeRateAuthority === "MANUAL_SELL";
}

function snapshotConversion(row: AccountingCostRow, snapshot: AccountingCostFxSnapshot): AccountingCostConversion {
  const rate = snapshot.exchangeRate!;
  const baseCurrency = normalizeCurrency(snapshot.accountingCurrencyCode);
  const effectiveOn = dateOnly(snapshot.exchangeRateEffectiveDate!);
  if (snapshot.exchangeRateAuthority === "IDENTITY") return {
    status: "IDENTITY", baseCurrency, exchangeRate: "1", subtotal: row.subtotal, tax: row.tax, total: row.total,
    authority: "IDENTITY", effectiveOn, operation: "IDENTITY",
  };
  const subtotal = convert(new Prisma.Decimal(row.subtotal), rate, snapshot.exchangeRateOperation!);
  const tax = convert(new Prisma.Decimal(row.tax), rate, snapshot.exchangeRateOperation!);
  return {
    status: "AVAILABLE", baseCurrency, exchangeRate: rate.toFixed(), subtotal: subtotal.toFixed(), tax: tax.toFixed(), total: subtotal.plus(tax).toFixed(),
    authority: snapshot.exchangeRateAuthority as "BCCR_REFERENCE_SELL_318" | "MANUAL_SELL", effectiveOn,
    operation: snapshot.exchangeRateOperation as "MULTIPLY" | "DIVIDE",
  };
}

function legacyConversion(row: AccountingCostRow, effectiveOn: string, accountingCurrencyCode: string | null, resolutions: ReadonlyMap<string, LegacyResolution>): AccountingCostConversion {
  const baseCurrency = normalizeCurrency(accountingCurrencyCode);
  if (!baseCurrency) return missing(baseCurrency, effectiveOn);
  const currency = row.currency.toUpperCase();
  if (currency === baseCurrency) return {
    status: "IDENTITY", baseCurrency, exchangeRate: "1", subtotal: row.subtotal, tax: row.tax, total: row.total,
    authority: "IDENTITY", effectiveOn, operation: "IDENTITY",
  };
  const resolution = resolutions.get(`${currency}\u0000${effectiveOn}`);
  if (!resolution || resolution.status !== "AVAILABLE" || !resolution.rate) return missing(baseCurrency, effectiveOn);
  const operation = legacyOperation(currency, baseCurrency);
  if (!operation) return missing(baseCurrency, effectiveOn);
  const subtotal = convert(new Prisma.Decimal(row.subtotal), resolution.rate, operation);
  const tax = convert(new Prisma.Decimal(row.tax), resolution.rate, operation);
  return {
    status: "AVAILABLE", baseCurrency, exchangeRate: resolution.rate.toFixed(), subtotal: subtotal.toFixed(), tax: tax.toFixed(), total: subtotal.plus(tax).toFixed(),
    authority: resolution.source === "BCCR" ? "BCCR_REFERENCE_SELL_318" : "MANUAL_SELL", effectiveOn, operation,
  };
}

function invalidSnapshotConversion(row: AccountingCostRow, timezone: string): AccountingCostConversion {
  return {
    status: "FX_SNAPSHOT_INVALID", baseCurrency: normalizeCurrency(row.fxSnapshot?.accountingCurrencyCode), exchangeRate: null,
    subtotal: null, tax: null, total: null, authority: null, effectiveOn: calendarDateInTimezone(row.sourceDate, timezone), operation: null,
  };
}

function missing(baseCurrency: string, effectiveOn: string): AccountingCostConversion {
  return { status: "FX_MISSING", baseCurrency, exchangeRate: null, subtotal: null, tax: null, total: null, authority: null, effectiveOn, operation: null };
}

function convert(amount: Prisma.Decimal, rate: Prisma.Decimal, operation: string): Prisma.Decimal {
  return operation === "MULTIPLY" ? amount.times(rate) : amount.dividedBy(rate);
}

function legacyOperation(fromCurrency: string, toCurrency: string): "MULTIPLY" | "DIVIDE" | null {
  if (fromCurrency === "USD" && toCurrency === "CRC") return "MULTIPLY";
  if (fromCurrency === "CRC" && toCurrency === "USD") return "DIVIDE";
  return null;
}

function normalizeCurrency(value: string | null | undefined): string { return typeof value === "string" ? value.trim().toUpperCase() : ""; }
function validDate(value: Date | null): value is Date { return value instanceof Date && Number.isFinite(value.getTime()); }
function dateOnly(value: Date): string { return [value.getUTCFullYear(), String(value.getUTCMonth() + 1).padStart(2, "0"), String(value.getUTCDate()).padStart(2, "0")].join("-"); }
