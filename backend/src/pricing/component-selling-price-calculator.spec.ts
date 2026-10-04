import {
  ComponentSellingPriceCalculationError,
  calculateComponentSellingPrices,
  type ComponentSellingPriceCalculatorInput,
} from "./component-selling-price-calculator";
import { calculatePricingV1, PricingCalculationError } from "./pricing-v1-calculator";

describe("calculateComponentSellingPrices", () => {
  it("calculates one component with the exact PRICING_V1 aggregate result", () => {
    const result = calculateComponentSellingPrices(input({ components: [component("airfare", "100")] }));
    const expected = calculatePricingV1({ authoritativeCostAmount: "100", ...configuration() });

    expect(result.rawFinalSellingPrice).toBe(expected.finalSellingPrice);
    expect(result.effectiveFinalSellingPrice).toBe(expected.finalSellingPrice);
    expect(result.unitScope).toBe("PER_PERSON");
    expect(result.components).toEqual([expect.objectContaining({
      costComponentId: "airfare", baseCost: "100", weight: "1",
      allocatedOperationalExpense: "0", rawSellingValue: expected.finalSellingPrice,
      effectiveSellingValue: expected.finalSellingPrice,
    })]);
  });

  it("decomposes multiple components and allocates operational expense proportionally", () => {
    const result = calculateComponentSellingPrices(input({
      components: [component("hotel", "300"), component("tour", "100"), component("transfer", "50"), component("airfare", "150")],
      operationalCostsAmount: "60",
    }));

    expect(result.totalComponentCost).toBe("600");
    expect(byId(result, "hotel").allocatedOperationalExpense).toBe("30");
    expect(byId(result, "tour").allocatedOperationalExpense).toBe("10");
    expect(byId(result, "transfer").allocatedOperationalExpense).toBe("5");
    expect(byId(result, "airfare").allocatedOperationalExpense).toBe("15");
    expect(sum(result.components.map((line) => line.allocatedOperationalExpense))).toBe("60");
  });

  it("reconciles its raw aggregate to PRICING_V1 with all active rates", () => {
    const value = input({
      components: [component("airfare", "150"), component("hotel", "300"), component("tour", "100")],
      operationalCostsAmount: "27.12345",
      riskMarginPercent: "1.25",
      targetProfitMarginPercent: "15",
      salesCommissionPercent: "2.5",
      bankCommissionPercent: "2.5",
      applicableTaxPercent: "13",
    });
    const result = calculateComponentSellingPrices(value);
    const expected = calculatePricingV1({ authoritativeCostAmount: "550", ...configuration(value) });

    expect(result.rawFinalSellingPrice).toBe(expected.finalSellingPrice);
    expect(sum(result.components.map((line) => line.rawSellingValue))).toBe(expected.finalSellingPrice);
    expect(result.components.every((line) => line.preTaxSellingPrice && line.bankCommission && line.tax)).toBe(true);
  });

  it.each([
    ["no commercial floor", undefined, "100", "100", "0"],
    ["raw price above floor", "90", "100", "100", "0"],
    ["raw price equal to floor", "100", "100", "100", "0"],
    ["raw price below floor", "130", "100", "130", "30"],
  ])("applies %s", (_label, commercialFloorPrice, raw, effective, retention) => {
    const result = calculateComponentSellingPrices(input({
      components: [component("only", "100")],
      commercialFloorPrice,
    }));

    expect(result.rawFinalSellingPrice).toBe(raw);
    expect(result.effectiveFinalSellingPrice).toBe(effective);
    expect(result.publishedPriceRetention).toBe(retention);
    expect(sum(result.components.map((line) => line.effectiveSellingValue))).toBe(effective);
  });

  it("allocates published-price retention proportionally and reconciles it exactly", () => {
    const result = calculateComponentSellingPrices(input({
      components: [component("hotel", "300"), component("tour", "100"), component("transfer", "50"), component("airfare", "150")],
      commercialFloorPrice: "660",
    }));

    expect(result.rawFinalSellingPrice).toBe("600");
    expect(result.publishedPriceRetention).toBe("60");
    expect(byId(result, "hotel").allocatedPublishedPriceRetention).toBe("30");
    expect(byId(result, "tour").allocatedPublishedPriceRetention).toBe("10");
    expect(byId(result, "transfer").allocatedPublishedPriceRetention).toBe("5");
    expect(byId(result, "airfare").allocatedPublishedPriceRetention).toBe("15");
    expect(sum(result.components.map((line) => line.allocatedPublishedPriceRetention))).toBe("60");
  });

  it("assigns positive allocation residual to the largest-cost component", () => {
    const result = calculateComponentSellingPrices(input({
      components: [component("largest", "3"), component("middle", "2"), component("smallest", "2")],
      operationalCostsAmount: "0.00001",
    }));

    expect(byId(result, "largest").allocatedOperationalExpense).toBe("0.00001");
    expect(byId(result, "middle").allocatedOperationalExpense).toBe("0");
    expect(byId(result, "smallest").allocatedOperationalExpense).toBe("0");
  });

  it("breaks equal-cost residual ties by costComponentId", () => {
    const result = calculateComponentSellingPrices(input({
      components: [component("zeta", "1"), component("alpha", "1")],
      operationalCostsAmount: "0.00001",
    }));

    expect(byId(result, "alpha").allocatedOperationalExpense).toBe("0");
    expect(byId(result, "zeta").allocatedOperationalExpense).toBe("0.00001");
  });

  it("uses five-decimal monetary output and exposes a line reconciliation adjustment", () => {
    const result = calculateComponentSellingPrices(input({
      components: [component("a", "0.1"), component("b", "0.2")],
      operationalCostsAmount: "0.2",
      riskMarginPercent: "0.3",
    }));

    expect(result.rawFinalSellingPrice).toBe("0.5015");
    expect(result.components.every((line) => /^\d+(?:\.\d{1,5})?$/.test(line.effectiveSellingValue))).toBe(true);
    expect(sum(result.components.map((line) => line.effectiveSellingValue))).toBe(result.effectiveFinalSellingPrice);
    expect(sum(result.components.map((line) => line.roundingAdjustment))).toBe(result.totalRoundingAdjustment);
  });

  it("is deterministic and independent of input ordering", () => {
    const first = input({ components: [component("hotel", "300"), component("airfare", "150"), component("tour", "100")] });
    const second = input({ components: [...first.components].reverse() });

    expect(calculateComponentSellingPrices(first)).toEqual(calculateComponentSellingPrices(second));
    expect(calculateComponentSellingPrices(first)).toEqual(calculateComponentSellingPrices(first));
  });

  it("changes only the affected AIRFARE contribution when its cost changes", () => {
    const before = calculateComponentSellingPrices(input({
      components: [component("airfare", "150", "snapshot-airfare-a"), component("hotel", "300")],
    }));
    const after = calculateComponentSellingPrices(input({
      components: [component("airfare", "220", "snapshot-airfare-b"), component("hotel", "300")],
    }));

    expect(after.rawFinalSellingPrice).toBe("520");
    expect(byId(after, "airfare").costSnapshotId).toBe("snapshot-airfare-b");
    expect(byId(after, "airfare").effectiveSellingValue).not.toBe(byId(before, "airfare").effectiveSellingValue);
  });

  it.each([
    ["empty component list", input({ components: [] }), "COMPONENT_PRICING_COMPONENTS_EMPTY"],
    ["zero total cost", input({ components: [component("zero", "0")] }), "COMPONENT_PRICING_TOTAL_COST_NON_POSITIVE"],
    ["inconsistent currencies", input({ components: [component("usd", "1", "snapshot-usd", "USD"), component("crc", "1", "snapshot-crc", "CRC")] }), "COMPONENT_PRICING_CURRENCY_INCONSISTENT"],
  ])("rejects %s", (_label, value, code) => {
    expect(() => calculateComponentSellingPrices(value)).toThrow(ComponentSellingPriceCalculationError);
    expect(() => calculateComponentSellingPrices(value)).toThrow(code);
  });

  it("preserves existing Pricing-domain validation for invalid values and denominator", () => {
    expect(() => calculateComponentSellingPrices(input({ operationalCostsAmount: "-1" }))).toThrow("PRICING_INPUT_NEGATIVE");
    expect(() => calculateComponentSellingPrices(input({ targetProfitMarginPercent: "100" }))).toThrow(PricingCalculationError);
    expect(() => calculateComponentSellingPrices(input({ targetProfitMarginPercent: "100" }))).toThrow("PRICING_INVALID_DENOMINATOR");
    expect(() => calculateComponentSellingPrices(input({ components: [component("bad", "not-money")] }))).toThrow("PRICING_DECIMAL_INVALID");
  });
});

function configuration(overrides: Partial<ComponentSellingPriceCalculatorInput> = {}) {
  return {
    operationalCostsAmount: overrides.operationalCostsAmount ?? "0",
    riskMarginPercent: overrides.riskMarginPercent ?? "0",
    targetProfitMarginPercent: overrides.targetProfitMarginPercent ?? "0",
    salesCommissionPercent: overrides.salesCommissionPercent ?? "0",
    bankCommissionPercent: overrides.bankCommissionPercent ?? "0",
    applicableTaxPercent: overrides.applicableTaxPercent ?? "0",
  };
}

function input(overrides: Partial<ComponentSellingPriceCalculatorInput> = {}): ComponentSellingPriceCalculatorInput {
  return {
    components: overrides.components ?? [component("airfare", "100")],
    ...configuration(overrides),
    commercialFloorPrice: overrides.commercialFloorPrice,
  };
}

function component(costComponentId: string, costAmount: string, costSnapshotId = `snapshot-${costComponentId}`, currency = "USD") {
  return { costComponentId, costSnapshotId, costAmount, currency };
}

function byId(result: ReturnType<typeof calculateComponentSellingPrices>, id: string) {
  const line = result.components.find((component) => component.costComponentId === id);
  if (!line) throw new Error(`Missing component ${id}`);
  return line;
}

function sum(amounts: string[]): string {
  const total = amounts.reduce((sum, amount) => sum + BigInt(decimalToScaled(amount)), 0n);
  return scaledToDecimal(total);
}

function decimalToScaled(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(`${whole}${fraction.padEnd(5, "0")}`);
}

function scaledToDecimal(value: bigint): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(6, "0");
  const whole = digits.slice(0, -5);
  const fraction = digits.slice(-5).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
