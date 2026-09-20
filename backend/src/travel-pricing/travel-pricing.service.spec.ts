import { ConflictException, NotFoundException } from "@nestjs/common";
import { TravelPricingService } from "./travel-pricing.service";

describe("TravelPricingService", () => {
  const actor = { userId: "admin-a", name: "Admin A" };
  let tx: Record<string, any>;
  let currentCosts: { read: jest.Mock };
  let service: TravelPricingService;

  beforeEach(() => {
    tx = {
      $executeRaw: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([{ id: "locked" }]),
      pricingCalculationVersion: { findFirst: jest.fn().mockResolvedValue(version()) },
      travelPackage: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      internalTrip: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      travelPackageCostingProjectLink: { findFirst: jest.fn().mockResolvedValue(packageLink()) },
      internalTripCostingProjectLink: { findFirst: jest.fn().mockResolvedValue(null) },
      travelPackagePricingPublication: {
        findFirst: jest.fn().mockImplementation(({ where }: any) => where.pricingCalculationVersionId ? null : null),
        create: jest.fn().mockImplementation(({ data }: any) => publication(data)),
      },
      internalTripPricingPublication: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) => publication(data)),
      },
    };
    currentCosts = { read: jest.fn().mockResolvedValue({ costingProjectId: "project-a", baseCurrency: "USD", authoritativeTotalCost: "1000" }) };
    const database = { $transaction: jest.fn((work: (value: typeof tx) => Promise<unknown>) => work(tx)) };
    service = new TravelPricingService(database as never, currentCosts as never);
  });

  it("publishes a non-stale approved version to TravelPackage from the frozen final selling price", async () => {
    const result = await service.publish("tenant-a", "version-a", actor);

    expect(tx.travelPackage.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "package-a", tenantId: "tenant-a" },
      data: { packagePrice: "2480.12500", priceCurrency: "USD" },
    }));
    expect(tx.travelPackagePricingPublication.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ pricingCalculationVersionId: "version-a", publishedPrice: "2480.12500", commercialFloorPrice: "2480.12500", publishedByUserId: actor.userId }),
    }));
    expect(result.currentCommercialPrice).toBe("2480.12500");
    expect(result.commercialPriceStatus).toBe("PRICING_PUBLISHED");
    expect(result.commercialFloorPrice).toBe("2480.12500");
  });

  it("publishes the same approved result to InternalTrip through the separate adapter relation", async () => {
    tx.travelPackageCostingProjectLink.findFirst.mockResolvedValue(null);
    tx.internalTripCostingProjectLink.findFirst.mockResolvedValue(tripLink());

    const result = await service.publish("tenant-a", "version-a", actor);

    expect(tx.internalTrip.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "trip-a", tenantId: "tenant-a" },
      data: { price: "2480.12500", currency: "USD" },
    }));
    expect(tx.internalTripPricingPublication.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ pricingCalculationVersionId: "version-a", publishedPrice: "2480.12500" }),
    }));
    expect(result.sourceType).toBe("INTERNAL_TRIP");
  });

  it("rejects draft, stale, and cross-tenant pricing versions before travel mutation", async () => {
    tx.pricingCalculationVersion.findFirst.mockResolvedValueOnce(version({ status: "DRAFT" }));
    await expect(service.publish("tenant-a", "version-a", actor)).rejects.toBeInstanceOf(ConflictException);

    tx.pricingCalculationVersion.findFirst.mockResolvedValueOnce(version());
    currentCosts.read.mockResolvedValueOnce({ costingProjectId: "project-a", baseCurrency: "USD", authoritativeTotalCost: "1001" });
    await expect(service.publish("tenant-a", "version-a", actor)).rejects.toMatchObject({ message: "Los costos cambiaron desde este cálculo. Recalcula y aprueba una nueva versión antes de publicar." });

    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.publish("tenant-b", "version-a", actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.travelPackage.updateMany).not.toHaveBeenCalled();
  });

  it("preserves the first floor across a later higher publication", async () => {
    tx.travelPackagePricingPublication.findFirst.mockImplementation(({ where }: any) => {
      if (where.pricingCalculationVersionId) return null;
      return publication({ commercialFloorPrice: "2350.00000", publishedPrice: "2350.00000" });
    });
    tx.pricingCalculationVersion.findFirst.mockResolvedValue(version({ id: "version-b", finalSellingPrice: "2480.12500" }));

    const result = await service.publish("tenant-a", "version-b", actor);

    expect(tx.travelPackagePricingPublication.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ commercialFloorPrice: "2350.00000" }) }));
    expect(result.commercialFloorPrice).toBe("2350.00000");
  });

  it("blocks a below-floor publication without substituting a client-selected price", async () => {
    tx.travelPackagePricingPublication.findFirst.mockImplementation(({ where }: any) => {
      if (where.pricingCalculationVersionId) return null;
      return publication({ commercialFloorPrice: "2350.00000" });
    });
    tx.pricingCalculationVersion.findFirst.mockResolvedValue(version({ id: "version-c", finalSellingPrice: "2300.00000" }));

    await expect(service.publish("tenant-a", "version-c", actor)).rejects.toMatchObject({ message: "El precio aprobado está por debajo del piso comercial de USD 2350.00000." });
    expect(tx.travelPackage.updateMany).not.toHaveBeenCalled();
    expect(tx.travelPackagePricingPublication.create).not.toHaveBeenCalled();
  });

  it("is idempotent for the same approved version and avoids repeated travel mutation", async () => {
    tx.travelPackagePricingPublication.findFirst.mockImplementation(({ where }: any) => where.pricingCalculationVersionId ? publication({ pricingCalculationVersionId: "version-a" }) : null);

    const result = await service.publish("tenant-a", "version-a", actor);

    expect(result.idempotent).toBe(true);
    expect(tx.travelPackage.updateMany).not.toHaveBeenCalled();
    expect(tx.travelPackagePricingPublication.create).not.toHaveBeenCalled();
  });

  it("returns current travel price and a floor only from immutable publication history", async () => {
    tx.travelPackagePricingPublication.findFirst.mockResolvedValue(publication({ commercialFloorPrice: "2350.00000" }));

    const context = await service.getPublicationContext("tenant-a", "project-a");

    expect(context.currentCommercialPrice).toBe("2200.00000");
    expect(context.commercialPriceStatus).toBe("PRICING_PUBLISHED");
    expect(context.commercialFloorPrice).toBe("2350.00000");
    expect(currentCosts.read).toHaveBeenCalledWith(tx, "tenant-a", "project-a");
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("distinguishes a pending travel price from a legacy manual price without deriving a floor", async () => {
    tx.travelPackagePricingPublication.findFirst.mockResolvedValue(null);
    tx.travelPackageCostingProjectLink.findFirst.mockResolvedValue({
      travelPackage: { id: "package-a", name: "Paquete A", packagePrice: null, priceCurrency: "USD" },
    });

    const pending = await service.getPublicationContext("tenant-a", "project-a");
    expect(pending).toMatchObject({ currentCommercialPrice: null, commercialPriceStatus: "PENDING", commercialFloorPrice: null });

    tx.travelPackageCostingProjectLink.findFirst.mockResolvedValue(packageLink());
    const legacy = await service.getPublicationContext("tenant-a", "project-a");
    expect(legacy).toMatchObject({ currentCommercialPrice: "2200.00000", commercialPriceStatus: "LEGACY", commercialFloorPrice: null });
  });
});

function version(overrides: Record<string, unknown> = {}) {
  return {
    id: "version-a",
    costingProjectId: "project-a",
    status: "APPROVED",
    currency: "USD",
    authoritativeCostAmount: "1000.00000",
    finalSellingPrice: "2480.12500",
    ...overrides,
  };
}

function packageLink() {
  return { travelPackage: { id: "package-a", name: "Paquete A", packagePrice: "2200.00000", priceCurrency: "USD" } };
}

function tripLink() {
  return { internalTrip: { id: "trip-a", name: "Viaje A", price: "2200.00000", currency: "USD" } };
}

function publication(overrides: Record<string, unknown> = {}) {
  return {
    id: "publication-a",
    pricingCalculationVersionId: "version-a",
    publishedPrice: "2480.12500",
    currency: "USD",
    commercialFloorPrice: "2480.12500",
    publishedAt: new Date("2026-09-19T20:00:00.000Z"),
    publishedByUserId: "admin-a",
    publishedByName: "Admin A",
    ...overrides,
  };
}
