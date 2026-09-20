export const PRICING_V1 = "PRICING_V1" as const;

export const PRICING_V1_BASES = Object.freeze({
  riskBasis: "BASE_COST",
  targetProfitBasis: "PRE_TAX_SELLING_PRICE",
  salesCommissionBasis: "PRE_TAX_SELLING_PRICE",
  bankCommissionBasis: "FINAL_CHARGED_PRICE",
  taxBasis: "PRE_TAX_SELLING_PRICE",
} as const);

export type PricingCalculationBasis =
  | "BASE_COST"
  | "PRE_TAX_SELLING_PRICE"
  | "FINAL_CHARGED_PRICE";

export type PricingV1CalculatorInput = {
  authoritativeCostAmount: string;
  operationalCostsAmount: string;
  riskMarginPercent: string;
  targetProfitMarginPercent: string;
  salesCommissionPercent: string;
  bankCommissionPercent: string;
  applicableTaxPercent: string;
};

export type PricingV1ConfigurationInput = Omit<PricingV1CalculatorInput, "authoritativeCostAmount">;

export type PricingV1Calculation = {
  policyVersion: typeof PRICING_V1;
  riskBasis: PricingCalculationBasis;
  targetProfitBasis: PricingCalculationBasis;
  salesCommissionBasis: PricingCalculationBasis;
  bankCommissionBasis: PricingCalculationBasis;
  taxBasis: PricingCalculationBasis;
  authoritativeCostAmount: string;
  operationalCostsAmount: string;
  baseCostAmount: string;
  riskAmount: string;
  adjustedEconomicCostAmount: string;
  riskMarginPercent: string;
  targetProfitMarginPercent: string;
  targetProfitAmount: string;
  salesCommissionPercent: string;
  salesCommissionAmount: string;
  bankCommissionPercent: string;
  bankCommissionAmount: string;
  applicableTaxPercent: string;
  taxAmount: string;
  preTaxSellingPrice: string;
  finalSellingPrice: string;
  estimatedAgencyProfitBeforeIncomeTax: string;
};

export type PricingCalculationErrorCode =
  | "PRICING_DECIMAL_INVALID"
  | "PRICING_INPUT_NEGATIVE"
  | "PRICING_INPUT_SCALE_UNSUPPORTED"
  | "PRICING_PERCENTAGE_OUT_OF_RANGE"
  | "PRICING_INVALID_DENOMINATOR";

export class PricingCalculationError extends Error {
  constructor(readonly code: PricingCalculationErrorCode) {
    super(code);
    this.name = "PricingCalculationError";
  }
}

type Decimal = { coefficient: bigint; scale: number };

const AMOUNT_SCALE = 5;
const PERCENT_SCALE = 6;
const INTERNAL_SCALE = 24;
const HUNDRED = decimal(100n, 0);
const ONE = decimal(1n, 0);
const ZERO = decimal(0n, 0);

/**
 * Computes PRICING_V1 using fixed-decimal bigint arithmetic only. All monetary
 * outputs are quantized once, at the final boundary, to Decimal(19,5) using
 * round-half-up. Returned strings are canonical (without insignificant zeros).
 */
export function calculatePricingV1(input: PricingV1CalculatorInput): PricingV1Calculation {
  const authoritativeCost = parseNonNegative(input.authoritativeCostAmount, AMOUNT_SCALE);
  const operationalCosts = parseNonNegative(input.operationalCostsAmount, AMOUNT_SCALE);
  const riskPercent = parsePercentage(input.riskMarginPercent);
  const targetProfitPercent = parsePercentage(input.targetProfitMarginPercent);
  const salesCommissionPercent = parsePercentage(input.salesCommissionPercent);
  const bankCommissionPercent = parsePercentage(input.bankCommissionPercent);
  const taxPercent = parsePercentage(input.applicableTaxPercent);

  const riskRate = percentagePointsToRate(riskPercent);
  const targetProfitRate = percentagePointsToRate(targetProfitPercent);
  const salesCommissionRate = percentagePointsToRate(salesCommissionPercent);
  const bankCommissionRate = percentagePointsToRate(bankCommissionPercent);
  const taxRate = percentagePointsToRate(taxPercent);

  const baseCost = add(authoritativeCost, operationalCosts);
  const riskAmount = multiply(baseCost, riskRate);
  const adjustedEconomicCost = add(baseCost, riskAmount);

  const denominator = subtract(
    subtract(ONE, targetProfitRate),
    add(salesCommissionRate, multiply(bankCommissionRate, add(ONE, taxRate))),
  );
  if (compare(denominator, ZERO) <= 0) {
    throw new PricingCalculationError("PRICING_INVALID_DENOMINATOR");
  }

  const preTaxSellingPrice = divide(adjustedEconomicCost, denominator, INTERNAL_SCALE);
  const targetProfitAmount = multiply(preTaxSellingPrice, targetProfitRate);
  const salesCommissionAmount = multiply(preTaxSellingPrice, salesCommissionRate);
  const taxAmount = multiply(preTaxSellingPrice, taxRate);
  const finalSellingPrice = add(preTaxSellingPrice, taxAmount);
  const bankCommissionAmount = multiply(finalSellingPrice, bankCommissionRate);
  const estimatedAgencyProfitBeforeIncomeTax = subtract(
    subtract(subtract(preTaxSellingPrice, adjustedEconomicCost), salesCommissionAmount),
    bankCommissionAmount,
  );

  return {
    policyVersion: PRICING_V1,
    ...PRICING_V1_BASES,
    authoritativeCostAmount: outputAmount(authoritativeCost),
    operationalCostsAmount: outputAmount(operationalCosts),
    baseCostAmount: outputAmount(baseCost),
    riskAmount: outputAmount(riskAmount),
    adjustedEconomicCostAmount: outputAmount(adjustedEconomicCost),
    riskMarginPercent: format(riskPercent),
    targetProfitMarginPercent: format(targetProfitPercent),
    targetProfitAmount: outputAmount(targetProfitAmount),
    salesCommissionPercent: format(salesCommissionPercent),
    salesCommissionAmount: outputAmount(salesCommissionAmount),
    bankCommissionPercent: format(bankCommissionPercent),
    bankCommissionAmount: outputAmount(bankCommissionAmount),
    applicableTaxPercent: format(taxPercent),
    taxAmount: outputAmount(taxAmount),
    preTaxSellingPrice: outputAmount(preTaxSellingPrice),
    finalSellingPrice: outputAmount(finalSellingPrice),
    estimatedAgencyProfitBeforeIncomeTax: outputAmount(estimatedAgencyProfitBeforeIncomeTax),
  };
}

/** Validates mutable configuration inputs without attempting a price calculation. */
export function validatePricingV1Configuration(input: PricingV1ConfigurationInput): void {
  parseNonNegative(input.operationalCostsAmount, AMOUNT_SCALE);
  parsePercentage(input.riskMarginPercent);
  parsePercentage(input.targetProfitMarginPercent);
  parsePercentage(input.salesCommissionPercent);
  parsePercentage(input.bankCommissionPercent);
  parsePercentage(input.applicableTaxPercent);
}

/** Compares persisted Decimal(19,5)-compatible strings without Number coercion. */
export function pricingAmountsEqual(left: string, right: string): boolean {
  return compare(parseNonNegative(left, AMOUNT_SCALE), parseNonNegative(right, AMOUNT_SCALE)) === 0;
}

function parseNonNegative(value: string, maximumScale: number): Decimal {
  const parsed = parse(value, maximumScale);
  if (parsed.coefficient < 0n) throw new PricingCalculationError("PRICING_INPUT_NEGATIVE");
  return parsed;
}

function parsePercentage(value: string): Decimal {
  const parsed = parseNonNegative(value, PERCENT_SCALE);
  if (compare(parsed, HUNDRED) > 0) {
    throw new PricingCalculationError("PRICING_PERCENTAGE_OUT_OF_RANGE");
  }
  return parsed;
}

function parse(value: string, maximumScale: number): Decimal {
  const match = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new PricingCalculationError("PRICING_DECIMAL_INVALID");
  const fraction = match[3] ?? "";
  if (fraction.length > maximumScale) {
    throw new PricingCalculationError("PRICING_INPUT_SCALE_UNSUPPORTED");
  }
  const sign = match[1] === "-" ? -1n : 1n;
  return decimal(sign * BigInt(`${match[2]}${fraction}`), fraction.length);
}

function percentagePointsToRate(value: Decimal): Decimal {
  return decimal(value.coefficient, value.scale + 2);
}

function outputAmount(value: Decimal): string {
  return format(quantize(value, AMOUNT_SCALE));
}

function add(left: Decimal, right: Decimal): Decimal {
  const scale = Math.max(left.scale, right.scale);
  return decimal(
    left.coefficient * powerOfTen(scale - left.scale) + right.coefficient * powerOfTen(scale - right.scale),
    scale,
  );
}

function subtract(left: Decimal, right: Decimal): Decimal {
  return add(left, decimal(-right.coefficient, right.scale));
}

function multiply(left: Decimal, right: Decimal): Decimal {
  return decimal(left.coefficient * right.coefficient, left.scale + right.scale);
}

function divide(dividend: Decimal, divisor: Decimal, targetScale: number): Decimal {
  const divisorMagnitude = absolute(divisor.coefficient);
  if (divisorMagnitude === 0n) throw new PricingCalculationError("PRICING_INVALID_DENOMINATOR");

  const numerator = absolute(dividend.coefficient) * powerOfTen(divisor.scale + targetScale);
  const denominator = divisorMagnitude * powerOfTen(dividend.scale);
  let quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * 2n >= denominator) quotient += 1n;
  const sign = dividend.coefficient < 0n === divisor.coefficient < 0n ? 1n : -1n;
  return decimal(sign * quotient, targetScale);
}

function quantize(value: Decimal, targetScale: number): Decimal {
  if (value.scale <= targetScale) return value;
  const factor = powerOfTen(value.scale - targetScale);
  let quotient = absolute(value.coefficient) / factor;
  const remainder = absolute(value.coefficient) % factor;
  if (remainder * 2n >= factor) quotient += 1n;
  return decimal(value.coefficient < 0n ? -quotient : quotient, targetScale);
}

function compare(left: Decimal, right: Decimal): -1 | 0 | 1 {
  const scale = Math.max(left.scale, right.scale);
  const a = left.coefficient * powerOfTen(scale - left.scale);
  const b = right.coefficient * powerOfTen(scale - right.scale);
  return a < b ? -1 : a > b ? 1 : 0;
}

function decimal(coefficient: bigint, scale: number): Decimal {
  let normalizedCoefficient = coefficient;
  let normalizedScale = scale;
  while (normalizedScale > 0 && normalizedCoefficient % 10n === 0n) {
    normalizedCoefficient /= 10n;
    normalizedScale -= 1;
  }
  return { coefficient: normalizedCoefficient, scale: normalizedScale };
}

function format(value: Decimal): string {
  const negative = value.coefficient < 0n;
  const digits = absolute(value.coefficient).toString().padStart(value.scale + 1, "0");
  if (value.scale === 0) return `${negative ? "-" : ""}${digits}`;
  return `${negative ? "-" : ""}${digits.slice(0, -value.scale)}.${digits.slice(-value.scale)}`;
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function powerOfTen(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}
