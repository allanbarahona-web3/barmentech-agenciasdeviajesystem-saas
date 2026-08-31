import { Prisma } from "@prisma/client";

const SETTLEMENT_MINOR_UNITS = {
  USD: 2,
  CRC: 2,
} as const;

const MAX_DECIMAL_19_5 = new Prisma.Decimal("99999999999999.99999");

export const CURRENCY_SETTLEMENT_ERRORS = {
  INVALID_AMOUNT: "CURRENCY_SETTLEMENT_INVALID_AMOUNT",
  UNSUPPORTED_CURRENCY: "CURRENCY_SETTLEMENT_UNSUPPORTED_CURRENCY",
} as const;

export class CurrencySettlementError extends Error {
  constructor(
    readonly code:
      (typeof CURRENCY_SETTLEMENT_ERRORS)[keyof typeof CURRENCY_SETTLEMENT_ERRORS],
  ) {
    super(code);
  }
}

export function normalizeCurrencySettlementAmount(
  amount: Prisma.Decimal,
  currencyCode: string,
): Prisma.Decimal {
  if (!(amount instanceof Prisma.Decimal) || !amount.isFinite() || amount.isNegative()) {
    throw new CurrencySettlementError(CURRENCY_SETTLEMENT_ERRORS.INVALID_AMOUNT);
  }

  const minorUnits =
    SETTLEMENT_MINOR_UNITS[currencyCode as keyof typeof SETTLEMENT_MINOR_UNITS];
  if (minorUnits === undefined) {
    throw new CurrencySettlementError(
      CURRENCY_SETTLEMENT_ERRORS.UNSUPPORTED_CURRENCY,
    );
  }

  const normalized = amount.toDecimalPlaces(
    minorUnits,
    Prisma.Decimal.ROUND_HALF_UP,
  );
  if (normalized.isZero() || normalized.greaterThan(MAX_DECIMAL_19_5)) {
    throw new CurrencySettlementError(CURRENCY_SETTLEMENT_ERRORS.INVALID_AMOUNT);
  }
  return normalized;
}
