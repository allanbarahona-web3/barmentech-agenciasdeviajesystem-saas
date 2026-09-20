import {
  calculatePricingV1,
  PRICING_V1,
  PricingCalculationError,
  PRICING_V1_BASES,
} from "./pricing-v1-calculator";

describe("calculatePricingV1", () => {
  it("solves a true target profit margin rather than a markup", () => {
    const result = calculatePricingV1(input({
      authoritativeCostAmount: "100",
      targetProfitMarginPercent: "20",
    }));

    expect(result).toMatchObject({
      policyVersion: PRICING_V1,
      ...PRICING_V1_BASES,
      baseCostAmount: "100",
      adjustedEconomicCostAmount: "100",
      preTaxSellingPrice: "125",
      targetProfitAmount: "25",
      estimatedAgencyProfitBeforeIncomeTax: "25",
      finalSellingPrice: "125",
    });
  });

  it("calculates sales commission from the pre-tax selling price", () => {
    const result = calculatePricingV1(input({
      authoritativeCostAmount: "70",
      targetProfitMarginPercent: "20",
      salesCommissionPercent: "10",
    }));

    expect(result.preTaxSellingPrice).toBe("100");
    expect(result.salesCommissionAmount).toBe("10");
  });

  it("calculates bank commission from the final charged price", () => {
    const result = calculatePricingV1(input({
      authoritativeCostAmount: "69",
      targetProfitMarginPercent: "20",
      bankCommissionPercent: "10",
      applicableTaxPercent: "10",
    }));

    expect(result.preTaxSellingPrice).toBe("100");
    expect(result.taxAmount).toBe("10");
    expect(result.finalSellingPrice).toBe("110");
    expect(result.bankCommissionAmount).toBe("11");
  });

  it("calculates tax from the pre-tax selling price", () => {
    const result = calculatePricingV1(input({
      authoritativeCostAmount: "80",
      targetProfitMarginPercent: "20",
      applicableTaxPercent: "13",
    }));

    expect(result.preTaxSellingPrice).toBe("100");
    expect(result.taxAmount).toBe("13");
    expect(result.finalSellingPrice).toBe("113");
  });

  it("calculates risk from authoritative plus operational cost", () => {
    const result = calculatePricingV1(input({
      authoritativeCostAmount: "100",
      operationalCostsAmount: "50",
      riskMarginPercent: "10",
    }));

    expect(result.baseCostAmount).toBe("150");
    expect(result.riskAmount).toBe("15");
    expect(result.adjustedEconomicCostAmount).toBe("165");
  });

  it("solves the combined PRICING_V1 bases with exact five-decimal outputs", () => {
    const result = calculatePricingV1(input({
      authoritativeCostAmount: "1000",
      riskMarginPercent: "1",
      targetProfitMarginPercent: "15",
      salesCommissionPercent: "2.5",
      bankCommissionPercent: "2.5",
      applicableTaxPercent: "13",
    }));

    expect(result).toMatchObject({
      baseCostAmount: "1000",
      riskAmount: "10",
      adjustedEconomicCostAmount: "1010",
      preTaxSellingPrice: "1267.64983",
      targetProfitAmount: "190.14747",
      salesCommissionAmount: "31.69125",
      taxAmount: "164.79448",
      finalSellingPrice: "1432.4443",
      bankCommissionAmount: "35.81111",
      estimatedAgencyProfitBeforeIncomeTax: "190.14747",
    });
  });

  it("keeps fractional decimal inputs exact without floating-point drift", () => {
    const result = calculatePricingV1(input({
      authoritativeCostAmount: "0.1",
      operationalCostsAmount: "0.2",
      riskMarginPercent: "0.3",
    }));

    expect(result.baseCostAmount).toBe("0.3");
    expect(result.riskAmount).toBe("0.0009");
    expect(result.adjustedEconomicCostAmount).toBe("0.3009");
    expect(result.preTaxSellingPrice).toBe("0.3009");
  });

  it("quantizes final monetary outputs to five decimals using round-half-up", () => {
    const result = calculatePricingV1(input({
      authoritativeCostAmount: "1",
      riskMarginPercent: "0.0005",
    }));

    expect(result.riskAmount).toBe("0.00001");
    expect(result.adjustedEconomicCostAmount).toBe("1.00001");
  });

  it.each([
    [input({ authoritativeCostAmount: "-1" }), "PRICING_INPUT_NEGATIVE"],
    [input({ salesCommissionPercent: "100.000001" }), "PRICING_PERCENTAGE_OUT_OF_RANGE"],
    [input({ targetProfitMarginPercent: "100" }), "PRICING_INVALID_DENOMINATOR"],
  ])("rejects invalid pricing input with a deterministic domain error", (value, code) => {
    expect(() => calculatePricingV1(value)).toThrow(PricingCalculationError);
    expect(() => calculatePricingV1(value)).toThrow(code);
  });
});

function input(overrides: Partial<Parameters<typeof calculatePricingV1>[0]> = {}) {
  return {
    authoritativeCostAmount: "0",
    operationalCostsAmount: "0",
    riskMarginPercent: "0",
    targetProfitMarginPercent: "0",
    salesCommissionPercent: "0",
    bankCommissionPercent: "0",
    applicableTaxPercent: "0",
    ...overrides,
  };
}
