import { CR_V44_DECIMAL_V1 } from "./cr-v44-fiscal-calculation-policy";
import {
  FiscalCalculationError,
  addFiscalDecimals,
  assertFiscalDecimalCapacity,
  divideFiscalDecimalByPowerOfTen,
  fiscalDecimalsEqual,
  multiplyFiscalDecimals,
  parseFiscalDecimal,
  quantizeFiscalDecimal,
  sanitizeFiscalCalculationError,
  sumFiscalDecimals,
  zeroFiscalDecimal,
  type FiscalDecimal,
} from "./fiscal-decimal";

const QUANTITY = Object.freeze({ precision: 16, scale: 3, positive: true });
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

export interface CrV44CalculatedSnapshot {
  readonly fiscalCalculationPolicyVersion: unknown;
  readonly totals: {
    readonly grossSubtotal: unknown;
    readonly discountTotal: unknown;
    readonly taxableTotal: unknown;
    readonly exemptTotal: unknown;
    readonly exoneratedTotal: unknown;
    readonly grossTaxTotal: unknown;
    readonly exoneratedTaxTotal: unknown;
    readonly netTaxTotal: unknown;
    readonly total: unknown;
  };
  readonly lines: readonly CrV44CalculatedSnapshotLine[];
}

export interface CrV44CalculatedSnapshotLine {
  readonly lineNumber: unknown;
  readonly quantity: unknown;
  readonly unitPrice: unknown;
  readonly grossAmount: unknown;
  readonly discountAmount: unknown;
  readonly discountCode: unknown;
  readonly discountReason: unknown;
  readonly taxableBase: unknown;
  readonly taxAmount: unknown;
  readonly exoneratedTaxAmount: unknown;
  readonly netTaxAmount: unknown;
  readonly lineSubtotal: unknown;
  readonly lineTotal: unknown;
  readonly taxes: readonly CrV44CalculatedSnapshotTax[];
}

export interface CrV44CalculatedSnapshotTax {
  readonly taxOrder: unknown;
  readonly taxCode: unknown;
  readonly rateCode: unknown;
  readonly ratePercentage: unknown;
  readonly taxableBase: unknown;
  readonly taxAmount: unknown;
  readonly calculationFactor: unknown;
  readonly netTaxAmount: unknown;
  readonly exemption: unknown;
}

export function validateCrV44CalculatedSnapshot(snapshot: unknown): void {
  try {
    validate(snapshot);
  } catch (error) {
    throw sanitizeFiscalCalculationError(error);
  }
}

function validate(snapshot: unknown): void {
  if (!record(snapshot)) invalidState();
  const document = snapshot as unknown as CrV44CalculatedSnapshot;
  if (
    document.fiscalCalculationPolicyVersion !== CR_V44_DECIMAL_V1 ||
    !record(document.totals) ||
    !Array.isArray(document.lines) ||
    document.lines.length === 0
  ) {
    invalidState();
  }

  const grossAmounts: FiscalDecimal[] = [];
  const taxableBases: FiscalDecimal[] = [];
  const exemptBases: FiscalDecimal[] = [];
  const grossTaxes: FiscalDecimal[] = [];
  const netTaxes: FiscalDecimal[] = [];
  const lineTotals: FiscalDecimal[] = [];
  let previousLineNumber = 0;

  for (const line of document.lines) {
    if (!record(line) || !Array.isArray(line.taxes) || line.taxes.length !== 1) {
      invalidTax();
    }
    if (
      typeof line.lineNumber !== "number" ||
      line.lineNumber % 1 !== 0 ||
      line.lineNumber <= previousLineNumber
    ) {
      invalidTax();
    }
    previousLineNumber = line.lineNumber;

    const quantity = parseFiscalDecimal(line.quantity, QUANTITY);
    const unitPrice = money(line.unitPrice);
    const grossAmount = money(line.grossAmount);
    const discountAmount = money(line.discountAmount);
    const taxableBase = money(line.taxableBase);
    const taxAmount = money(line.taxAmount);
    const exoneratedTaxAmount = money(line.exoneratedTaxAmount);
    const netTaxAmount = money(line.netTaxAmount);
    const lineSubtotal = money(line.lineSubtotal);
    const lineTotal = money(line.lineTotal);
    const zero = zeroFiscalDecimal();

    if (
      !equal(quantizedMoney(multiplyFiscalDecimals(quantity, unitPrice)), grossAmount) ||
      !equal(discountAmount, zero) ||
      line.discountCode !== null ||
      line.discountReason !== null ||
      !equal(lineSubtotal, grossAmount) ||
      !equal(taxableBase, lineSubtotal) ||
      !equal(exoneratedTaxAmount, zero)
    ) {
      invalidTax();
    }

    const tax = line.taxes[0];
    if (!record(tax)) invalidTax();
    if (
      tax.taxOrder !== 1 ||
      tax.taxCode !== "01" ||
      typeof tax.rateCode !== "string" ||
      !(tax.rateCode in SUPPORTED_IVA_TARIFFS) ||
      tax.calculationFactor !== null ||
      tax.exemption !== null
    ) {
      invalidTax();
    }
    const rate = parseFiscalDecimal(tax.ratePercentage, PERCENTAGE);
    const expectedRate = parseFiscalDecimal(
      SUPPORTED_IVA_TARIFFS[tax.rateCode],
      PERCENTAGE,
    );
    const taxBase = money(tax.taxableBase);
    const persistedTax = money(tax.taxAmount);
    const persistedNetTax = money(tax.netTaxAmount);
    const expectedTax = quantizedMoney(
      divideFiscalDecimalByPowerOfTen(
        multiplyFiscalDecimals(taxableBase, rate),
        2,
      ),
    );
    if (
      !equal(rate, expectedRate) ||
      !equal(taxBase, taxableBase) ||
      !equal(persistedTax, expectedTax) ||
      !equal(persistedNetTax, expectedTax) ||
      !equal(taxAmount, expectedTax) ||
      !equal(netTaxAmount, expectedTax) ||
      !equal(lineTotal, addFiscalDecimals(lineSubtotal, expectedTax))
    ) {
      invalidTax();
    }

    grossAmounts.push(grossAmount);
    if (tax.rateCode === "10") exemptBases.push(taxableBase);
    else taxableBases.push(taxableBase);
    grossTaxes.push(expectedTax);
    netTaxes.push(expectedTax);
    lineTotals.push(lineTotal);
  }

  const totals = document.totals;
  if (
    !equal(money(totals.grossSubtotal), sumMoney(grossAmounts)) ||
    !equal(money(totals.discountTotal), zeroFiscalDecimal()) ||
    !equal(money(totals.taxableTotal), sumMoney(taxableBases)) ||
    !equal(money(totals.exemptTotal), sumMoney(exemptBases)) ||
    !equal(money(totals.exoneratedTotal), zeroFiscalDecimal()) ||
    !equal(money(totals.grossTaxTotal), sumMoney(grossTaxes)) ||
    !equal(money(totals.exoneratedTaxTotal), zeroFiscalDecimal()) ||
    !equal(money(totals.netTaxTotal), sumMoney(netTaxes)) ||
    !equal(money(totals.total), sumMoney(lineTotals))
  ) {
    invalidState();
  }
}

function money(value: unknown): FiscalDecimal {
  return parseFiscalDecimal(value, HACIENDA_MONEY);
}

function quantizedMoney(value: FiscalDecimal): FiscalDecimal {
  return assertFiscalDecimalCapacity(
    quantizeFiscalDecimal(value, HACIENDA_MONEY.scale),
    HACIENDA_MONEY,
  );
}

function sumMoney(values: readonly FiscalDecimal[]): FiscalDecimal {
  return assertFiscalDecimalCapacity(sumFiscalDecimals(values), HACIENDA_MONEY);
}

function equal(a: FiscalDecimal, b: FiscalDecimal): boolean {
  return fiscalDecimalsEqual(a, b);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidTax(): never {
  throw new FiscalCalculationError("FISCAL_CALCULATION_TAX_INVALID");
}

function invalidState(): never {
  throw new FiscalCalculationError("FISCAL_CALCULATION_STATE_UNSUPPORTED");
}
