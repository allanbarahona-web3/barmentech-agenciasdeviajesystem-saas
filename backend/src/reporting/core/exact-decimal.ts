import type { ExactDecimalString, ReportAmounts, ReportDocumentEffect } from "../contracts/reporting.contracts";

export const ZERO_AMOUNTS: ReportAmounts = Object.freeze({
  grossSales: "0",
  discounts: "0",
  taxableSales: "0",
  exemptSales: "0",
  exoneratedSales: "0",
  grossTax: "0",
  exoneratedTax: "0",
  taxCollected: "0",
  total: "0",
});

export function applyEffect(amounts: ReportAmounts, effect: ReportDocumentEffect): ReportAmounts {
  return effect === "INCREASE" ? amounts : mapAmounts(amounts, negate);
}

export function addAmounts(left: ReportAmounts, right: ReportAmounts): ReportAmounts {
  return {
    grossSales: add(left.grossSales, right.grossSales),
    discounts: add(left.discounts, right.discounts),
    taxableSales: add(left.taxableSales, right.taxableSales),
    exemptSales: add(left.exemptSales, right.exemptSales),
    exoneratedSales: add(left.exoneratedSales, right.exoneratedSales),
    grossTax: add(left.grossTax, right.grossTax),
    exoneratedTax: add(left.exoneratedTax, right.exoneratedTax),
    taxCollected: add(left.taxCollected, right.taxCollected),
    total: add(left.total, right.total),
  };
}

export function addDecimal(left: ExactDecimalString, right: ExactDecimalString): ExactDecimalString {
  return add(left, right);
}

/** Exact fixed-decimal multiplication; it never coerces fiscal values to Number. */
export function multiplyDecimal(left: ExactDecimalString, right: ExactDecimalString): ExactDecimalString {
  const a = parse(left); const b = parse(right);
  return format(a.integer * b.integer, a.scale + b.scale);
}

export function applyDecimalEffect(value: ExactDecimalString, effect: ReportDocumentEffect): ExactDecimalString {
  return effect === "INCREASE" ? value : negate(value);
}

function mapAmounts(amounts: ReportAmounts, transform: (value: ExactDecimalString) => ExactDecimalString): ReportAmounts {
  return {
    grossSales: transform(amounts.grossSales), discounts: transform(amounts.discounts), taxableSales: transform(amounts.taxableSales),
    exemptSales: transform(amounts.exemptSales), exoneratedSales: transform(amounts.exoneratedSales), grossTax: transform(amounts.grossTax),
    exoneratedTax: transform(amounts.exoneratedTax), taxCollected: transform(amounts.taxCollected), total: transform(amounts.total),
  };
}

function negate(value: ExactDecimalString): ExactDecimalString {
  return value === "0" ? value : value.startsWith("-") ? value.slice(1) : `-${value}`;
}

function add(left: ExactDecimalString, right: ExactDecimalString): ExactDecimalString {
  const a = parse(left); const b = parse(right); const scale = Math.max(a.scale, b.scale);
  const total = a.integer * power10(scale - a.scale) + b.integer * power10(scale - b.scale);
  return format(total, scale);
}

function parse(value: string): { integer: bigint; scale: number } {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error("REPORTING_DECIMAL_INVALID");
  const scale = match[3]?.length ?? 0;
  const integer = BigInt(`${match[1]}${match[2]}${match[3] ?? ""}`);
  return { integer, scale };
}

function power10(exponent: number): bigint { return 10n ** BigInt(exponent); }

function format(integer: bigint, scale: number): ExactDecimalString {
  const negative = integer < 0n; const digits = (negative ? -integer : integer).toString();
  if (scale === 0) return `${negative ? "-" : ""}${digits}`;
  const padded = digits.padStart(scale + 1, "0");
  const whole = padded.slice(0, -scale); const fraction = padded.slice(-scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
