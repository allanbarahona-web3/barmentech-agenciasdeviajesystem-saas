import {
  FiscalCalculationError,
  addFiscalDecimals,
  assertFiscalDecimalCapacity,
  compareFiscalDecimals,
  divideFiscalDecimalByPowerOfTen,
  divideFiscalDecimals,
  multiplyFiscalDecimals,
  parseFiscalDecimal,
  quantizeFiscalDecimal,
  sanitizeFiscalCalculationError,
  subtractFiscalDecimals,
  sumFiscalDecimals,
  zeroFiscalDecimal,
  type FiscalCalculationErrorCode,
  type FiscalDecimal,
} from "./fiscal-decimal";

export const CR_V44_DECIMAL_V1 = "CR_V44_DECIMAL_V1" as const;

export type CrV44FiscalLineCategory = "SERVICE" | "MERCHANDISE";

export type CrV44DiscountInput =
  | Readonly<{ order: number; kind: "EXACT_AMOUNT"; amount: string }>
  | Readonly<{ order: number; kind: "PERCENTAGE"; percentage: string }>;

export interface CrV44OrdinaryExemptionInput {
  readonly kind: "ORDINARY";
  /**
   * Official TarifaExonerada in IVA percentage points. This is not the persisted
   * commercial exemptedPercentage; mapping that value requires a later explicit
   * integration rule.
   */
  readonly exoneratedTariffPercentage: string;
}

export interface CrV44OrdinaryIvaInput {
  readonly kind: "ORDINARY_IVA";
  readonly tariffCode: string;
  readonly ratePercentage: string;
  readonly exemption?: CrV44OrdinaryExemptionInput;
}

export interface CrV44FiscalLineInput {
  readonly lineNumber: number;
  readonly category: CrV44FiscalLineCategory;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly discounts: readonly CrV44DiscountInput[];
  readonly taxes: readonly CrV44OrdinaryIvaInput[];
}

export interface CrV44FiscalDocumentInput {
  readonly lines: readonly CrV44FiscalLineInput[];
}

export interface CrV44CalculatedDiscount {
  readonly order: number;
  readonly kind: "EXACT_AMOUNT" | "PERCENTAGE";
  readonly amount: string;
}

export interface CrV44CalculatedLine {
  readonly lineNumber: number;
  readonly category: CrV44FiscalLineCategory;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly grossAmount: string;
  readonly discounts: readonly CrV44CalculatedDiscount[];
  readonly discountAmount: string;
  readonly lineSubtotal: string;
  readonly taxableBase: string;
  readonly taxableAmount: string;
  readonly exemptAmount: string;
  readonly exoneratedAmount: string;
  readonly ivaTariffCode: string;
  readonly ivaRatePercentage: string;
  readonly grossTaxAmount: string;
  readonly exoneratedTariffPercentage: string | null;
  readonly exoneratedTaxAmount: string;
  readonly netTaxAmount: string;
  readonly lineTotal: string;
}

/** Exact sums of calculated line snapshots; these are not Hacienda XML fields. */
export interface CrV44InternalCalculatedTotals {
  readonly grossAmountTotal: string;
  readonly discountAmountTotal: string;
  readonly postDiscountBaseTotal: string;
  readonly taxableBaseTotal: string;
  readonly exemptBaseTotal: string;
  readonly exoneratedBaseTotal: string;
  readonly grossTaxAmountTotal: string;
  readonly exoneratedTaxAmountTotal: string;
  readonly netTaxAmountTotal: string;
  readonly lineTotal: string;
}

/** Hacienda v4.4 summary values for the deliberately supported subset. */
export interface CrV44HaciendaSummary {
  readonly grossServiceTotal: string;
  readonly grossMerchandiseTotal: string;
  readonly taxableServiceTotal: string;
  readonly taxableMerchandiseTotal: string;
  readonly exemptServiceTotal: string;
  readonly exemptMerchandiseTotal: string;
  readonly exoneratedServiceTotal: string;
  readonly exoneratedMerchandiseTotal: string;
  readonly taxableTotal: string;
  readonly exemptTotal: string;
  readonly exoneratedTotal: string;
  readonly totalSale: string;
  readonly totalDiscounts: string;
  readonly netSale: string;
  readonly grossTax: string;
  readonly exoneratedTax: string;
  readonly netTax: string;
  readonly total: string;
}

export interface CrV44FiscalCalculationResult {
  readonly policyVersion: typeof CR_V44_DECIMAL_V1;
  readonly lines: readonly CrV44CalculatedLine[];
  readonly internalTotals: CrV44InternalCalculatedTotals;
  readonly haciendaSummary: CrV44HaciendaSummary;
}

const QUANTITY = Object.freeze({ precision: 16, scale: 3, positive: true });
const MONEY = Object.freeze({ precision: 19, scale: 5 });
const HACIENDA_MONEY = Object.freeze({ precision: 18, scale: 5 });
const PERCENTAGE = Object.freeze({ precision: 5, scale: 2 });
const SUPPORTED_IVA_TARIFFS: Readonly<Record<string, string>> = Object.freeze({
  "02": "1",
  "03": "2",
  "04": "4",
  "08": "13",
  "09": "0.5",
  "10": "0",
});
const DOCUMENT_KEYS = new Set(["lines"]);
const LINE_KEYS = new Set([
  "lineNumber",
  "category",
  "quantity",
  "unitPrice",
  "discounts",
  "taxes",
]);

/**
 * Costa Rica v4.4 calculation order and quantization policy:
 *
 * 1. quantity × unit price is quantized to five decimal places;
 * 2. every percentage discount is calculated from the then-current remainder
 *    and quantized to five decimals before the next discount is applied;
 * 3. subtotal and ordinary IVA base are the exact post-discount remainder;
 * 4. gross IVA and exempted IVA are independently calculated from the base and
 *    their respective tariffs, then quantized to five decimals;
 * 5. the internal base classified as exonerated is base × exonerated tariff ÷
 *    IVA tariff, quantized to five decimals; the remaining base is taxable;
 * 6. net tax and line total use those quantized line values;
 * 7. internal totals are exact sums of calculated line fields; Hacienda summary
 *    exoneration uses its aggregate tax-ratio formula per fiscal category.
 *
 * All quantization is round-to-nearest at five decimals, with an exact sixth
 * digit tie rounded upward. Canonical output omits insignificant trailing zeros.
 */
export function calculateCrV44FiscalDocument(input: unknown): CrV44FiscalCalculationResult {
  try {
    return calculate(input);
  } catch (error) {
    throw sanitizeFiscalCalculationError(error);
  }
}

/** Pure capacity boundary for a Hacienda Decimal(18,5) monetary field. */
export function assertHaciendaCrV44MoneyCapacity(value: unknown): string {
  try {
    return parseFiscalDecimal(value, HACIENDA_MONEY).canonical;
  } catch (error) {
    throw sanitizeFiscalCalculationError(error);
  }
}

function calculate(input: unknown): CrV44FiscalCalculationResult {
  const document = exactRecord(input, DOCUMENT_KEYS, "FISCAL_CALCULATION_INVALID_INPUT");
  if (!Array.isArray(document.lines) || document.lines.length === 0) {
    fail("FISCAL_CALCULATION_INVALID_INPUT");
  }

  const calculatedLines: CrV44CalculatedLine[] = [];
  let previousLineNumber = 0;
  for (const rawLine of document.lines) {
    const line = exactRecord(rawLine, LINE_KEYS, "FISCAL_CALCULATION_INVALID_INPUT");
    const lineNumber = positiveOrder(line.lineNumber);
    if (lineNumber <= previousLineNumber) fail("FISCAL_CALCULATION_INVALID_ORDERING");
    previousLineNumber = lineNumber;
    calculatedLines.push(calculateLine(lineNumber, line));
  }

  const internalTotals = freezeInternalTotals({
    grossAmountTotal: sumLineMoney(calculatedLines, "grossAmount"),
    discountAmountTotal: sumLineMoney(calculatedLines, "discountAmount"),
    postDiscountBaseTotal: sumLineMoney(calculatedLines, "lineSubtotal"),
    taxableBaseTotal: sumLineMoney(calculatedLines, "taxableAmount"),
    exemptBaseTotal: sumLineMoney(calculatedLines, "exemptAmount"),
    exoneratedBaseTotal: sumLineMoney(calculatedLines, "exoneratedAmount"),
    grossTaxAmountTotal: sumLineMoney(calculatedLines, "grossTaxAmount"),
    exoneratedTaxAmountTotal: sumLineMoney(calculatedLines, "exoneratedTaxAmount"),
    netTaxAmountTotal: sumLineMoney(calculatedLines, "netTaxAmount"),
    lineTotal: sumLineMoney(calculatedLines, "lineTotal"),
  });
  const haciendaSummary = calculateHaciendaSummary(calculatedLines, internalTotals);

  return Object.freeze({
    policyVersion: CR_V44_DECIMAL_V1,
    lines: Object.freeze(calculatedLines),
    internalTotals,
    haciendaSummary,
  });
}

function calculateLine(
  lineNumber: number,
  line: Readonly<Record<string, unknown>>,
): CrV44CalculatedLine {
  const quantity = parseFiscalDecimal(line.quantity, QUANTITY);
  const unitPrice = parseFiscalDecimal(line.unitPrice, MONEY);
  const category = fiscalCategory(line.category);
  const grossAmount = money(multiplyFiscalDecimals(quantity, unitPrice));

  if (!Array.isArray(line.discounts)) fail("FISCAL_CALCULATION_INVALID_INPUT");
  if (line.discounts.length > 5) fail("FISCAL_CALCULATION_DISCOUNT_UNSUPPORTED");
  let remaining = grossAmount;
  let previousDiscountOrder = 0;
  const calculatedDiscounts: CrV44CalculatedDiscount[] = [];
  for (const rawDiscount of line.discounts) {
    const discount = calculateDiscount(rawDiscount, remaining, previousDiscountOrder);
    previousDiscountOrder = discount.order;
    remaining = subtractFiscalDecimals(remaining, discount.decimalAmount);
    calculatedDiscounts.push(Object.freeze({
      order: discount.order,
      kind: discount.kind,
      amount: discount.decimalAmount.canonical,
    }));
  }

  const lineSubtotal = money(remaining);
  const taxableBase = lineSubtotal;
  const discountAmount = money(subtractFiscalDecimals(grossAmount, lineSubtotal));
  const tax = calculateTax(line.taxes, taxableBase);
  const lineTotal = money(addFiscalDecimals(lineSubtotal, tax.netTaxAmount));

  return Object.freeze({
    lineNumber,
    category,
    quantity: quantity.canonical,
    unitPrice: unitPrice.canonical,
    grossAmount: grossAmount.canonical,
    discounts: Object.freeze(calculatedDiscounts),
    discountAmount: discountAmount.canonical,
    lineSubtotal: lineSubtotal.canonical,
    taxableBase: taxableBase.canonical,
    taxableAmount: tax.taxableAmount.canonical,
    exemptAmount: tax.exemptAmount.canonical,
    exoneratedAmount: tax.exoneratedAmount.canonical,
    ivaTariffCode: tax.tariffCode,
    ivaRatePercentage: tax.rate.canonical,
    grossTaxAmount: tax.grossTaxAmount.canonical,
    exoneratedTariffPercentage: tax.exoneratedTariff?.canonical ?? null,
    exoneratedTaxAmount: tax.exoneratedTaxAmount.canonical,
    netTaxAmount: tax.netTaxAmount.canonical,
    lineTotal: lineTotal.canonical,
  });
}

function calculateDiscount(
  input: unknown,
  remaining: FiscalDecimal,
  previousOrder: number,
): {
  readonly order: number;
  readonly kind: "EXACT_AMOUNT" | "PERCENTAGE";
  readonly decimalAmount: FiscalDecimal;
} {
  const record = recordOf(input, "FISCAL_CALCULATION_DISCOUNT_UNSUPPORTED");
  const order = positiveOrder(record.order, "FISCAL_CALCULATION_INVALID_ORDERING");
  if (order <= previousOrder) fail("FISCAL_CALCULATION_INVALID_ORDERING");

  let amount: FiscalDecimal;
  if (record.kind === "EXACT_AMOUNT") {
    exactKeys(record, new Set(["order", "kind", "amount"]), "FISCAL_CALCULATION_DISCOUNT_UNSUPPORTED");
    amount = parseFiscalDecimal(record.amount, MONEY);
  } else if (record.kind === "PERCENTAGE") {
    exactKeys(record, new Set(["order", "kind", "percentage"]), "FISCAL_CALCULATION_DISCOUNT_UNSUPPORTED");
    const percentage = parseFiscalDecimal(record.percentage, PERCENTAGE);
    if (compareFiscalDecimals(percentage, decimal("100")) === 1) {
      fail("FISCAL_CALCULATION_DISCOUNT_UNSUPPORTED");
    }
    amount = money(divideFiscalDecimalByPowerOfTen(
      multiplyFiscalDecimals(remaining, percentage),
      2,
    ));
  } else {
    fail("FISCAL_CALCULATION_DISCOUNT_UNSUPPORTED");
  }

  if (compareFiscalDecimals(amount, remaining) === 1) {
    fail("FISCAL_CALCULATION_DISCOUNT_UNSUPPORTED");
  }
  return Object.freeze({ order, kind: record.kind, decimalAmount: amount });
}

function calculateTax(input: unknown, base: FiscalDecimal): {
  readonly tariffCode: string;
  readonly rate: FiscalDecimal;
  readonly grossTaxAmount: FiscalDecimal;
  readonly exoneratedTariff: FiscalDecimal | null;
  readonly exoneratedTaxAmount: FiscalDecimal;
  readonly netTaxAmount: FiscalDecimal;
  readonly taxableAmount: FiscalDecimal;
  readonly exemptAmount: FiscalDecimal;
  readonly exoneratedAmount: FiscalDecimal;
} {
  if (!Array.isArray(input) || input.length !== 1) fail("FISCAL_CALCULATION_TAX_INVALID");
  const tax = exactRecord(
    input[0],
    new Set(["kind", "tariffCode", "ratePercentage", "exemption"]),
    "FISCAL_CALCULATION_TAX_INVALID",
    new Set(["exemption"]),
  );
  if (tax.kind !== "ORDINARY_IVA") fail("FISCAL_CALCULATION_TAX_INVALID");
  if (typeof tax.tariffCode !== "string") fail("FISCAL_CALCULATION_TAX_INVALID");
  const expectedRate = SUPPORTED_IVA_TARIFFS[tax.tariffCode];
  if (expectedRate === undefined) fail("FISCAL_CALCULATION_TAX_INVALID");
  const rate = parseFiscalDecimal(tax.ratePercentage, PERCENTAGE);
  if (rate.canonical !== expectedRate) fail("FISCAL_CALCULATION_TAX_INVALID");
  const grossTaxAmount = money(divideFiscalDecimalByPowerOfTen(
    multiplyFiscalDecimals(base, rate),
    2,
  ));

  if (tax.exemption === undefined) {
    return Object.freeze({
      tariffCode: tax.tariffCode,
      rate,
      grossTaxAmount,
      exoneratedTariff: null,
      exoneratedTaxAmount: zeroFiscalDecimal(),
      netTaxAmount: grossTaxAmount,
      taxableAmount: tax.tariffCode === "10" ? zeroFiscalDecimal() : base,
      exemptAmount: tax.tariffCode === "10" ? base : zeroFiscalDecimal(),
      exoneratedAmount: zeroFiscalDecimal(),
    });
  }

  if (tax.tariffCode === "10" || rate.coefficient === 0n) {
    fail("FISCAL_CALCULATION_EXEMPTION_INVALID");
  }
  const exemption = exactRecord(
    tax.exemption,
    new Set(["kind", "exoneratedTariffPercentage"]),
    "FISCAL_CALCULATION_EXEMPTION_INVALID",
  );
  if (exemption.kind !== "ORDINARY") fail("FISCAL_CALCULATION_EXEMPTION_INVALID");
  const exoneratedTariff = parseFiscalDecimal(
    exemption.exoneratedTariffPercentage,
    PERCENTAGE,
  );
  if (
    exoneratedTariff.coefficient === 0n
    || compareFiscalDecimals(exoneratedTariff, rate) === 1
  ) {
    fail("FISCAL_CALCULATION_EXEMPTION_INVALID");
  }

  const exoneratedTaxAmount = money(divideFiscalDecimalByPowerOfTen(
    multiplyFiscalDecimals(base, exoneratedTariff),
    2,
  ));
  if (compareFiscalDecimals(exoneratedTaxAmount, grossTaxAmount) === 1) {
    fail("FISCAL_CALCULATION_STATE_UNSUPPORTED");
  }
  const netTaxAmount = money(subtractFiscalDecimals(grossTaxAmount, exoneratedTaxAmount));
  const exoneratedAmount = money(divideFiscalDecimals(
    multiplyFiscalDecimals(base, exoneratedTariff),
    rate,
    5,
  ));
  if (compareFiscalDecimals(exoneratedAmount, base) === 1) {
    fail("FISCAL_CALCULATION_STATE_UNSUPPORTED");
  }
  const taxableAmount = money(subtractFiscalDecimals(base, exoneratedAmount));

  return Object.freeze({
    tariffCode: tax.tariffCode,
    rate,
    grossTaxAmount,
    exoneratedTariff,
    exoneratedTaxAmount,
    netTaxAmount,
    taxableAmount,
    exemptAmount: zeroFiscalDecimal(),
    exoneratedAmount,
  });
}

function sumLineMoney(
  lines: readonly CrV44CalculatedLine[],
  key: keyof Pick<CrV44CalculatedLine,
    | "grossAmount"
    | "discountAmount"
    | "lineSubtotal"
    | "taxableAmount"
    | "exemptAmount"
    | "exoneratedAmount"
    | "grossTaxAmount"
    | "exoneratedTaxAmount"
    | "netTaxAmount"
    | "lineTotal">,
): string {
  const values = lines.map((line) => parseFiscalDecimal(line[key], MONEY));
  return money(sumFiscalDecimals(values)).canonical;
}

function freezeInternalTotals(
  values: CrV44InternalCalculatedTotals,
): CrV44InternalCalculatedTotals {
  return Object.freeze(values);
}

function calculateHaciendaSummary(
  lines: readonly CrV44CalculatedLine[],
  internal: CrV44InternalCalculatedTotals,
): CrV44HaciendaSummary {
  const service = calculateHaciendaCategory(lines, "SERVICE");
  const merchandise = calculateHaciendaCategory(lines, "MERCHANDISE");
  const taxableTotal = money(addFiscalDecimals(service.taxable, merchandise.taxable));
  const exemptTotal = money(addFiscalDecimals(service.exempt, merchandise.exempt));
  const exoneratedTotal = money(addFiscalDecimals(service.exonerated, merchandise.exonerated));
  const totalSale = money(sumFiscalDecimals([taxableTotal, exemptTotal, exoneratedTotal]));
  const totalDiscounts = decimal(internal.discountAmountTotal);
  const netSale = money(subtractFiscalDecimals(totalSale, totalDiscounts));
  const grossTax = decimal(internal.grossTaxAmountTotal);
  const exoneratedTax = decimal(internal.exoneratedTaxAmountTotal);
  const netTax = decimal(internal.netTaxAmountTotal);
  const total = money(addFiscalDecimals(netSale, netTax));

  return Object.freeze({
    grossServiceTotal: service.gross.canonical,
    grossMerchandiseTotal: merchandise.gross.canonical,
    taxableServiceTotal: service.taxable.canonical,
    taxableMerchandiseTotal: merchandise.taxable.canonical,
    exemptServiceTotal: service.exempt.canonical,
    exemptMerchandiseTotal: merchandise.exempt.canonical,
    exoneratedServiceTotal: service.exonerated.canonical,
    exoneratedMerchandiseTotal: merchandise.exonerated.canonical,
    taxableTotal: taxableTotal.canonical,
    exemptTotal: exemptTotal.canonical,
    exoneratedTotal: exoneratedTotal.canonical,
    totalSale: totalSale.canonical,
    totalDiscounts: totalDiscounts.canonical,
    netSale: netSale.canonical,
    grossTax: grossTax.canonical,
    exoneratedTax: exoneratedTax.canonical,
    netTax: netTax.canonical,
    total: total.canonical,
  });
}

function calculateHaciendaCategory(
  lines: readonly CrV44CalculatedLine[],
  category: CrV44FiscalLineCategory,
): {
  readonly gross: FiscalDecimal;
  readonly taxable: FiscalDecimal;
  readonly exempt: FiscalDecimal;
  readonly exonerated: FiscalDecimal;
} {
  const categoryLines = lines.filter((line) => line.category === category);
  const exemptLines = categoryLines.filter((line) => line.ivaTariffCode === "10");
  const taxedLines = categoryLines.filter((line) => line.ivaTariffCode !== "10");
  const gross = sumCalculatedMoney(categoryLines, "grossAmount");
  const exempt = sumCalculatedMoney(exemptLines, "grossAmount");
  const taxedGross = sumCalculatedMoney(taxedLines, "grossAmount");
  const grossTax = sumCalculatedMoney(taxedLines, "grossTaxAmount");
  const exoneratedTax = sumCalculatedMoney(taxedLines, "exoneratedTaxAmount");
  const hasExoneration = taxedLines.some(
    (line) => line.exoneratedTariffPercentage !== null,
  );

  let exonerated = zeroFiscalDecimal();
  if (hasExoneration) {
    if (grossTax.coefficient === 0n) fail("FISCAL_CALCULATION_STATE_UNSUPPORTED");
    exonerated = money(divideFiscalDecimals(
      multiplyFiscalDecimals(taxedGross, exoneratedTax),
      grossTax,
      5,
    ));
  }
  if (compareFiscalDecimals(exonerated, taxedGross) === 1) {
    fail("FISCAL_CALCULATION_STATE_UNSUPPORTED");
  }
  const taxable = money(subtractFiscalDecimals(taxedGross, exonerated));
  return Object.freeze({ gross, taxable, exempt, exonerated });
}

function sumCalculatedMoney(
  lines: readonly CrV44CalculatedLine[],
  key: "grossAmount" | "grossTaxAmount" | "exoneratedTaxAmount",
): FiscalDecimal {
  return money(sumFiscalDecimals(lines.map((line) => decimal(line[key]))));
}

function money(value: FiscalDecimal): FiscalDecimal {
  return assertFiscalDecimalCapacity(quantizeFiscalDecimal(value, 5), MONEY);
}

function decimal(value: string): FiscalDecimal {
  return parseFiscalDecimal(value, MONEY);
}

function positiveOrder(
  value: unknown,
  code: FiscalCalculationErrorCode = "FISCAL_CALCULATION_INVALID_ORDERING",
): number {
  if (typeof value !== "number" || value <= 0 || value % 1 !== 0 || !Number.isSafeInteger(value)) {
    fail(code);
  }
  return value;
}

function fiscalCategory(value: unknown): CrV44FiscalLineCategory {
  if (value !== "SERVICE" && value !== "MERCHANDISE") {
    fail("FISCAL_CALCULATION_INVALID_INPUT");
  }
  return value;
}

function exactRecord(
  value: unknown,
  keys: ReadonlySet<string>,
  code: FiscalCalculationErrorCode,
  optional: ReadonlySet<string> = new Set(),
): Readonly<Record<string, unknown>> {
  const record = recordOf(value, code);
  exactKeys(record, keys, code);
  for (const key of keys) {
    if (!optional.has(key) && !(key in record)) fail(code);
  }
  return record;
}

function exactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: ReadonlySet<string>,
  code: FiscalCalculationErrorCode,
): void {
  for (const key of Object.keys(record)) if (!keys.has(key)) fail(code);
}

function recordOf(value: unknown, code: FiscalCalculationErrorCode): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(code);
  return value as Readonly<Record<string, unknown>>;
}

function fail(code: FiscalCalculationErrorCode): never {
  throw new FiscalCalculationError(code);
}
