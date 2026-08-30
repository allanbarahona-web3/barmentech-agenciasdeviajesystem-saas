import { Prisma } from "@prisma/client";
import { PrismaSalesOrderFiscalBillingRepository } from "./prisma-fiscal-billing.repository";

describe("PrismaSalesOrderFiscalBillingRepository", () => {
  it("loads only the tenant-scoped Client identity required for preparation", async () => {
    const prisma = prismaMock();
    prisma.salesOrder.findFirst.mockResolvedValue({
      id: "sales-a",
      tenantId: "tenant-a",
      orderNumber: "SO-1",
      status: "CREATED",
      sourceType: "ADDITIONAL_SERVICE_ORDER",
      customerId: "customer-a",
      customerName: "Snapshot Name",
      customerEmail: "snapshot@example.test",
      currency: "CRC",
      commercialSubtotal: decimal("100"),
      totalVat: decimal("13"),
      total: decimal("113"),
      paymentConditionType: "CASH",
      paymentTermValue: null,
      paymentTermUnit: null,
      commercialObservations: null,
      createdAt: new Date("2026-08-29T00:00:00Z"),
      lines: [],
    });
    prisma.client.findFirst.mockResolvedValue({
      id: "customer-a",
      idType: "CEDULA_JURIDICA",
      idNumber: "3101123456",
    });
    const repository = new PrismaSalesOrderFiscalBillingRepository(prisma as never);

    const result = await repository.findSalesOrder("tenant-a", "sales-a");

    expect(prisma.salesOrder.findFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", id: "sales-a" },
      include: { lines: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    });
    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: "customer-a", tenantId: "tenant-a" },
      select: { id: true, idType: true, idNumber: true },
    });
    expect(result).toMatchObject({
      customerName: "Snapshot Name",
      customerEmail: "snapshot@example.test",
      customerFiscalIdentity: {
        id: "customer-a",
        idType: "CEDULA_JURIDICA",
        idNumber: "3101123456",
      },
    });
  });

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
    )) as {
      salesOrders: Array<{ action: string; fiscalStatus: unknown }>;
    };

    expect(prisma.salesOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "tenant-a",
          sourceType: "ADDITIONAL_SERVICE_ORDER",
          status: "CREATED",
          lines: {
            some: {},
            none: {
              OR: [
                { additionalServiceCatalogId: null },
                { fiscalItemCategory: null },
              ],
            },
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
    expect(result.salesOrders[0].fiscalStatus).toBeNull();
    expect(prisma.salesOrder.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.salesOrder.count).toHaveBeenCalledTimes(1);
    expect(prisma.billingDocument.findMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["draft", "DRAFT", "NOT_SUBMITTED", "NOT_SUBMITTED", "RESUME"],
    ["processing", "SUBMITTED", "PENDING", "PROCESSING", "VIEW"],
    ["accepted", "SUBMITTED", "PROCESSED", "ACCEPTED", "VIEW"],
    ["rejected", "SUBMITTED", "PROCESSED", "REJECTED", "VIEW"],
    ["failed", "SUBMITTED", "FAILED", "PROCESSING", "VIEW"],
  ])(
    "projects authoritative %s fiscal status without per-row queries",
    async (
      _case,
      lifecycleStatus,
      providerStatus,
      taxAuthorityStatus,
      action,
    ) => {
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
          createdAt: new Date("2026-08-29T00:00:00Z"),
        },
      ]);
      prisma.salesOrder.count.mockResolvedValue(1);
      prisma.billingDocument.findMany.mockResolvedValue([
        {
          id: "document-a",
          sourceId: "sales-a",
          internalNumber: "BD-SO-sales-a",
          lifecycleStatus,
          providerStatus,
          taxAuthorityStatus,
          documentTypeCode: "01",
        },
      ]);
      const repository = new PrismaSalesOrderFiscalBillingRepository(
        prisma as never,
      );

      const result = await repository.listEligibleSalesOrders(
        "tenant-a",
        1,
        20,
      );

      expect(result.salesOrders[0]).toMatchObject({
        action,
        existingPrimaryDocument: {
          id: "document-a",
          lifecycleStatus,
        },
        fiscalStatus: {
          lifecycleStatus,
          providerStatus,
          taxAuthorityStatus,
        },
      });
      expect(prisma.salesOrder.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.salesOrder.count).toHaveBeenCalledTimes(1);
      expect(prisma.billingDocument.findMany).toHaveBeenCalledTimes(1);
    },
  );

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
    client: { findFirst: jest.fn() },
  };
}

function decimal(value: string) {
  return new Prisma.Decimal(value);
}
