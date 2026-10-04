import { TravelPackagePublishedPricingReader } from "./travel-package-published-pricing.reader";

describe("TravelPackagePublishedPricingReader", () => {
  it("returns the current tenant-scoped published PER_PERSON price", async () => {
    const tx = transaction({
      travelPackage: { id: "package-1", packagePrice: "500.12345", priceCurrency: "USD" },
      publication: {
        id: "publication-1",
        costingProjectId: "project-1",
        pricingCalculationVersionId: "version-1",
        publishedPrice: "500.12345",
        currency: "USD",
        commercialFloorPrice: "400.00000",
      },
    });
    const reader = new TravelPackagePublishedPricingReader(database(tx) as never);

    await expect(reader.read("tenant-1", "package-1")).resolves.toEqual({
      kind: "PRICING_PUBLISHED",
      travelPackageId: "package-1",
      publicationId: "publication-1",
      costingProjectId: "project-1",
      pricingCalculationVersionId: "version-1",
      perPersonSellingPrice: "500.12345",
      currency: "USD",
      unitScope: "PER_PERSON",
      commercialFloorPrice: "400.00000",
    });
    expect(tx.travelPackage.findFirst).toHaveBeenCalledWith({
      where: { id: "package-1", tenantId: "tenant-1" },
      select: { id: true, packagePrice: true, priceCurrency: true },
    });
    expect(tx.travelPackagePricingPublication.findFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", travelPackageId: "package-1" },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        costingProjectId: true,
        pricingCalculationVersionId: true,
        publishedPrice: true,
        currency: true,
        commercialFloorPrice: true,
      },
    });
  });

  it("returns the isolated legacy fallback only when there is no Pricing publication", async () => {
    const tx = transaction({
      travelPackage: { id: "legacy-package", packagePrice: "250.00000", priceCurrency: "CRC" },
      publication: null,
    });
    const reader = new TravelPackagePublishedPricingReader(database(tx) as never);

    await expect(reader.read("tenant-1", "legacy-package")).resolves.toEqual({
      kind: "LEGACY",
      travelPackageId: "legacy-package",
      packagePrice: "250.00000",
      currency: "CRC",
    });
  });

  it("rejects a Pricing publication that no longer matches the package current price", async () => {
    const tx = transaction({
      travelPackage: { id: "package-1", packagePrice: "500.00000", priceCurrency: "USD" },
      publication: {
        id: "publication-1",
        costingProjectId: "project-1",
        pricingCalculationVersionId: "version-1",
        publishedPrice: "550.00000",
        currency: "USD",
        commercialFloorPrice: "400.00000",
      },
    });
    const reader = new TravelPackagePublishedPricingReader(database(tx) as never);

    await expect(reader.read("tenant-1", "package-1")).rejects.toThrow(
      "TRAVEL_PACKAGE_PUBLISHED_PRICING_STATE_INVALID",
    );
  });
});

function transaction(input: { travelPackage: unknown; publication: unknown }) {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    travelPackage: { findFirst: jest.fn().mockResolvedValue(input.travelPackage) },
    travelPackagePricingPublication: {
      findFirst: jest.fn().mockResolvedValue(input.publication),
    },
  };
}

function database(tx: ReturnType<typeof transaction>) {
  return {
    $transaction: jest.fn(async (work: (transaction: typeof tx) => unknown) => work(tx)),
  };
}
