import { Prisma } from "@prisma/client";
import { ContractCommercialSnapshotReader } from "./contract-commercial-snapshot.reader";

describe("ContractCommercialSnapshotReader", () => {
  it("returns immutable Contract commercial evidence through a tenant-scoped boundary", async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      contract: {
        findFirst: jest.fn().mockResolvedValue({
          id: "contract-1", contractNumber: "CT-1",
          commercialSnapshot: {
            travelPackageId: "package-1", pricingCalculationVersionId: "version-1",
            travelPackagePricingPublicationId: "publication-1", unitScope: "PER_PERSON",
            perPersonSellingPrice: new Prisma.Decimal("500.00000"), billablePassengerQuantity: 1,
            commercialTotal: new Prisma.Decimal("500.00000"), currency: "USD", frozenAt: new Date("2026-10-03T00:00:00.000Z"),
            passengers: [{ travelPackageParticipantId: "participant-1", clientId: "client-1", role: "HOLDER", billable: true, unitMultiplier: 1 }],
            componentLines: [{
              costComponentId: "component-1", costSnapshotId: "snapshot-1", costCategoryCode: "AIRFARE",
              costCategoryDisplayName: "Airfare", componentTitle: "Flight", currency: "USD",
              baseCost: new Prisma.Decimal("300"), allocatedOperationalExpense: new Prisma.Decimal("10"), risk: new Prisma.Decimal("5"),
              adjustedEconomicCost: new Prisma.Decimal("315"), preTaxSellingPrice: new Prisma.Decimal("450"), targetProfit: new Prisma.Decimal("50"),
              salesCommission: new Prisma.Decimal("25"), bankCommission: new Prisma.Decimal("10"), tax: new Prisma.Decimal("15"),
              rawSellingValue: new Prisma.Decimal("500"), allocatedPublishedPriceRetention: new Prisma.Decimal("0"), roundingAdjustment: new Prisma.Decimal("0"), effectiveSellingValue: new Prisma.Decimal("500"),
            }],
          },
        }),
      },
    };
    const reader = new ContractCommercialSnapshotReader({
      $transaction: jest.fn(async (work: (transaction: typeof tx) => unknown) => work(tx)),
    } as never);

    await expect(reader.read("tenant-1", "contract-1")).resolves.toEqual(expect.objectContaining({
      contractNumber: "CT-1", perPersonSellingPrice: "500", commercialTotal: "500", currency: "USD",
      passengers: [expect.objectContaining({ travelPackageParticipantId: "participant-1", role: "HOLDER" })],
      componentLines: [expect.objectContaining({ costSnapshotId: "snapshot-1", effectiveSellingValue: "500" })],
    }));
    expect(tx.contract.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "contract-1", tenantId: "tenant-1" },
    }));
  });

  it("returns null for a legacy Contract without a commercial snapshot", async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      contract: { findFirst: jest.fn().mockResolvedValue({ id: "contract-legacy", contractNumber: "CT-LEGACY", commercialSnapshot: null }) },
    };
    const reader = new ContractCommercialSnapshotReader({
      $transaction: jest.fn(async (work: (transaction: typeof tx) => unknown) => work(tx)),
    } as never);

    await expect(reader.read("tenant-1", "contract-legacy")).resolves.toBeNull();
  });
});
