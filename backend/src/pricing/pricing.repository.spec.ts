import { ConflictException, NotFoundException } from "@nestjs/common";
import { PricingRepository } from "./pricing.repository";

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
      pricingCalculationVersion: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
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
