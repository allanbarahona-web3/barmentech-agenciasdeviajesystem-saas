import { PrismaService } from "../../prisma/prisma.service";
import { PrismaAdditionalServicesRepository } from "./prisma-additional-services.repository";

describe("PrismaAdditionalServicesRepository catalog usage boundary", () => {
  const catalog = {
    id: "catalog-1",
    tenantId: "tenant-1",
    code: "TOUR",
    name: "Tour",
    isActive: true,
    pricingConfigurations: [],
    fiscalProfile: null,
  };

  it("uses tenant + usage lookup and returns all usages without N+1", async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ catalogId: "catalog-1" }])
      .mockResolvedValueOnce([
        { catalogId: "catalog-1", usage: "TRAVEL_PACKAGE" },
      ]);
    const findMany = jest.fn().mockResolvedValue([catalog]);
    const repository = new PrismaAdditionalServicesRepository({
      additionalServiceCatalog: { findMany },
      $queryRaw: queryRaw,
    } as unknown as PrismaService);

    const result = await repository.findAdditionalServiceCatalogsByUsage(
      "tenant-1",
      "TRAVEL_PACKAGE",
    );

    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "tenant-1",
          id: { in: ["catalog-1"] },
        },
      }),
    );
    expect(result[0].usages).toEqual(["TRAVEL_PACKAGE"]);

    const usageLookup = queryRaw.mock.calls[0][0];
    expect(usageLookup.strings.join(" ")).toContain(
      'usage."tenantId" = ',
    );
    expect(usageLookup.values).toEqual([
      "tenant-1",
      "TRAVEL_PACKAGE",
    ]);
  });

  it("hides a travel-only code from operational Additional Service lookup", async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: "catalog-1",
      tenantId: "tenant-1",
      code: "TOUR",
      name: "Tour",
      isActive: true,
    });
    const queryRaw = jest.fn().mockResolvedValue([{ present: false }]);
    const repository = new PrismaAdditionalServicesRepository({
      additionalServiceCatalog: { findFirst },
      $queryRaw: queryRaw,
    } as unknown as PrismaService);

    await expect(
      repository.findAdditionalServiceCatalogByCode("tenant-1", "TOUR"),
    ).resolves.toBeNull();
  });

  it("creates the catalog and replaces usages through one Prisma transaction", async () => {
    const create = jest.fn().mockResolvedValue({
      id: "catalog-1",
      tenantId: "tenant-1",
      code: "TRAVEL",
      name: "Travel",
      isActive: true,
    });
    const executeRaw = jest.fn().mockResolvedValue(1);
    const transactionalClient = {
      additionalServiceCatalog: { create },
      $executeRaw: executeRaw,
    };
    const transaction = jest.fn(async (work) => work(transactionalClient));
    const repository = new PrismaAdditionalServicesRepository({
      $transaction: transaction,
    } as unknown as PrismaService);

    await repository.executeInTransaction(async (scoped) => {
      const created = await scoped.createAdditionalServiceCatalog({
        tenantId: "tenant-1",
        code: "TRAVEL",
        name: "Travel",
        displayOrder: 0,
        isActive: true,
        fiscalItemCategory: "SERVICE",
      });
      await scoped.replaceAdditionalServiceCatalogUsages(
        "tenant-1",
        created.id,
        ["TRAVEL_PACKAGE", "INTERNAL_TRIP"],
      );
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });
});
