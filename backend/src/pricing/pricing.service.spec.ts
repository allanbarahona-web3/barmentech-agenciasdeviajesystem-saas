import { ConflictException } from "@nestjs/common";
import { PricingService } from "./pricing.service";

describe("PricingService", () => {
  const actor = { userId: "admin-a", name: "Admin A" };
  let repository: Record<string, jest.Mock>;
  let service: PricingService;

  beforeEach(() => {
    repository = {
      resolveConfiguration: jest.fn(),
      getConfigurationContext: jest.fn(),
      updateConfiguration: jest.fn(),
      createDraftCalculation: jest.fn(),
      findCalculation: jest.fn(),
      findLatestCalculation: jest.fn(),
      listCalculations: jest.fn(),
      approveCalculation: jest.fn(),
    };
    service = new PricingService(repository as never);
  });

  it("resolves a lazy configuration in the authenticated tenant", async () => {
    repository.resolveConfiguration.mockResolvedValue({ configuration: configuration(), currentCost: currentCost() });

    const result = await service.resolveConfiguration("tenant-a", "project-a", actor);

    expect(repository.resolveConfiguration).toHaveBeenCalledWith("tenant-a", "project-a", actor);
    expect(result.currentAuthoritativeCost).toBe("1000");
    expect(result.currency).toBe("USD");
  });

  it("updates exact configuration values without calculating derived amounts", async () => {
    repository.getConfigurationContext.mockResolvedValue({ configuration: configuration(), currentCost: currentCost() });
    repository.updateConfiguration.mockResolvedValue(configuration({ operationalCostsAmount: "25.125", riskMarginPercent: "1.25" }));

    const result = await service.updateConfiguration("tenant-a", "project-a", {
      operationalCostsAmount: "25.125",
      riskMarginPercent: "1.25",
    }, actor);

    expect(repository.updateConfiguration).toHaveBeenCalledWith("tenant-a", "project-a", {
      operationalCostsAmount: "25.125",
      riskMarginPercent: "1.25",
    }, actor);
    expect(result.configuration.operationalCostsAmount).toBe("25.125");
  });

  it("uses the current Cost Engine total and persists a frozen version through the calculator callback", async () => {
    let persisted: Record<string, unknown> | undefined;
    repository.resolveConfiguration.mockResolvedValue({ configuration: configuration(), currentCost: currentCost() });
    repository.createDraftCalculation.mockImplementation(async (_tenant, _project, _actor, calculate) => {
      const calculation = calculate(configuration({ riskMarginPercent: "1", targetProfitMarginPercent: "15" }), currentCost());
      persisted = version({ ...calculation, id: "version-1", versionNumber: 1 });
      return persisted;
    });
    repository.findCalculation.mockImplementation(async () => ({ version: persisted, currentCost: currentCost() }));

    const result = await service.calculate("tenant-a", "project-a", actor);

    expect(result.versionNumber).toBe(1);
    expect(result.authoritativeCostAmount).toBe("1000");
    expect(result.currency).toBe("USD");
    expect(result.policyVersion).toBe("PRICING_V1");
    expect(result.riskBasis).toBe("BASE_COST");
    expect(result.preTaxSellingPrice).toBe("1188.23529");
  });

  it("creates a new immutable version for every recalculation", async () => {
    const versions: Array<Record<string, unknown>> = [];
    repository.resolveConfiguration.mockResolvedValue({ configuration: configuration(), currentCost: currentCost() });
    repository.createDraftCalculation.mockImplementation(async (_tenant, _project, _actor, calculate) => {
      const calculation = calculate(configuration({ targetProfitMarginPercent: "20" }), currentCost());
      const created = version({ ...calculation, id: `version-${versions.length + 1}`, versionNumber: versions.length + 1 });
      versions.push(created);
      return created;
    });
    repository.findCalculation.mockImplementation(async (_tenant, id) => ({
      version: versions.find((candidate) => candidate.id === id),
      currentCost: currentCost(),
    }));

    await service.calculate("tenant-a", "project-a", actor);
    await service.calculate("tenant-a", "project-a", actor);

    expect(versions.map((item) => item.versionNumber)).toEqual([1, 2]);
    expect(versions[0].id).toBe("version-1");
    expect(versions[0].preTaxSellingPrice).toBe("1250");
    expect(versions[1].id).toBe("version-2");
  });

  it("derives stale state with exact amounts rather than a mutable flag", async () => {
    repository.findCalculation.mockResolvedValue({ version: version({ authoritativeCostAmount: "100" }), currentCost: currentCost({ authoritativeTotalCost: "100.00000" }) });
    await expect(service.getCalculation("tenant-a", "version-a")).resolves.toMatchObject({ stale: false });

    repository.findCalculation.mockResolvedValue({ version: version({ authoritativeCostAmount: "100" }), currentCost: currentCost({ authoritativeTotalCost: "101" }) });
    await expect(service.getCalculation("tenant-a", "version-a")).resolves.toMatchObject({ stale: true });
  });

  it("approves only a non-stale draft and records the returned approval metadata", async () => {
    const approved = version({ status: "APPROVED", approvedAt: new Date("2026-09-19T20:00:00.000Z"), approvedByUserId: actor.userId, approvedByName: actor.name });
    repository.approveCalculation.mockImplementation(async (_tenant, _id, _actor, assertNotStale) => {
      assertNotStale(version({ authoritativeCostAmount: "1000" }), currentCost());
      return approved;
    });
    repository.findCalculation.mockResolvedValue({ version: approved, currentCost: currentCost() });

    const result = await service.approveCalculation("tenant-a", "version-a", actor);

    expect(result.status).toBe("APPROVED");
    expect(result.approvedBy).toEqual({ userId: actor.userId, name: actor.name });
  });

  it("rejects stale versions before approval", async () => {
    repository.approveCalculation.mockImplementation(async (_tenant, _id, _actor, assertNotStale) => {
      assertNotStale(version({ authoritativeCostAmount: "1000" }), currentCost({ authoritativeTotalCost: "1001" }));
    });

    await expect(service.approveCalculation("tenant-a", "version-a", actor)).rejects.toBeInstanceOf(ConflictException);
  });

  it("keeps history bounded, ordered by the repository, and evaluates stale once against one current total", async () => {
    repository.listCalculations.mockResolvedValue({
      versions: [version({ id: "version-2", versionNumber: 2 }), version({ id: "version-1", versionNumber: 1 })],
      total: 26,
      page: 1,
      pageSize: 25,
      currentCost: currentCost(),
    });

    const result = await service.listCalculations("tenant-a", "project-a", 1, 99);

    expect(repository.listCalculations).toHaveBeenCalledWith("tenant-a", "project-a", 1, 25);
    expect(result.versions.map((item: { id: string }) => item.id)).toEqual(["version-2", "version-1"]);
    expect(result.totalPages).toBe(2);
  });

  it("returns commercial output without internal cost or margin fields", async () => {
    repository.findLatestCalculation.mockResolvedValue({ version: version({ status: "APPROVED" }), currentCost: currentCost() });

    const result = await service.getApprovedCommercialOutput("tenant-a", "project-a");

    expect(result).toEqual(expect.objectContaining({
      pricingCalculationVersionId: "version-a",
      costingProjectId: "project-a",
      currency: "USD",
      finalSellingPrice: "125",
      status: "APPROVED",
    }));
    expect(result).not.toHaveProperty("authoritativeCostAmount");
    expect(result).not.toHaveProperty("targetProfitAmount");
  });
});

function currentCost(overrides: Record<string, unknown> = {}) {
  return { costingProjectId: "project-a", baseCurrency: "USD", authoritativeTotalCost: "1000", ...overrides };
}

function configuration(overrides: Record<string, unknown> = {}) {
  return {
    id: "configuration-a",
    costingProjectId: "project-a",
    status: "DRAFT",
    operationalCostsAmount: "0",
    riskMarginPercent: "0",
    targetProfitMarginPercent: "0",
    salesCommissionPercent: "0",
    bankCommissionPercent: "0",
    applicableTaxPercent: "0",
    createdAt: new Date("2026-09-19T00:00:00.000Z"),
    updatedAt: new Date("2026-09-19T00:00:00.000Z"),
    createdByUserId: "admin-a",
    createdByName: "Admin A",
    updatedByUserId: null,
    updatedByName: null,
    ...overrides,
  };
}

function version(overrides: Record<string, unknown> = {}) {
  return {
    id: "version-a",
    pricingConfigurationId: "configuration-a",
    costingProjectId: "project-a",
    versionNumber: 1,
    status: "DRAFT",
    policyVersion: "PRICING_V1",
    currency: "USD",
    authoritativeCostAmount: "1000",
    operationalCostsAmount: "0",
    riskMarginPercent: "0",
    targetProfitMarginPercent: "20",
    salesCommissionPercent: "0",
    bankCommissionPercent: "0",
    applicableTaxPercent: "0",
    riskBasis: "BASE_COST",
    targetProfitBasis: "PRE_TAX_SELLING_PRICE",
    salesCommissionBasis: "PRE_TAX_SELLING_PRICE",
    bankCommissionBasis: "FINAL_CHARGED_PRICE",
    taxBasis: "PRE_TAX_SELLING_PRICE",
    baseCostAmount: "1000",
    riskAmount: "0",
    adjustedEconomicCostAmount: "1000",
    targetProfitAmount: "250",
    salesCommissionAmount: "0",
    bankCommissionAmount: "0",
    preTaxSellingPrice: "1250",
    taxAmount: "0",
    finalSellingPrice: "125",
    estimatedAgencyProfitBeforeIncomeTax: "250",
    createdAt: new Date("2026-09-19T00:00:00.000Z"),
    createdByUserId: "admin-a",
    createdByName: "Admin A",
    approvedAt: null,
    approvedByUserId: null,
    approvedByName: null,
    ...overrides,
  };
}
