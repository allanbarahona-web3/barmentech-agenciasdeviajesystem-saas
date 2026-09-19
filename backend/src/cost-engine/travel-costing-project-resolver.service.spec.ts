import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CostEngineController } from "./cost-engine.controller";
import { TravelCostingProjectResolverService } from "./travel-costing-project-resolver.service";

const actor = { userId: "admin-a", name: "Admin A" };

describe("TravelCostingProjectResolverService", () => {
  it("creates one TravelPackage CostingProject and immutable link in a tenant transaction", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue(travelPackage());
    c.tx.travelPackageCostingProjectLink.findFirst.mockResolvedValue(null);
    c.tx.costingProject.create.mockResolvedValue(project());
    c.tx.travelPackageCostingProjectLink.create.mockResolvedValue({ id: "link-a" });

    await expect(c.service.resolveTravelPackage("tenant-a", "package-a", actor)).resolves.toEqual({
      costingProject: project(), source: { type: "TRAVEL_PACKAGE", id: "package-a" },
    });

    expect(c.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(c.tx.travelPackage.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "package-a", tenantId: "tenant-a" } }));
    expect(c.tx.$queryRaw).not.toHaveBeenCalled();
    expect(c.tx.costingProject.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: "tenant-a", displayName: "Madrid migration", baseCurrency: "EUR", createdByUserId: "admin-a" }),
    }));
    expect(c.tx.travelPackageCostingProjectLink.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: "tenant-a", travelPackageId: "package-a", costingProjectId: "project-a" }),
    }));
  });

  it("returns the existing TravelPackage project without creating another", async () => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue(travelPackage());
    c.tx.travelPackageCostingProjectLink.findFirst.mockResolvedValue({ costingProject: project() });

    await expect(c.service.resolveTravelPackage("tenant-a", "package-a", actor)).resolves.toEqual({
      costingProject: project(), source: { type: "TRAVEL_PACKAGE", id: "package-a" },
    });

    expect(c.tx.costingProject.create).not.toHaveBeenCalled();
    expect(c.tx.travelPackageCostingProjectLink.create).not.toHaveBeenCalled();
  });

  it("creates one InternalTrip project and accepts an arbitrary valid three-letter currency", async () => {
    const c = context();
    c.tx.internalTrip.findFirst.mockResolvedValue(internalTrip({ currency: "mxn" }));
    c.tx.internalTripCostingProjectLink.findFirst.mockResolvedValue(null);
    c.tx.costingProject.create.mockResolvedValue(project({ baseCurrency: "MXN" }));
    c.tx.internalTripCostingProjectLink.create.mockResolvedValue({ id: "link-a" });

    await expect(c.service.resolveInternalTrip("tenant-a", "trip-a", actor)).resolves.toEqual({
      costingProject: project({ baseCurrency: "MXN" }), source: { type: "INTERNAL_TRIP", id: "trip-a" },
    });

    expect(c.tx.costingProject.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ displayName: "Arenal", baseCurrency: "MXN" }),
    }));
    expect(c.tx.internalTripCostingProjectLink.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: "tenant-a", internalTripId: "trip-a", costingProjectId: "project-a" }),
    }));
  });

  it("returns the existing InternalTrip project without creating another", async () => {
    const c = context();
    c.tx.internalTrip.findFirst.mockResolvedValue(internalTrip());
    c.tx.internalTripCostingProjectLink.findFirst.mockResolvedValue({ costingProject: project({ baseCurrency: "CRC" }) });

    await expect(c.service.resolveInternalTrip("tenant-a", "trip-a", actor)).resolves.toEqual({
      costingProject: project({ baseCurrency: "CRC" }), source: { type: "INTERNAL_TRIP", id: "trip-a" },
    });

    expect(c.tx.costingProject.create).not.toHaveBeenCalled();
    expect(c.tx.internalTripCostingProjectLink.create).not.toHaveBeenCalled();
  });

  it.each([undefined, "US", "USDD", "12!"]) ("rejects invalid persisted travel currency %p before creating a project", async (currency) => {
    const c = context();
    c.tx.travelPackage.findFirst.mockResolvedValue(travelPackage({ priceCurrency: currency }));
    c.tx.travelPackageCostingProjectLink.findFirst.mockResolvedValue(null);

    await expect(c.service.resolveTravelPackage("tenant-a", "package-a", actor)).rejects.toBeInstanceOf(BadRequestException);

    expect(c.tx.costingProject.create).not.toHaveBeenCalled();
    expect(c.tx.travelPackageCostingProjectLink.create).not.toHaveBeenCalled();
  });

  it("rejects a travel record outside the authenticated tenant", async () => {
    const c = context();
    c.tx.internalTrip.findFirst.mockResolvedValue(null);

    await expect(c.service.resolveInternalTrip("tenant-a", "trip-b", actor)).rejects.toBeInstanceOf(NotFoundException);

    expect(c.tx.internalTrip.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "trip-b", tenantId: "tenant-a" } }));
    expect(c.tx.costingProject.create).not.toHaveBeenCalled();
  });

  it("rolls back the new project and link when link creation fails", async () => {
    const c = context({ rollbackOnError: true });
    c.tx.travelPackage.findFirst.mockResolvedValue(travelPackage());
    c.tx.travelPackageCostingProjectLink.findFirst.mockResolvedValue(null);
    c.tx.costingProject.create.mockResolvedValue(project());
    c.tx.travelPackageCostingProjectLink.create.mockRejectedValue(new Error("link insert failed"));

    await expect(c.service.resolveTravelPackage("tenant-a", "package-a", actor)).rejects.toThrow("link insert failed");

    expect(c.root.rollback).toHaveBeenCalledTimes(1);
  });

  it("returns the one TravelPackage link winner and rolls back the losing concurrent creation", async () => {
    const c = context({ rollbackOnError: true });
    c.tx.travelPackage.findFirst.mockResolvedValue(travelPackage());
    c.tx.travelPackageCostingProjectLink.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ costingProject: project({ id: "project-winner" }) });
    c.tx.costingProject.create.mockResolvedValue(project());
    c.tx.travelPackageCostingProjectLink.create.mockRejectedValue({ code: "P2002" });

    await expect(c.service.resolveTravelPackage("tenant-a", "package-a", actor)).resolves.toEqual({
      costingProject: project({ id: "project-winner" }), source: { type: "TRAVEL_PACKAGE", id: "package-a" },
    });

    expect(c.root.$transaction).toHaveBeenCalledTimes(2);
    expect(c.root.rollback).toHaveBeenCalledTimes(1);
  });

  it("returns the one InternalTrip link winner and rolls back the losing concurrent creation", async () => {
    const c = context({ rollbackOnError: true });
    c.tx.internalTrip.findFirst.mockResolvedValue(internalTrip());
    c.tx.internalTripCostingProjectLink.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ costingProject: project({ id: "project-winner" }) });
    c.tx.costingProject.create.mockResolvedValue(project());
    c.tx.internalTripCostingProjectLink.create.mockRejectedValue({ code: "P2002" });

    await expect(c.service.resolveInternalTrip("tenant-a", "trip-a", actor)).resolves.toEqual({
      costingProject: project({ id: "project-winner" }), source: { type: "INTERNAL_TRIP", id: "trip-a" },
    });

    expect(c.root.$transaction).toHaveBeenCalledTimes(2);
    expect(c.root.rollback).toHaveBeenCalledTimes(1);
  });

  it("does not hide unrelated persistence errors", async () => {
    const c = context();
    c.tx.internalTrip.findFirst.mockResolvedValue(internalTrip());
    c.tx.internalTripCostingProjectLink.findFirst.mockResolvedValue(null);
    c.tx.costingProject.create.mockRejectedValue(new Error("database unavailable"));

    await expect(c.service.resolveInternalTrip("tenant-a", "trip-a", actor)).rejects.toThrow("database unavailable");
    expect(c.root.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe("CostEngineController travel costing-project routes", () => {
  it("derives tenant and actor from authentication; the client cannot choose a tenant or project", async () => {
    const resolver = {
      resolveTravelPackage: jest.fn().mockResolvedValue({ costingProject: project(), source: { type: "TRAVEL_PACKAGE", id: "package-a" } }),
      resolveInternalTrip: jest.fn(),
    };
    const controller = new CostEngineController({} as never, {} as never, resolver as never);
    const request = { user: { id: "admin-a", fullName: "Admin A", tenantId: "tenant-a" } };

    await controller.resolveTravelPackageCostingProject(request, "package-a");

    expect(resolver.resolveTravelPackage).toHaveBeenCalledWith("tenant-a", "package-a", actor);
    expect(controller.resolveTravelPackageCostingProject.length).toBe(2);
  });
});

function context(options: { rollbackOnError?: boolean } = {}) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([{ id: "source-a" }]),
    travelPackage: delegate(),
    internalTrip: delegate(),
    costingProject: delegate(),
    travelPackageCostingProjectLink: delegate(),
    internalTripCostingProjectLink: delegate(),
  };
  const root: any = {
    rollback: jest.fn(),
    $transaction: jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => {
      try {
        return await work(tx);
      } catch (error) {
        if (options.rollbackOnError) root.rollback();
        throw error;
      }
    }),
  };
  return { service: new TravelCostingProjectResolverService(root as PrismaService), root, tx };
}

function delegate() {
  return { findFirst: jest.fn(), create: jest.fn() };
}

function project(overrides: Record<string, unknown> = {}) {
  return { id: "project-a", displayName: "Madrid migration", baseCurrency: "EUR", status: "DRAFT", ...overrides };
}

function travelPackage(overrides: Record<string, unknown> = {}) {
  return { id: "package-a", name: "Madrid migration", priceCurrency: "EUR", ...overrides };
}

function internalTrip(overrides: Record<string, unknown> = {}) {
  return { id: "trip-a", name: "Arenal", currency: "CRC", ...overrides };
}
