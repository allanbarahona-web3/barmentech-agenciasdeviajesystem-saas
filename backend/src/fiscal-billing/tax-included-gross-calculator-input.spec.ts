import { Prisma } from "@prisma/client";
import { validateCrV44CalculatedSnapshot } from "./cr-v44-calculated-snapshot-validator";
import { mapCrV44CalculationToBillingDocumentSnapshot } from "./cr-v44-billing-document-snapshot";
import {
  CR_V44_FISCAL_MONEY_TICK,
  isFiscalTickReconciledTotal,
  resolveTaxIncludedGrossCrV44Candidate,
} from "./tax-included-gross-calculator-input";

describe("tax-included gross CR v4.4 calculator input", () => {
  it("selects the lower tied 13% candidate for gross 333 and keeps the calculator total", () => {
    const result = resolve("333", "08", "13");

    expect(result.unitPrice).toBe("294.69026");
    expect(result.calculatedTotal.toFixed()).toBe("332.99999");
    expect(result.absoluteDifference.equals(CR_V44_FISCAL_MONEY_TICK)).toBe(true);
    expect(isFiscalTickReconciledTotal({
      authoritativeGross: new Prisma.Decimal("333"),
      calculatedTotal: result.calculatedTotal,
      normalizeSettlementAmount: cents,
    })).toBe(true);
    validateCrV44CalculatedSnapshot(snapshot(result));
  });

  it.each([
    ["500", "442.47788"],
    ["150", "132.74336"],
    ["25", "22.12389"],
    ["5", "4.42478"],
  ])("prefers an exact 13%% candidate for gross %s", (gross, unitPrice) => {
    const result = resolve(gross, "08", "13");
    expect(result.unitPrice).toBe(unitPrice);
    expect(result.calculatedTotal.equals(new Prisma.Decimal(gross))).toBe(true);
  });

  it.each([
    ["02", "1"],
    ["03", "2"],
    ["04", "4"],
    ["08", "13"],
    ["09", "0.5"],
  ])("uses calculator candidates for supported %s / %s%% IVA", (tariffCode, ratePercentage) => {
    const result = resolve("333", tariffCode, ratePercentage);
    expect(result.absoluteDifference.lessThanOrEqualTo(CR_V44_FISCAL_MONEY_TICK)).toBe(true);
  });

  it("keeps zero-tax gross exact", () => {
    const result = resolve("333", "10", "0");
    expect(result.unitPrice).toBe("333");
    expect(result.calculatedTotal.toFixed()).toBe("333");
    expect(result.absoluteDifference.isZero()).toBe(true);
  });

  it("rejects a difference above one fiscal tick", () => {
    expect(isFiscalTickReconciledTotal({
      authoritativeGross: new Prisma.Decimal("333"),
      calculatedTotal: new Prisma.Decimal("333.00002"),
      normalizeSettlementAmount: cents,
    })).toBe(false);
  });

  it("rejects a one-tick difference that changes settlement", () => {
    expect(isFiscalTickReconciledTotal({
      authoritativeGross: new Prisma.Decimal("0.005"),
      calculatedTotal: new Prisma.Decimal("0.00499"),
      normalizeSettlementAmount: cents,
    })).toBe(false);
  });
});

function resolve(gross: string, tariffCode: string, ratePercentage: string) {
  return resolveTaxIncludedGrossCrV44Candidate({
    grossAmount: new Prisma.Decimal(gross),
    category: "SERVICE",
    quantity: new Prisma.Decimal(1),
    tax: { tariffCode, ratePercentage },
  });
}

function cents(amount: Prisma.Decimal) {
  return amount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function snapshot(result: ReturnType<typeof resolveTaxIncludedGrossCrV44Candidate>) {
  const mapped = mapCrV44CalculationToBillingDocumentSnapshot(result.calculation, [{
    lineNumber: 1,
    cabysCode: "1234567890123",
    itemCode: "item-a",
    description: "Tax-included gross",
    unitOfMeasureCode: "Unid",
    taxCode: "01",
  }]);
  return {
    fiscalCalculationPolicyVersion: "CR_V44_DECIMAL_V1",
    totals: mapped.totals,
    lines: mapped.lines.map((line) => ({
      ...line,
      taxes: line.taxes.map((tax) => ({ ...tax, exemption: null })),
    })),
  };
}
