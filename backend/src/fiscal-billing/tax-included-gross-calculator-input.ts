import { Prisma } from "@prisma/client";
import {
  calculateCrV44FiscalDocument,
  type CrV44FiscalCalculationResult,
  type CrV44FiscalLineCategory,
  type CrV44OrdinaryIvaInput,
} from "./cr-v44-fiscal-calculation-policy";

export const CR_V44_FISCAL_MONEY_TICK = new Prisma.Decimal("0.00001");

export interface TaxIncludedGrossCrV44LineInput {
  readonly grossAmount: Prisma.Decimal;
  readonly category: CrV44FiscalLineCategory;
  readonly quantity: Prisma.Decimal;
  readonly tax: Pick<CrV44OrdinaryIvaInput, "tariffCode" | "ratePercentage">;
}

export interface TaxIncludedGrossCrV44Candidate {
  readonly unitPrice: string;
  readonly calculatedTotal: Prisma.Decimal;
  readonly absoluteDifference: Prisma.Decimal;
  readonly calculation: CrV44FiscalCalculationResult;
}

/**
 * Resolves an authoritative tax-included gross amount to one valid CR v4.4
 * tax-exclusive calculator input. Candidate totals always come from the
 * calculator; this helper never reproduces tax arithmetic.
 */
export function resolveTaxIncludedGrossCrV44Candidate(
  input: TaxIncludedGrossCrV44LineInput,
): TaxIncludedGrossCrV44Candidate {
  const divisor = new Prisma.Decimal(1).plus(
    new Prisma.Decimal(input.tax.ratePercentage).dividedBy(100),
  );
  const anchor = input.grossAmount
    .dividedBy(input.quantity)
    .dividedBy(divisor)
    .toDecimalPlaces(5, Prisma.Decimal.ROUND_HALF_UP);

  const candidates = [
    anchor.minus(CR_V44_FISCAL_MONEY_TICK),
    anchor,
    anchor.plus(CR_V44_FISCAL_MONEY_TICK),
  ]
    .filter((unitPrice) => unitPrice.greaterThan(0))
    .filter((unitPrice, index, values) =>
      values.findIndex((value) => value.equals(unitPrice)) === index,
    )
    .map((unitPrice) => calculateCandidate(input, unitPrice));

  if (candidates.length === 0) {
    throw new Error("tax-included gross has no positive unit-price candidate");
  }

  return candidates.sort(compareCandidates)[0]!;
}

/**
 * The settlement callback keeps currency policy outside the fiscal calculator
 * and makes this bounded reconciliation reusable by other fiscal adapters.
 */
export function isFiscalTickReconciledTotal(input: {
  readonly authoritativeGross: Prisma.Decimal;
  readonly calculatedTotal: Prisma.Decimal;
  readonly normalizeSettlementAmount: (amount: Prisma.Decimal) => Prisma.Decimal;
}): boolean {
  if (input.calculatedTotal.equals(input.authoritativeGross)) return true;
  if (
    input.calculatedTotal
      .minus(input.authoritativeGross)
      .abs()
      .greaterThan(CR_V44_FISCAL_MONEY_TICK)
  ) {
    return false;
  }

  try {
    return input.normalizeSettlementAmount(input.calculatedTotal).equals(
      input.normalizeSettlementAmount(input.authoritativeGross),
    );
  } catch {
    return false;
  }
}

function calculateCandidate(
  input: TaxIncludedGrossCrV44LineInput,
  unitPrice: Prisma.Decimal,
): TaxIncludedGrossCrV44Candidate {
  const calculation = calculateCrV44FiscalDocument({
    lines: [{
      lineNumber: 1,
      category: input.category,
      quantity: input.quantity.toFixed(),
      unitPrice: unitPrice.toFixed(),
      discounts: [],
      taxes: [{ kind: "ORDINARY_IVA", ...input.tax }],
    }],
  });
  const calculatedTotal = new Prisma.Decimal(calculation.internalTotals.lineTotal);
  return {
    unitPrice: unitPrice.toFixed(),
    calculatedTotal,
    absoluteDifference: calculatedTotal.minus(input.grossAmount).abs(),
    calculation,
  };
}

function compareCandidates(
  a: TaxIncludedGrossCrV44Candidate,
  b: TaxIncludedGrossCrV44Candidate,
) {
  if (a.absoluteDifference.lessThan(b.absoluteDifference)) return -1;
  if (a.absoluteDifference.greaterThan(b.absoluteDifference)) return 1;
  return new Prisma.Decimal(a.unitPrice).comparedTo(new Prisma.Decimal(b.unitPrice));
}
