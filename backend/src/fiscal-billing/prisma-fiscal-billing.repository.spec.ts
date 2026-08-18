import { Prisma } from "@prisma/client";
import { PrismaSalesOrderFiscalBillingRepository } from "./prisma-fiscal-billing.repository";

describe("PrismaSalesOrderFiscalBillingRepository", () => {
  it("lists eligible rows with bounded queries and exact tenant/source/status filters", async () => {
    const prisma = prismaMock();
    prisma.salesOrder.findMany.mockResolvedValue([
      {
        id: "sales-a",
        orderNumber: "SO-1",
        status: "CREATED",
        sourceType: "ADDITIONAL_SERVICE_ORDER",
        customerName: "Customer",
        customerEmail: null,
        currency: "CRC",
        commercialSubtotal: decimal("100"),
        totalVat: decimal("13"),
        total: decimal("113"),
        createdAt: new Date(),
      },
    ]);
    prisma.salesOrder.count.mockResolvedValue(1);
    prisma.billingDocument.findMany.mockResolvedValue([]);
    const repository = new PrismaSalesOrderFiscalBillingRepository(prisma as never);

    const result = (await repository.listEligibleSalesOrders(
      "tenant-a",
      1,
      20,
    )) as { salesOrders: Array<{ action: string }> };

    expect(prisma.salesOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "tenant-a",
          sourceType: "ADDITIONAL_SERVICE_ORDER",
          status: "CREATED",
          lines: {
            some: {},
            none: { additionalServiceCatalogId: null },
          },
        },
      }),
    );
    expect(prisma.billingDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-a",
          sourceType: "SALES_ORDER",
          sourceRole: "PRIMARY",
        }),
      }),
    );
    expect(result.salesOrders[0].action).toBe("START");
    expect(prisma.salesOrder.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.salesOrder.count).toHaveBeenCalledTimes(1);
    expect(prisma.billingDocument.findMany).toHaveBeenCalledTimes(1);
  });

});

function prismaMock() {
  return {
    salesOrder: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
    billingDocument: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    tenantBillingConfiguration: { findUnique: jest.fn() },
    additionalServiceFiscalProfile: { findMany: jest.fn() },
    fiscalIssuer: { findMany: jest.fn(), findFirst: jest.fn() },
  };
}

function decimal(value: string) {
  return new Prisma.Decimal(value);
}
