import { Decimal } from "@prisma/client/runtime/library";
import { PrismaAdditionalServicesRepository } from "./prisma-additional-services.repository";

describe("PrismaAdditionalServicesRepository fiscal profiles", () => {
  const storedProfile = {
    id: "fiscal-1",
    tenantId: "tenant-1",
    additionalServiceCatalogId: "catalog-1",
    cabysCode: "1234567890123",
    unitOfMeasureCode: "Sp",
    taxCode: "01",
    taxRateCode: "08",
    taxPercentage: new Decimal("13.0000"),
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  it("constructs Prisma Decimal from a string and maps it back to a string", async () => {
    const create = jest.fn().mockResolvedValue(storedProfile);
    const repository = new PrismaAdditionalServicesRepository({
      additionalServiceFiscalProfile: { create },
    } as never);

    const result = await repository.createFiscalProfile({
      tenantId: "tenant-1",
      additionalServiceCatalogId: "catalog-1",
      cabysCode: "1234567890123",
      unitOfMeasureCode: "Sp",
      taxCode: "01",
      taxRateCode: "08",
      taxPercentage: "13.0000",
      isActive: true,
    });

    const decimal = create.mock.calls[0][0].data.taxPercentage;
    expect(decimal).toBeInstanceOf(Decimal);
    expect(decimal.toString()).toBe("13");
    expect(result.taxPercentage).toBe("13");
    expect(typeof result.taxPercentage).toBe("string");
  });

  it("loads catalog pricing and fiscal profile in one bounded catalog call", async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: "catalog-1",
        tenantId: "tenant-1",
        code: "TOUR",
        name: "Tour",
        isActive: true,
        pricingConfigurations: [],
        fiscalProfile: {
          id: storedProfile.id,
          cabysCode: storedProfile.cabysCode,
          unitOfMeasureCode: storedProfile.unitOfMeasureCode,
          taxCode: storedProfile.taxCode,
          taxRateCode: storedProfile.taxRateCode,
          taxPercentage: storedProfile.taxPercentage,
          isActive: storedProfile.isActive,
        },
      },
    ]);
    const repository = new PrismaAdditionalServicesRepository({
      additionalServiceCatalog: { findMany },
    } as never);

    const [result] = await repository.findAdditionalServiceCatalogs("tenant-1");

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant-1" },
        select: expect.objectContaining({ fiscalProfile: expect.any(Object) }),
      }),
    );
    expect(result.fiscalProfile?.taxPercentage).toBe("13");
  });
});
