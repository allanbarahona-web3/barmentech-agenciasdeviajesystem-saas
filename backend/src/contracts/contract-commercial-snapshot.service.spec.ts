import { Prisma } from "@prisma/client";
import { ContractCommercialSnapshotService } from "./contract-commercial-snapshot.service";

const actor = { userId: "reviewer-1", name: "Reviewer" };
const contract = {
  id: "contract-1",
  travelPackageId: "package-1",
  participantCount: 3,
  commercialTotal: new Prisma.Decimal("1500.00000"),
  commercialCurrency: "USD",
  commercialPricingPublicationId: null,
  commercialPublishedPricePerPerson: null,
};
const passengers = [
  { travelPackageParticipantId: "participant-holder", clientId: "client-1", role: "HOLDER" as const },
  { travelPackageParticipantId: "participant-companion", clientId: "client-2", role: "COMPANION" as const },
  { travelPackageParticipantId: "participant-minor", clientId: "client-3", role: "MINOR" as const },
];

describe("ContractCommercialSnapshotService", () => {
  it("copies the exact current publication, Pricing version, roster, and component lines", async () => {
    const c = context();

    await expect(c.service.freezeInTransaction(c.tx as never, {
      tenantId: "tenant-1", contract, passengers, actor,
    })).resolves.toEqual({ snapshotId: "snapshot-1" });

    expect(c.publishedPricing.readInTransaction).toHaveBeenCalledWith(c.tx, "tenant-1", "package-1");
    expect(c.tx.pricingCalculationVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "version-1", costingProjectId: "project-1", status: "APPROVED" }),
    }));
    expect(c.tx.pricingCalculationComponentLine.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: "tenant-1", pricingCalculationVersionId: "version-1", costingProjectId: "project-1" },
      orderBy: { costComponentId: "asc" },
    }));
    expect(c.tx.contractCommercialSnapshot.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        contractId: "contract-1",
        travelPackageId: "package-1",
        pricingCalculationVersionId: "version-1",
        travelPackagePricingPublicationId: "publication-1",
        perPersonSellingPrice: new Prisma.Decimal("500.00000"),
        billablePassengerQuantity: 3,
        commercialTotal: new Prisma.Decimal("1500.00000"),
        currency: "USD",
        unitScope: "PER_PERSON",
      }),
    }));
    const data = c.tx.contractCommercialSnapshot.create.mock.calls[0][0].data;
    expect(data.passengers.create).toEqual(expect.arrayContaining([
      expect.objectContaining({ travelPackageParticipantId: "participant-holder", clientId: "client-1", role: "HOLDER", billable: true, unitMultiplier: 1 }),
      expect.objectContaining({ travelPackageParticipantId: "participant-companion", clientId: "client-2", role: "COMPANION" }),
      expect.objectContaining({ travelPackageParticipantId: "participant-minor", clientId: "client-3", role: "MINOR" }),
    ]));
    expect(data.componentLines.create).toEqual(expect.arrayContaining([
      expect.objectContaining({ costComponentId: "component-flight", costSnapshotId: "snapshot-flight", effectiveSellingValue: new Prisma.Decimal("300.00000") }),
      expect.objectContaining({ costComponentId: "component-hotel", costSnapshotId: "snapshot-hotel", effectiveSellingValue: new Prisma.Decimal("200.00000") }),
    ]));
  });

  it("uses retained Contract Pricing authority after a later publication changes the current price", async () => {
    const c = context({ perPersonSellingPrice: "550.00000", versionFinalSellingPrice: "500.00000" });
    const frozenContract = {
      ...contract,
      commercialPricingPublicationId: "publication-1",
      commercialPublishedPricePerPerson: new Prisma.Decimal("500.00000"),
    };

    await expect(c.service.freezeInTransaction(c.tx as never, {
      tenantId: "tenant-1", contract: frozenContract, passengers, actor,
    })).resolves.toEqual({ snapshotId: "snapshot-1" });

    expect(c.publishedPricing.readInTransaction).not.toHaveBeenCalled();
    expect(c.tx.travelPackagePricingPublication.findFirst).toHaveBeenCalledWith({
      where: { id: "publication-1", tenantId: "tenant-1", travelPackageId: "package-1" },
      select: {
        id: true,
        costingProjectId: true,
        pricingCalculationVersionId: true,
        publishedPrice: true,
        currency: true,
      },
    });
    expect(c.tx.contractCommercialSnapshot.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        travelPackagePricingPublicationId: "publication-1",
        perPersonSellingPrice: new Prisma.Decimal("500.00000"),
        commercialTotal: new Prisma.Decimal("1500.00000"),
      }),
    }));
  });

  it("rejects a retained per-person price that does not match its retained publication", async () => {
    const c = context({ versionFinalSellingPrice: "500.00000" });
    const frozenContract = {
      ...contract,
      commercialPricingPublicationId: "publication-1",
      commercialPublishedPricePerPerson: new Prisma.Decimal("550.00000"),
    };

    await expect(c.service.freezeInTransaction(c.tx as never, {
      tenantId: "tenant-1", contract: frozenContract, passengers, actor,
    })).rejects.toThrow("CONTRACT_COMMERCIAL_PRICE_STALE");
    expect(c.publishedPricing.readInTransaction).not.toHaveBeenCalled();
    expect(c.tx.contractCommercialSnapshot.create).not.toHaveBeenCalled();
  });

  it("rejects a missing retained publication without falling back to current Pricing", async () => {
    const c = context({ retainedPublicationMissing: true });
    const frozenContract = {
      ...contract,
      commercialPricingPublicationId: "publication-missing",
      commercialPublishedPricePerPerson: new Prisma.Decimal("500.00000"),
    };

    await expect(c.service.freezeInTransaction(c.tx as never, {
      tenantId: "tenant-1", contract: frozenContract, passengers, actor,
    })).rejects.toThrow("CONTRACT_COMMERCIAL_SNAPSHOT_PRICING_INVALID");
    expect(c.publishedPricing.readInTransaction).not.toHaveBeenCalled();
    expect(c.tx.contractCommercialSnapshot.create).not.toHaveBeenCalled();
  });

  it("rejects an inconsistent retained Contract total without reading current Pricing", async () => {
    const c = context();
    const frozenContract = {
      ...contract,
      commercialTotal: new Prisma.Decimal("1499.99999"),
      commercialPricingPublicationId: "publication-1",
      commercialPublishedPricePerPerson: new Prisma.Decimal("500.00000"),
    };

    await expect(c.service.freezeInTransaction(c.tx as never, {
      tenantId: "tenant-1", contract: frozenContract, passengers, actor,
    })).rejects.toThrow("CONTRACT_COMMERCIAL_PRICE_STALE");
    expect(c.publishedPricing.readInTransaction).not.toHaveBeenCalled();
    expect(c.tx.contractCommercialSnapshot.create).not.toHaveBeenCalled();
  });

  it("rejects an inconsistent retained Contract currency without reading current Pricing", async () => {
    const c = context();
    const frozenContract = {
      ...contract,
      commercialCurrency: "CRC",
      commercialPricingPublicationId: "publication-1",
      commercialPublishedPricePerPerson: new Prisma.Decimal("500.00000"),
    };

    await expect(c.service.freezeInTransaction(c.tx as never, {
      tenantId: "tenant-1", contract: frozenContract, passengers, actor,
    })).rejects.toThrow("CONTRACT_COMMERCIAL_PRICE_STALE");
    expect(c.publishedPricing.readInTransaction).not.toHaveBeenCalled();
    expect(c.tx.contractCommercialSnapshot.create).not.toHaveBeenCalled();
  });

  it("uses existing latest-Pricing validation for historical null-lineage Contracts", async () => {
    const c = context({ perPersonSellingPrice: "550.00000" });

    await expect(c.service.freezeInTransaction(c.tx as never, {
      tenantId: "tenant-1", contract, passengers, actor,
    })).rejects.toThrow("CONTRACT_COMMERCIAL_PRICE_STALE");
    expect(c.publishedPricing.readInTransaction).toHaveBeenCalledWith(c.tx, "tenant-1", "package-1");
    expect(c.tx.contractCommercialSnapshot.create).not.toHaveBeenCalled();
  });

  it("rejects a current Pricing version without component snapshot lines", async () => {
    const c = context({ componentLines: [] });

    await expect(c.service.freezeInTransaction(c.tx as never, {
      tenantId: "tenant-1", contract, passengers, actor,
    })).rejects.toThrow("CONTRACT_COMMERCIAL_SNAPSHOT_COMPONENT_LINES_UNAVAILABLE");
    expect(c.tx.contractCommercialSnapshot.create).not.toHaveBeenCalled();
  });

  it("rejects a currency mismatch without recalculating Pricing", async () => {
    const c = context({ currency: "CRC" });

    await expect(c.service.freezeInTransaction(c.tx as never, {
      tenantId: "tenant-1", contract, passengers, actor,
    })).rejects.toThrow("CONTRACT_COMMERCIAL_PRICE_STALE");
    expect(c.tx.pricingCalculationComponentLine.findMany).not.toHaveBeenCalled();
    expect(c.tx.contractCommercialSnapshot.create).not.toHaveBeenCalled();
  });

  it("reuses an existing snapshot without reading mutable Pricing state", async () => {
    const c = context({ existingSnapshotId: "snapshot-existing" });
    const frozenContract = {
      ...contract,
      commercialPricingPublicationId: "publication-1",
      commercialPublishedPricePerPerson: new Prisma.Decimal("500.00000"),
    };

    await expect(c.service.freezeInTransaction(c.tx as never, {
      tenantId: "tenant-1", contract: frozenContract, passengers, actor,
    })).resolves.toEqual({ snapshotId: "snapshot-existing" });
    expect(c.publishedPricing.readInTransaction).not.toHaveBeenCalled();
    expect(c.tx.travelPackagePricingPublication.findFirst).not.toHaveBeenCalled();
    expect(c.tx.contractCommercialSnapshot.create).not.toHaveBeenCalled();
  });

  it("leaves legacy Contracts without fabricated component values", async () => {
    const c = context({ legacy: true });

    await expect(c.service.freezeInTransaction(c.tx as never, {
      tenantId: "tenant-1", contract, passengers, actor,
    })).resolves.toBeNull();
    expect(c.tx.contractCommercialSnapshot.create).not.toHaveBeenCalled();
  });
});

function context(overrides: {
  existingSnapshotId?: string;
  perPersonSellingPrice?: string;
  versionFinalSellingPrice?: string;
  retainedPublicationMissing?: boolean;
  currency?: string;
  componentLines?: any[];
  legacy?: boolean;
} = {}) {
  const currency = overrides.currency ?? "USD";
  const perPersonSellingPrice = overrides.perPersonSellingPrice ?? "500.00000";
  const versionFinalSellingPrice = overrides.versionFinalSellingPrice ?? perPersonSellingPrice;
  const componentLines = overrides.componentLines ?? (
    versionFinalSellingPrice === "550.00000"
      ? [line("component-flight", "snapshot-flight", "330.00000"), line("component-hotel", "snapshot-hotel", "220.00000")]
      : [line("component-flight", "snapshot-flight", "300.00000"), line("component-hotel", "snapshot-hotel", "200.00000")]
  );
  const tx = {
    contractCommercialSnapshot: {
      findFirst: jest.fn().mockResolvedValue(overrides.existingSnapshotId ? { id: overrides.existingSnapshotId } : null),
      create: jest.fn().mockResolvedValue({ id: "snapshot-1" }),
    },
    pricingCalculationVersion: {
      findFirst: jest.fn().mockResolvedValue({
        id: "version-1", costingProjectId: "project-1", currency, finalSellingPrice: new Prisma.Decimal(versionFinalSellingPrice),
      }),
    },
    pricingCalculationComponentLine: { findMany: jest.fn().mockResolvedValue(componentLines) },
    travelPackagePricingPublication: {
      findFirst: jest.fn().mockResolvedValue(overrides.retainedPublicationMissing ? null : {
        id: "publication-1", costingProjectId: "project-1", pricingCalculationVersionId: "version-1",
        publishedPrice: new Prisma.Decimal(versionFinalSellingPrice), currency,
      }),
    },
  };
  const publishedPricing = {
    readInTransaction: jest.fn().mockResolvedValue(overrides.legacy ? {
      kind: "LEGACY", travelPackageId: "package-1", packagePrice: "500.00000", currency,
    } : {
      kind: "PRICING_PUBLISHED", travelPackageId: "package-1", publicationId: "publication-1",
      costingProjectId: "project-1", pricingCalculationVersionId: "version-1",
      perPersonSellingPrice, currency, unitScope: "PER_PERSON", commercialFloorPrice: "400.00000",
    }),
  };
  return { tx, publishedPricing, service: new ContractCommercialSnapshotService(publishedPricing as never) };
}

function line(costComponentId: string, costSnapshotId: string, effectiveSellingValue: string) {
  return {
    costingProjectId: "project-1", costComponentId, costSnapshotId,
    costCategoryCode: "BASE", costCategoryDisplayName: "Base", componentTitle: costComponentId,
    currency: "USD", baseCost: new Prisma.Decimal("100.00000"),
    allocatedOperationalExpense: new Prisma.Decimal("10.00000"), risk: new Prisma.Decimal("5.00000"),
    adjustedEconomicCost: new Prisma.Decimal("115.00000"), preTaxSellingPrice: new Prisma.Decimal("450.00000"),
    targetProfit: new Prisma.Decimal("50.00000"), salesCommission: new Prisma.Decimal("25.00000"),
    bankCommission: new Prisma.Decimal("10.00000"), tax: new Prisma.Decimal("15.00000"),
    rawSellingValue: new Prisma.Decimal(effectiveSellingValue),
    allocatedPublishedPriceRetention: new Prisma.Decimal("0.00000"), roundingAdjustment: new Prisma.Decimal("0.00000"),
    effectiveSellingValue: new Prisma.Decimal(effectiveSellingValue),
  };
}
