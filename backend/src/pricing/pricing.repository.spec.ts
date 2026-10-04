import { ConflictException, NotFoundException } from "@nestjs/common";
import { calculateComponentSellingPrices } from "./component-selling-price-calculator";
import { PricingRepository } from "./pricing.repository";
import { calculatePricingV1 } from "./pricing-v1-calculator";

describe("PricingRepository", () => {
  const actor = { userId: "admin-a", name: "Admin A" };
  let tx: Record<string, any>;
  let currentCosts: { read: jest.Mock };
  let repository: PricingRepository;

  beforeEach(() => {
    tx = {
      $executeRaw: jest.fn(),
      $queryRaw: jest.fn(),
      pricingConfiguration: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
      pricingCalculationVersion: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
      pricingCalculationComponentLine: { findMany: jest.fn() },
      costComponent: { findMany: jest.fn() },
    };
    currentCosts = { read: jest.fn().mockResolvedValue({ costingProjectId: "project-a", baseCurrency: "USD", authoritativeTotalCost: "100" }) };
    const database = { $transaction: jest.fn((work: (value: typeof tx) => Promise<unknown>) => work(tx)) };
    repository = new PricingRepository(database as never, currentCosts as never);
  });

  it("returns an existing configuration idempotently with one tenant-scoped read", async () => {
    tx.pricingConfiguration.findFirst.mockResolvedValue({ id: "configuration-a" });

    const result = await repository.resolveConfiguration("tenant-a", "project-a", actor);

    expect(currentCosts.read).toHaveBeenCalledWith(tx, "tenant-a", "project-a");
    expect(tx.pricingConfiguration.create).not.toHaveBeenCalled();
    expect(result.configuration.id).toBe("configuration-a");
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("creates the zero-default configuration only when none exists", async () => {
    tx.pricingConfiguration.findFirst.mockResolvedValue(null);
    tx.pricingConfiguration.create.mockResolvedValue({ id: "configuration-a", operationalCostsAmount: "0" });

    await repository.resolveConfiguration("tenant-a", "project-a", actor);

    expect(tx.pricingConfiguration.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: "tenant-a",
        costingProjectId: "project-a",
        operationalCostsAmount: "0",
        targetProfitMarginPercent: "0",
      }),
    }));
  });

  it("snapshots trusted policy inputs exactly once without overwriting an existing configuration", async () => {
    const policySnapshot = {
      operationalCostsAmount: "12.34567", riskMarginPercent: "1.250000", targetProfitMarginPercent: "20.000000",
      salesCommissionPercent: "3.500000", bankCommissionPercent: "2.000000", applicableTaxPercent: "13.000000",
    };
    tx.pricingConfiguration.findFirst.mockResolvedValueOnce(null);
    tx.pricingConfiguration.create.mockResolvedValue({ id: "configuration-a", ...policySnapshot });
    await repository.resolveConfigurationFromSnapshot("tenant-a", "project-a", policySnapshot, actor);
    expect(tx.pricingConfiguration.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining(policySnapshot) }));

    tx.pricingConfiguration.findFirst.mockResolvedValueOnce({ id: "configuration-a", operationalCostsAmount: "12.34567" });
    await repository.resolveConfigurationFromSnapshot("tenant-a", "project-a", { ...policySnapshot, operationalCostsAmount: "99.00000" }, actor);
    expect(tx.pricingConfiguration.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a cross-tenant project before configuration access", async () => {
    currentCosts.read.mockRejectedValue(new NotFoundException("Costing project not found."));

    await expect(repository.resolveConfiguration("tenant-b", "project-a", actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.pricingConfiguration.findFirst).not.toHaveBeenCalled();
  });

  it("reads paginated version history with one current-cost read, one page query, and one count", async () => {
    tx.pricingCalculationVersion.findMany.mockResolvedValue([]);
    tx.pricingCalculationVersion.count.mockResolvedValue(0);

    await repository.listCalculations("tenant-a", "project-a", 1, 20);

    expect(currentCosts.read).toHaveBeenCalledTimes(1);
    expect(tx.pricingCalculationVersion.findMany).toHaveBeenCalledTimes(1);
    expect(tx.pricingCalculationVersion.count).toHaveBeenCalledTimes(1);
    expect(tx.pricingCalculationVersion.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: "tenant-a", costingProjectId: "project-a" },
      take: 20,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }));
  });

  it("atomically persists the exact current component snapshot decomposition with a new calculation version", async () => {
    const components = currentComponents();
    tx.$queryRaw.mockResolvedValue([{ id: "configuration-a" }]);
    tx.pricingConfiguration.findFirst
      .mockResolvedValueOnce(pricingConfiguration())
      .mockResolvedValueOnce(null);
    tx.costComponent.findMany.mockResolvedValue(components);
    tx.pricingCalculationVersion.create.mockResolvedValue({ id: "version-a" });
    const calculation = calculatePricingV1({ authoritativeCostAmount: "100", ...pricingConfiguration() });
    const expectedBreakdown = calculateComponentSellingPrices({
      components: components.map((component) => ({
        costComponentId: component.id,
        costSnapshotId: component.currentSnapshot.id,
        costAmount: component.currentSnapshot.amount,
        currency: component.currentSnapshot.currency,
      })),
      ...pricingConfiguration(),
    });

    await repository.createDraftCalculation("tenant-a", "project-a", actor, () => calculation);

    expect(tx.costComponent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: "tenant-a", costingProjectId: "project-a", status: "ACTIVE", currentSnapshotId: { not: null } }),
      select: expect.objectContaining({ costCategory: expect.any(Object), currentSnapshot: expect.any(Object) }),
    }));
    expect(tx.pricingCalculationVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: "tenant-a",
        authoritativeCostAmount: calculation.authoritativeCostAmount,
        componentLines: {
          create: expect.arrayContaining([
            expect.objectContaining({
              costComponentId: "component-airfare", costSnapshotId: "snapshot-airfare-a",
              costCategoryCode: "AIRFARE", componentTitle: "Vuelo internacional",
              baseCost: "40", allocatedOperationalExpense: "4", effectiveSellingValue: expect.any(String),
            }),
            expect.objectContaining({
              costComponentId: "component-hotel", costSnapshotId: "snapshot-hotel-a",
              costCategoryCode: "LODGING", componentTitle: "Hotel", baseCost: "60", allocatedOperationalExpense: "6",
            }),
          ]),
        },
      }),
    }));

    components[0].currentSnapshot.amount = "99";
    const lines = tx.pricingCalculationVersion.create.mock.calls[0][0].data.componentLines.create;
    expect(lines.find((line: any) => line.costComponentId === "component-airfare").baseCost).toBe("40");
    for (const expected of expectedBreakdown.components) {
      expect(lines.find((line: any) => line.costComponentId === expected.costComponentId)).toEqual(expect.objectContaining(persistedCalculatorFields(expected)));
    }
    expect(sum(lines.map((line: any) => line.baseCost))).toBe("100");
    expect(sum(lines.map((line: any) => line.allocatedOperationalExpense))).toBe("10");
    expect(sum(lines.map((line: any) => line.effectiveSellingValue))).toBe(calculation.finalSellingPrice);
  });

  it("rejects the whole calculation before version creation when current component snapshots do not reconcile", async () => {
    tx.$queryRaw.mockResolvedValue([{ id: "configuration-a" }]);
    tx.pricingConfiguration.findFirst.mockResolvedValue(pricingConfiguration());
    tx.costComponent.findMany.mockResolvedValue(currentComponents());
    currentCosts.read.mockResolvedValue({ costingProjectId: "project-a", baseCurrency: "USD", authoritativeTotalCost: "101" });
    const calculation = calculatePricingV1({ authoritativeCostAmount: "101", ...pricingConfiguration() });

    await expect(repository.createDraftCalculation("tenant-a", "project-a", actor, () => calculation)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.pricingCalculationVersion.create).not.toHaveBeenCalled();
  });

  it("uses the same component-line creation boundary when an automatic Pricing draft is eligible", async () => {
    tx.$queryRaw.mockResolvedValue([{ id: "configuration-a" }]);
    tx.pricingConfiguration.findFirst
      .mockResolvedValueOnce(pricingConfiguration())
      .mockResolvedValueOnce(null);
    tx.costComponent.findMany.mockResolvedValue(currentComponents());
    tx.pricingCalculationVersion.create.mockResolvedValue({ id: "automatic-version" });
    const calculation = calculatePricingV1({ authoritativeCostAmount: "100", ...pricingConfiguration() });

    await repository.createDraftCalculation("tenant-a", "project-a", actor, () => calculation, { persistWhen: () => true });

    expect(tx.pricingCalculationVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ componentLines: { create: expect.arrayContaining([expect.objectContaining({ costSnapshotId: "snapshot-airfare-a" })]) } }),
    }));
  });

  it("persists raw 900 at the 1000 commercial floor with 100 of reconciling component retention", async () => {
    const components = [
      {
        id: "component-airfare", title: "Vuelo internacional",
        costCategory: { code: "AIRFARE", displayName: "Vuelo" },
        currentSnapshot: { id: "snapshot-airfare-b", amount: "400", currency: "USD" },
      },
      {
        id: "component-hotel", title: "Hotel",
        costCategory: { code: "LODGING", displayName: "Alojamiento" },
        currentSnapshot: { id: "snapshot-hotel-b", amount: "500", currency: "USD" },
      },
    ];
    const configuration = pricingConfiguration({
      operationalCostsAmount: "0", riskMarginPercent: "0", targetProfitMarginPercent: "0",
      salesCommissionPercent: "0", bankCommissionPercent: "0", applicableTaxPercent: "0",
    });
    tx.$queryRaw.mockResolvedValue([{ id: "configuration-a" }]);
    tx.pricingConfiguration.findFirst
      .mockResolvedValueOnce(configuration)
      .mockResolvedValueOnce(null);
    tx.costComponent.findMany.mockResolvedValue(components);
    tx.pricingCalculationVersion.create.mockResolvedValue({ id: "floor-version" });
    currentCosts.read.mockResolvedValue({ costingProjectId: "project-a", baseCurrency: "USD", authoritativeTotalCost: "900" });
    const rawCalculation = calculatePricingV1({ authoritativeCostAmount: "900", ...configuration });
    const expected = calculateComponentSellingPrices({
      components: components.map((component) => ({
        costComponentId: component.id,
        costSnapshotId: component.currentSnapshot.id,
        costAmount: component.currentSnapshot.amount,
        currency: component.currentSnapshot.currency,
      })),
      ...configuration,
      commercialFloorPrice: "1000",
    });

    await repository.createDraftCalculation("tenant-a", "project-a", actor, () => rawCalculation, { commercialFloorPrice: "1000" });

    const data = tx.pricingCalculationVersion.create.mock.calls[0][0].data;
    expect(rawCalculation.finalSellingPrice).toBe("900");
    expect(expected.publishedPriceRetention).toBe("100");
    expect(data.finalSellingPrice).toBe(expected.effectiveFinalSellingPrice);
    expect(data.finalSellingPrice).not.toBe(rawCalculation.finalSellingPrice);
    expect(sum(data.componentLines.create.map((line: any) => line.allocatedPublishedPriceRetention))).toBe(expected.publishedPriceRetention);
    expect(sum(data.componentLines.create.map((line: any) => line.effectiveSellingValue))).toBe(expected.effectiveFinalSellingPrice);
  });

  it("does not leave a partial version when the nested component-line write fails", async () => {
    tx.$queryRaw.mockResolvedValue([{ id: "configuration-a" }]);
    tx.pricingConfiguration.findFirst
      .mockResolvedValueOnce(pricingConfiguration())
      .mockResolvedValueOnce(null);
    tx.costComponent.findMany.mockResolvedValue(currentComponents());
    tx.pricingCalculationVersion.create.mockRejectedValue(new Error("component line persistence failed"));
    const calculation = calculatePricingV1({ authoritativeCostAmount: "100", ...pricingConfiguration() });

    await expect(repository.createDraftCalculation("tenant-a", "project-a", actor, () => calculation)).rejects.toThrow("component line persistence failed");
    expect(tx.pricingCalculationComponentLine.findMany).not.toHaveBeenCalled();
  });

  it("keeps legacy versions without component lines readable through the internal Pricing boundary", async () => {
    tx.pricingCalculationVersion.findFirst.mockResolvedValue({ id: "legacy-version" });
    tx.pricingCalculationComponentLine.findMany.mockResolvedValue([]);

    await expect(repository.findCalculationComponentLines("tenant-a", "legacy-version")).resolves.toEqual([]);
    expect(tx.pricingCalculationComponentLine.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", pricingCalculationVersionId: "legacy-version" },
      orderBy: { costComponentId: "asc" },
    });
  });

  it("approves only a locked draft version and records approval metadata", async () => {
    tx.$queryRaw.mockResolvedValue([{ id: "version-a" }]);
    tx.pricingCalculationVersion.findFirst
      .mockResolvedValueOnce({ id: "version-a", costingProjectId: "project-a", status: "DRAFT" })
      .mockResolvedValueOnce({ id: "version-a", costingProjectId: "project-a", status: "APPROVED" });
    tx.pricingCalculationVersion.updateMany.mockResolvedValue({ count: 1 });
    const assertNotStale = jest.fn();

    await repository.approveCalculation("tenant-a", "version-a", actor, assertNotStale);

    expect(currentCosts.read).toHaveBeenCalledWith(tx, "tenant-a", "project-a");
    expect(assertNotStale).toHaveBeenCalledTimes(1);
    expect(tx.pricingCalculationVersion.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "version-a", tenantId: "tenant-a", status: "DRAFT" },
      data: expect.objectContaining({
        status: "APPROVED",
        approvedByUserId: actor.userId,
        approvedByName: actor.name,
        approvedAt: expect.any(Date),
      }),
    }));
  });

  it("does not re-approve an approved version", async () => {
    tx.$queryRaw.mockResolvedValue([{ id: "version-a" }]);
    tx.pricingCalculationVersion.findFirst.mockResolvedValue({ id: "version-a", costingProjectId: "project-a", status: "APPROVED" });

    await expect(repository.approveCalculation("tenant-a", "version-a", actor, jest.fn())).rejects.toBeInstanceOf(ConflictException);
    expect(tx.pricingCalculationVersion.updateMany).not.toHaveBeenCalled();
  });
});

function pricingConfiguration(overrides: Record<string, string> = {}) {
  return {
    id: "configuration-a",
    operationalCostsAmount: "10",
    riskMarginPercent: "1",
    targetProfitMarginPercent: "10",
    salesCommissionPercent: "2",
    bankCommissionPercent: "1",
    applicableTaxPercent: "13",
    ...overrides,
  };
}

function currentComponents() {
  return [
    {
      id: "component-airfare",
      title: "Vuelo internacional",
      costCategory: { code: "AIRFARE", displayName: "Vuelo" },
      currentSnapshot: { id: "snapshot-airfare-a", amount: "40", currency: "USD" },
    },
    {
      id: "component-hotel",
      title: "Hotel",
      costCategory: { code: "LODGING", displayName: "Alojamiento" },
      currentSnapshot: { id: "snapshot-hotel-a", amount: "60", currency: "USD" },
    },
  ];
}

function sum(values: string[]): string {
  const total = values.reduce((result, value) => result + BigInt(toScaled(value)), 0n);
  const negative = total < 0n;
  const digits = (negative ? -total : total).toString().padStart(6, "0");
  const whole = digits.slice(0, -5);
  const fraction = digits.slice(-5).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function toScaled(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  return `${whole}${fraction.padEnd(5, "0")}`;
}

function persistedCalculatorFields(line: ReturnType<typeof calculateComponentSellingPrices>["components"][number]) {
  return {
    costComponentId: line.costComponentId,
    costSnapshotId: line.costSnapshotId,
    weight: line.weight,
    baseCost: line.baseCost,
    allocatedOperationalExpense: line.allocatedOperationalExpense,
    risk: line.risk,
    adjustedEconomicCost: line.adjustedEconomicCost,
    preTaxSellingPrice: line.preTaxSellingPrice,
    targetProfit: line.targetProfit,
    salesCommission: line.salesCommission,
    bankCommission: line.bankCommission,
    tax: line.tax,
    rawSellingValue: line.rawSellingValue,
    allocatedPublishedPriceRetention: line.allocatedPublishedPriceRetention,
    roundingAdjustment: line.roundingAdjustment,
    effectiveSellingValue: line.effectiveSellingValue,
  };
}
