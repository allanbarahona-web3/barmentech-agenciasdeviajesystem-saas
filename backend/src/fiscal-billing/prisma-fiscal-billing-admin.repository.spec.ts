import { PrismaFiscalBillingAdminRepository } from "./prisma-fiscal-billing-admin.repository";

describe("PrismaFiscalBillingAdminRepository", () => {
  it("scopes reads to the authenticated tenant unique key", async () => {
    const prisma = prismaMock();
    prisma.tenantBillingConfiguration.findUnique.mockResolvedValue(null);
    const repository = new PrismaFiscalBillingAdminRepository(prisma as never);

    await repository.findConfiguration("tenant-a");

    expect(prisma.tenantBillingConfiguration.findUnique).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a" },
    });
  });

  it("upserts by tenantId and never accepts a tenant identity from input", async () => {
    const prisma = prismaMock();
    prisma.tenantBillingConfiguration.upsert.mockResolvedValue({});
    const repository = new PrismaFiscalBillingAdminRepository(prisma as never);

    await repository.upsertConfiguration("tenant-a", {
      billingEnabled: true,
      countryCode: "CR",
    });

    expect(prisma.tenantBillingConfiguration.upsert).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a" },
      create: {
        tenantId: "tenant-a",
        billingEnabled: true,
        countryCode: "CR",
      },
      update: { billingEnabled: true, countryCode: "CR" },
    });
  });
});

function prismaMock() {
  return {
    tenantBillingConfiguration: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };
}
