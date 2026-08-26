export type FiscalCalculationErrorCode =
  | "FISCAL_CALCULATION_INVALID_INPUT"
  | "FISCAL_DECIMAL_INVALID_SYNTAX"
  | "FISCAL_DECIMAL_SCALE_UNSUPPORTED"
  | "FISCAL_DECIMAL_CAPACITY_OVERFLOW"
  | "FISCAL_CALCULATION_INVALID_ORDERING"
  | "FISCAL_CALCULATION_DISCOUNT_UNSUPPORTED"
  | "FISCAL_CALCULATION_TAX_INVALID"
  | "FISCAL_CALCULATION_EXEMPTION_INVALID"
  | "FISCAL_DECIMAL_ARITHMETIC_UNDERFLOW"
  | "FISCAL_CALCULATION_STATE_UNSUPPORTED";

const GENERIC_CALCULATION_ERROR: FiscalCalculationErrorCode =
  "FISCAL_CALCULATION_STATE_UNSUPPORTED";
const FISCAL_CALCULATION_ERROR_CODES: ReadonlySet<string> = new Set([
  "FISCAL_CALCULATION_INVALID_INPUT",
  "FISCAL_DECIMAL_INVALID_SYNTAX",
  "FISCAL_DECIMAL_SCALE_UNSUPPORTED",
  "FISCAL_DECIMAL_CAPACITY_OVERFLOW",
  "FISCAL_CALCULATION_INVALID_ORDERING",
  "FISCAL_CALCULATION_DISCOUNT_UNSUPPORTED",
  "FISCAL_CALCULATION_TAX_INVALID",
  "FISCAL_CALCULATION_EXEMPTION_INVALID",
  "FISCAL_DECIMAL_ARITHMETIC_UNDERFLOW",
  GENERIC_CALCULATION_ERROR,
]);
const trustedCalculationErrors = new WeakMap<
  FiscalCalculationError,
  FiscalCalculationErrorCode
>();

export class FiscalCalculationError extends Error {
  readonly code: FiscalCalculationErrorCode;

  constructor(code: FiscalCalculationErrorCode) {
    const safeCode = isFiscalCalculationErrorCode(code)
      ? code
      : GENERIC_CALCULATION_ERROR;
    super(safeCode);
    this.name = "FiscalCalculationError";
    this.code = safeCode;
    Object.defineProperty(this, "code", {
      configurable: true,
      enumerable: true,
      value: safeCode,
      writable: true,
    });
    trustedCalculationErrors.set(this, safeCode);
  }
}

/**
 * Reconstructs a safe error without reading getters, coercing caller values, or
 * rethrowing a caller-controlled Error object. Untrusted shapes collapse to the
 * stable generic calculation code.
 */
export function sanitizeFiscalCalculationError(error: unknown): FiscalCalculationError {
  let code = GENERIC_CALCULATION_ERROR;
  try {
    if (typeof error === "object" && error !== null) {
      const trustedCode = trustedCalculationErrors.get(error as FiscalCalculationError);
      const descriptor = Object.getOwnPropertyDescriptor(error, "code");
      if (
        trustedCode !== undefined
        && descriptor !== undefined
        && "value" in descriptor
        && descriptor.value === trustedCode
        && isFiscalCalculationErrorCode(trustedCode)
      ) {
        code = trustedCode;
      }
    }
  } catch {
    code = GENERIC_CALCULATION_ERROR;
  }
  return new FiscalCalculationError(code);
}

export interface FiscalDecimal {
  readonly coefficient: bigint;
  readonly scale: number;
  readonly canonical: string;
}

export interface FiscalDecimalCapacity {
  readonly precision: number;
  readonly scale: number;
  readonly positive?: boolean;
}

const DECIMAL_SYNTAX = /^(0|[1-9]\d*)(?:\.(\d+))?$/;

export function parseFiscalDecimal(
  value: unknown,
  capacity: FiscalDecimalCapacity,
): FiscalDecimal {
  const match = typeof value === "string" ? DECIMAL_SYNTAX.exec(value) : null;
  if (!match) fail("FISCAL_DECIMAL_INVALID_SYNTAX");

  const integer = match[1];
  const fraction = match[2] ?? "";
  if (fraction.length > capacity.scale) {
    fail("FISCAL_DECIMAL_SCALE_UNSUPPORTED");
  }
  if (integer.length > capacity.precision - capacity.scale) {
    fail("FISCAL_DECIMAL_CAPACITY_OVERFLOW");
  }

  const result = normalize(BigInt(integer + fraction), fraction.length);
  if (capacity.positive && result.coefficient === 0n) {
    fail("FISCAL_CALCULATION_INVALID_INPUT");
  }
  return result;
}

export function compareFiscalDecimals(a: FiscalDecimal, b: FiscalDecimal): -1 | 0 | 1 {
  const aligned = align(a, b);
  return aligned.a < aligned.b ? -1 : aligned.a > aligned.b ? 1 : 0;
}

export function fiscalDecimalsEqual(a: FiscalDecimal, b: FiscalDecimal): boolean {
  return compareFiscalDecimals(a, b) === 0;
}

export function addFiscalDecimals(a: FiscalDecimal, b: FiscalDecimal): FiscalDecimal {
  const aligned = align(a, b);
  return normalize(aligned.a + aligned.b, aligned.scale);
}

export function subtractFiscalDecimals(a: FiscalDecimal, b: FiscalDecimal): FiscalDecimal {
  const aligned = align(a, b);
  if (aligned.a < aligned.b) fail("FISCAL_DECIMAL_ARITHMETIC_UNDERFLOW");
  return normalize(aligned.a - aligned.b, aligned.scale);
}

export function multiplyFiscalDecimals(a: FiscalDecimal, b: FiscalDecimal): FiscalDecimal {
  return normalize(a.coefficient * b.coefficient, a.scale + b.scale);
}

export function divideFiscalDecimalByPowerOfTen(
  value: FiscalDecimal,
  power: number,
): FiscalDecimal {
  if (!isNonNegativeInteger(power)) fail("FISCAL_CALCULATION_INVALID_INPUT");
  return normalize(value.coefficient, value.scale + power);
}

export function sumFiscalDecimals(values: readonly FiscalDecimal[]): FiscalDecimal {
  let result = zeroFiscalDecimal();
  for (const value of values) result = addFiscalDecimals(result, value);
  return result;
}

/**
 * Quantizes a non-negative decimal to the requested scale. When digits are
 * discarded, the first discarded digit controls round-to-nearest, ties upward.
 */
export function quantizeFiscalDecimal(
  value: FiscalDecimal,
  targetScale: number,
): FiscalDecimal {
  if (!isNonNegativeInteger(targetScale)) fail("FISCAL_CALCULATION_INVALID_INPUT");
  if (value.scale <= targetScale) return value;

  const divisor = powerOfTen(value.scale - targetScale);
  let coefficient = value.coefficient / divisor;
  const remainder = value.coefficient % divisor;
  if (remainder * 2n >= divisor) coefficient += 1n;
  return normalize(coefficient, targetScale);
}

/** Divides two non-negative decimals and rounds the result at targetScale. */
export function divideFiscalDecimals(
  dividend: FiscalDecimal,
  divisor: FiscalDecimal,
  targetScale: number,
): FiscalDecimal {
  if (divisor.coefficient === 0n || !isNonNegativeInteger(targetScale)) {
    fail("FISCAL_CALCULATION_STATE_UNSUPPORTED");
  }
  const numerator = dividend.coefficient * powerOfTen(divisor.scale + targetScale);
  const denominator = divisor.coefficient * powerOfTen(dividend.scale);
  let coefficient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * 2n >= denominator) coefficient += 1n;
  return normalize(coefficient, targetScale);
}

export function assertFiscalDecimalCapacity(
  value: FiscalDecimal,
  capacity: FiscalDecimalCapacity,
): FiscalDecimal {
  if (value.scale > capacity.scale) fail("FISCAL_DECIMAL_SCALE_UNSUPPORTED");
  const scaled = value.coefficient * powerOfTen(capacity.scale - value.scale);
  const maximum = powerOfTen(capacity.precision) - 1n;
  if (scaled > maximum) fail("FISCAL_DECIMAL_CAPACITY_OVERFLOW");
  if (capacity.positive && value.coefficient === 0n) {
    fail("FISCAL_CALCULATION_INVALID_INPUT");
  }
  return value;
}

export function zeroFiscalDecimal(): FiscalDecimal {
  return Object.freeze({ coefficient: 0n, scale: 0, canonical: "0" });
}

function align(a: FiscalDecimal, b: FiscalDecimal): {
  readonly a: bigint;
  readonly b: bigint;
  readonly scale: number;
} {
  const scale = a.scale > b.scale ? a.scale : b.scale;
  return {
    a: a.coefficient * powerOfTen(scale - a.scale),
    b: b.coefficient * powerOfTen(scale - b.scale),
    scale,
  };
}

function normalize(coefficient: bigint, initialScale: number): FiscalDecimal {
  let scale = initialScale;
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    scale -= 1;
  }
  const digits = coefficient.toString().padStart(scale + 1, "0");
  const canonical = scale === 0
    ? digits
    : `${digits.slice(0, digits.length - scale)}.${digits.slice(digits.length - scale)}`;
  return Object.freeze({ coefficient, scale, canonical });
}

function powerOfTen(power: number): bigint {
  if (!isNonNegativeInteger(power)) fail("FISCAL_CALCULATION_STATE_UNSUPPORTED");
  return 10n ** BigInt(power);
}

function isNonNegativeInteger(value: number): boolean {
  return typeof value === "number" && value >= 0 && value % 1 === 0;
}

function fail(code: FiscalCalculationErrorCode): never {
  throw new FiscalCalculationError(code);
}

function isFiscalCalculationErrorCode(value: unknown): value is FiscalCalculationErrorCode {
  return typeof value === "string" && FISCAL_CALCULATION_ERROR_CODES.has(value);
}
