import {
  addPricingDecimals,
  calculatePricingV1,
  comparePricingDecimals,
  dividePricingDecimals,
  formatPricingAmount,
  formatPricingDecimal,
  multiplyPricingDecimals,
  parsePricingAmount,
  PRICING_INTERNAL_SCALE,
  quantizePricingAmount,
  subtractPricingDecimals,
  type PricingDecimal,
  type PricingV1ConfigurationInput,
} from "./pricing-v1-calculator";

export type ComponentSellingPriceCalculatorComponent = {
  costComponentId: string;
  costSnapshotId: string;
  costAmount: string;
  currency: string;
};

export type ComponentSellingPriceCalculatorInput = PricingV1ConfigurationInput & {
  components: readonly ComponentSellingPriceCalculatorComponent[];
  commercialFloorPrice?: string | null;
};

export type ComponentSellingPriceCalculationErrorCode =
  | "COMPONENT_PRICING_COMPONENTS_EMPTY"
  | "COMPONENT_PRICING_COMPONENT_ID_INVALID"
  | "COMPONENT_PRICING_COST_SNAPSHOT_ID_INVALID"
  | "COMPONENT_PRICING_COMPONENT_ID_DUPLICATE"
  | "COMPONENT_PRICING_CURRENCY_INVALID"
  | "COMPONENT_PRICING_CURRENCY_INCONSISTENT"
  | "COMPONENT_PRICING_TOTAL_COST_NON_POSITIVE"
  | "COMPONENT_PRICING_ALLOCATION_NEGATIVE"
  | "COMPONENT_PRICING_RECONCILIATION_FAILED";

export class ComponentSellingPriceCalculationError extends Error {
  constructor(readonly code: ComponentSellingPriceCalculationErrorCode) {
    super(code);
    this.name = "ComponentSellingPriceCalculationError";
  }
}

export type ComponentSellingPriceComponentResult = {
  costComponentId: string;
  costSnapshotId: string;
  baseCost: string;
  weight: string;
  allocatedOperationalExpense: string;
  baseCostWithOperationalExpense: string;
  risk: string;
  adjustedEconomicCost: string;
  preTaxSellingPrice: string;
  targetProfit: string;
  salesCommission: string;
  bankCommission: string;
  tax: string;
  rawFormulaSellingValue: string;
  rawSellingValue: string;
  allocatedPublishedPriceRetention: string;
  roundingAdjustment: string;
  effectiveSellingValue: string;
};

export type ComponentSellingPriceCalculation = {
  currency: string;
  totalComponentCost: string;
  operationalCostsAmount: string;
  rawFinalSellingPrice: string;
  commercialFloorPrice: string | null;
  publishedPriceRetention: string;
  effectiveFinalSellingPrice: string;
  totalRoundingAdjustment: string;
  components: ComponentSellingPriceComponentResult[];
};

type ParsedComponent = {
  costComponentId: string;
  costSnapshotId: string;
  cost: PricingDecimal;
};

type Allocation = {
  costComponentId: string;
  amount: PricingDecimal;
};

const ZERO = parsePricingAmount("0");

/**
 * Pure Pricing-domain decomposition of PRICING_V1. It deliberately has no
 * persistence, Cost Engine, Contract, TravelPackage, or Operations dependency.
 */
export function calculateComponentSellingPrices(
  input: ComponentSellingPriceCalculatorInput,
): ComponentSellingPriceCalculation {
  const { components, currency, totalComponentCost } = parseComponents(input.components);
  const aggregate = calculatePricingV1({
    authoritativeCostAmount: formatPricingAmount(totalComponentCost),
    ...pricingConfiguration(input),
  });
  const operationalCosts = parsePricingAmount(input.operationalCostsAmount);
  const operationalAllocations = allocateByCostWeight(
    operationalCosts,
    components,
    totalComponentCost,
  );

  const provisional = components.map((component) => {
    const allocatedOperationalExpense = allocationFor(
      operationalAllocations,
      component.costComponentId,
    );
    const calculation = calculatePricingV1({
      authoritativeCostAmount: formatPricingAmount(component.cost),
      ...pricingConfiguration(input),
      operationalCostsAmount: formatPricingAmount(allocatedOperationalExpense),
    });
    return { component, allocatedOperationalExpense, calculation };
  });

  const rawFinalSellingPrice = parsePricingAmount(aggregate.finalSellingPrice);
  const rawFormulaTotal = sum(
    provisional.map((line) => parsePricingAmount(line.calculation.finalSellingPrice)),
  );
  const rawReconciliationAdjustment = subtractPricingDecimals(
    rawFinalSellingPrice,
    rawFormulaTotal,
  );
  const roundingRecipientId = remainderRecipient(components).costComponentId;

  const commercialFloorPrice = input.commercialFloorPrice === undefined || input.commercialFloorPrice === null
    ? null
    : parsePricingAmount(input.commercialFloorPrice);
  const publishedPriceRetention = commercialFloorPrice !== null &&
    comparePricingDecimals(rawFinalSellingPrice, commercialFloorPrice) < 0
    ? subtractPricingDecimals(commercialFloorPrice, rawFinalSellingPrice)
    : ZERO;
  const effectiveFinalSellingPrice = commercialFloorPrice !== null &&
    comparePricingDecimals(rawFinalSellingPrice, commercialFloorPrice) < 0
    ? commercialFloorPrice
    : rawFinalSellingPrice;
  const retentionAllocations = allocateByCostWeight(
    publishedPriceRetention,
    components,
    totalComponentCost,
  );

  const results = provisional.map((line) => {
    const formulaRawSellingValue = parsePricingAmount(line.calculation.finalSellingPrice);
    const roundingAdjustment = line.component.costComponentId === roundingRecipientId
      ? rawReconciliationAdjustment
      : ZERO;
    // rawSellingValue includes the explicit line reconciliation adjustment so
    // component raw values always reconcile to the existing aggregate engine.
    const rawSellingValue = addPricingDecimals(formulaRawSellingValue, roundingAdjustment);
    const allocatedPublishedPriceRetention = allocationFor(
      retentionAllocations,
      line.component.costComponentId,
    );
    const effectiveSellingValue = addPricingDecimals(
      rawSellingValue,
      allocatedPublishedPriceRetention,
    );
    return {
      costComponentId: line.component.costComponentId,
      costSnapshotId: line.component.costSnapshotId,
      baseCost: formatPricingAmount(line.component.cost),
      weight: formatPricingDecimal(
        dividePricingDecimals(line.component.cost, totalComponentCost, PRICING_INTERNAL_SCALE),
      ),
      allocatedOperationalExpense: formatPricingAmount(line.allocatedOperationalExpense),
      baseCostWithOperationalExpense: line.calculation.baseCostAmount,
      risk: line.calculation.riskAmount,
      adjustedEconomicCost: line.calculation.adjustedEconomicCostAmount,
      preTaxSellingPrice: line.calculation.preTaxSellingPrice,
      targetProfit: line.calculation.targetProfitAmount,
      salesCommission: line.calculation.salesCommissionAmount,
      bankCommission: line.calculation.bankCommissionAmount,
      tax: line.calculation.taxAmount,
      rawFormulaSellingValue: line.calculation.finalSellingPrice,
      rawSellingValue: formatPricingAmount(rawSellingValue),
      allocatedPublishedPriceRetention: formatPricingAmount(allocatedPublishedPriceRetention),
      roundingAdjustment: formatPricingAmount(roundingAdjustment),
      effectiveSellingValue: formatPricingAmount(effectiveSellingValue),
    };
  });

  assertReconciliation("base-cost", sum(results.map((line) => parsePricingAmount(line.baseCost))), totalComponentCost);
  assertReconciliation(
    "operational-cost",
    sum(results.map((line) => parsePricingAmount(line.allocatedOperationalExpense))),
    operationalCosts,
  );
  assertReconciliation(
    "raw-selling",
    sum(results.map((line) => parsePricingAmount(line.rawSellingValue))),
    rawFinalSellingPrice,
  );
  assertReconciliation(
    "retention",
    sum(results.map((line) => parsePricingAmount(line.allocatedPublishedPriceRetention))),
    publishedPriceRetention,
  );
  assertReconciliation(
    "effective-selling",
    sum(results.map((line) => parsePricingAmount(line.effectiveSellingValue))),
    effectiveFinalSellingPrice,
  );

  return {
    currency,
    totalComponentCost: formatPricingAmount(totalComponentCost),
    operationalCostsAmount: formatPricingAmount(operationalCosts),
    rawFinalSellingPrice: formatPricingAmount(rawFinalSellingPrice),
    commercialFloorPrice: commercialFloorPrice === null ? null : formatPricingAmount(commercialFloorPrice),
    publishedPriceRetention: formatPricingAmount(publishedPriceRetention),
    effectiveFinalSellingPrice: formatPricingAmount(effectiveFinalSellingPrice),
    totalRoundingAdjustment: formatPricingAmount(rawReconciliationAdjustment),
    components: results,
  };
}

function parseComponents(input: readonly ComponentSellingPriceCalculatorComponent[]) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new ComponentSellingPriceCalculationError("COMPONENT_PRICING_COMPONENTS_EMPTY");
  }

  const ids = new Set<string>();
  const parsed = input.map((component) => {
    const costComponentId = requiredIdentifier(
      component.costComponentId,
      "COMPONENT_PRICING_COMPONENT_ID_INVALID",
    );
    if (ids.has(costComponentId)) {
      throw new ComponentSellingPriceCalculationError("COMPONENT_PRICING_COMPONENT_ID_DUPLICATE");
    }
    ids.add(costComponentId);
    return {
      costComponentId,
      costSnapshotId: requiredIdentifier(
        component.costSnapshotId,
        "COMPONENT_PRICING_COST_SNAPSHOT_ID_INVALID",
      ),
      cost: parsePricingAmount(component.costAmount),
      currency: normalizeCurrency(component.currency),
    };
  }).sort((left, right) => left.costComponentId.localeCompare(right.costComponentId));

  const currency = parsed[0].currency;
  if (parsed.some((component) => component.currency !== currency)) {
    throw new ComponentSellingPriceCalculationError("COMPONENT_PRICING_CURRENCY_INCONSISTENT");
  }
  const components: ParsedComponent[] = parsed.map(({ currency: _currency, ...component }) => component);
  const totalComponentCost = sum(components.map((component) => component.cost));
  if (comparePricingDecimals(totalComponentCost, ZERO) <= 0) {
    throw new ComponentSellingPriceCalculationError("COMPONENT_PRICING_TOTAL_COST_NON_POSITIVE");
  }
  return { components, currency, totalComponentCost };
}

function pricingConfiguration(input: ComponentSellingPriceCalculatorInput): PricingV1ConfigurationInput {
  return {
    operationalCostsAmount: input.operationalCostsAmount,
    riskMarginPercent: input.riskMarginPercent,
    targetProfitMarginPercent: input.targetProfitMarginPercent,
    salesCommissionPercent: input.salesCommissionPercent,
    bankCommissionPercent: input.bankCommissionPercent,
    applicableTaxPercent: input.applicableTaxPercent,
  };
}

function allocateByCostWeight(
  total: PricingDecimal,
  components: ParsedComponent[],
  totalComponentCost: PricingDecimal,
): Allocation[] {
  const allocations = components.map((component) => ({
    costComponentId: component.costComponentId,
    amount: quantizePricingAmount(multiplyPricingDecimals(
      total,
      dividePricingDecimals(component.cost, totalComponentCost, PRICING_INTERNAL_SCALE),
    )),
  }));
  const recipient = remainderRecipient(components);
  const residual = subtractPricingDecimals(total, sum(allocations.map((allocation) => allocation.amount)));
  const recipientAllocation = allocations.find((allocation) => allocation.costComponentId === recipient.costComponentId);
  if (!recipientAllocation) throw new ComponentSellingPriceCalculationError("COMPONENT_PRICING_RECONCILIATION_FAILED");
  recipientAllocation.amount = addPricingDecimals(recipientAllocation.amount, residual);
  if (comparePricingDecimals(recipientAllocation.amount, ZERO) < 0) {
    throw new ComponentSellingPriceCalculationError("COMPONENT_PRICING_ALLOCATION_NEGATIVE");
  }
  assertReconciliation("allocation", sum(allocations.map((allocation) => allocation.amount)), total);
  return allocations;
}

function remainderRecipient(components: ParsedComponent[]): ParsedComponent {
  return [...components].sort((left, right) => {
    const costComparison = comparePricingDecimals(right.cost, left.cost);
    return costComparison !== 0 ? costComparison : left.costComponentId.localeCompare(right.costComponentId);
  })[0];
}

function allocationFor(allocations: Allocation[], costComponentId: string): PricingDecimal {
  const allocation = allocations.find((candidate) => candidate.costComponentId === costComponentId);
  if (!allocation) throw new ComponentSellingPriceCalculationError("COMPONENT_PRICING_RECONCILIATION_FAILED");
  return allocation.amount;
}

function sum(values: PricingDecimal[]): PricingDecimal {
  return values.reduce((total, value) => addPricingDecimals(total, value), ZERO);
}

function assertReconciliation(
  _name: string,
  actual: PricingDecimal,
  expected: PricingDecimal,
): void {
  if (comparePricingDecimals(actual, expected) !== 0) {
    throw new ComponentSellingPriceCalculationError("COMPONENT_PRICING_RECONCILIATION_FAILED");
  }
}

function requiredIdentifier(
  value: unknown,
  code: "COMPONENT_PRICING_COMPONENT_ID_INVALID" | "COMPONENT_PRICING_COST_SNAPSHOT_ID_INVALID",
): string {
  const normalized = String(value || "").trim();
  if (!normalized) throw new ComponentSellingPriceCalculationError(code);
  return normalized;
}

function normalizeCurrency(value: unknown): string {
  const normalized = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new ComponentSellingPriceCalculationError("COMPONENT_PRICING_CURRENCY_INVALID");
  }
  return normalized;
}
