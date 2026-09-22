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

  it("preserves five-decimal monetary authority while keeping tax percentages at four decimals", async () => {
    const prisma = prismaMock();
    prisma.salesOrder.findFirst.mockResolvedValue({
      id: "sales-a",
      tenantId: "tenant-a",
      orderNumber: "SO-1",
      status: "CREATED",
      sourceType: "CUSTOM_QUOTATION_VERSION",
      customerId: null,
      customerName: "Snapshot Name",
      customerEmail: null,
      currency: "USD",
      commercialSubtotal: decimal("1450.12345"),
      totalVat: decimal("188.51605"),
      total: decimal("1638.63950"),
      paymentConditionType: "CASH",
      paymentTermValue: null,
      paymentTermUnit: null,
      commercialObservations: null,
      createdAt: new Date("2026-08-29T00:00:00Z"),
      lines: [
        {
          id: "line-a",
          fiscalItemCategory: "SERVICE",
          fiscalDescription: "Paquete turístico personalizado",
          cabysCode: "1234567890123",
          unitOfMeasureCode: "Sp",
          taxCode: "01",
          taxRateCode: "08",
          fiscalTaxPercentage: decimal("13"),
          subtotal: decimal("1450.12345"),
          vatPercentage: decimal("13"),
          vatAmount: decimal("188.51605"),
          total: decimal("1638.63950"),
        },
      ],
    });
    const repository = new PrismaSalesOrderFiscalBillingRepository(prisma as never);

    const result = await repository.findSalesOrder("tenant-a", "sales-a");

    expect(result).toMatchObject({
      commercialSubtotal: "1450.12345",
      totalVat: "188.51605",
      total: "1638.63950",
      lines: [
        {
          subtotal: "1450.12345",
          vatPercentage: "13.0000",
          vatAmount: "188.51605",
          total: "1638.63950",
          fiscalTaxPercentage: "13.0000",
        },
      ],
    });
  });

  it("lists legacy Additional Services rows with bounded tenant-scoped queries", async () => {
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
        where: expect.objectContaining({
          tenantId: "tenant-a",
          status: "CREATED",
          OR: expect.arrayContaining([
            {
              sourceType: "ADDITIONAL_SERVICE_ORDER",
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
          ]),
        }),
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
    expect(result.salesOrders[0]).toMatchObject({
      commercialSubtotal: "100.00000",
      totalVat: "13.00000",
      total: "113.00000",
    });
    expect(prisma.salesOrder.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.salesOrder.count).toHaveBeenCalledTimes(1);
    expect(prisma.billingDocument.findMany).toHaveBeenCalledTimes(1);
  });

  it("includes a complete frozen source-neutral order without an Additional Services dependency", async () => {
    const prisma = prismaMock();
    prisma.salesOrder.findMany.mockResolvedValue([
      eligibleOrder({ sourceType: "CUSTOM_QUOTATION_VERSION" }),
    ]);
    prisma.salesOrder.count.mockResolvedValue(1);
    prisma.billingDocument.findMany.mockResolvedValue([]);
    const repository = new PrismaSalesOrderFiscalBillingRepository(prisma as never);

    const result = await repository.listEligibleSalesOrders("tenant-a", 1, 20);

    expect(result.salesOrders).toHaveLength(1);
    expect(result.salesOrders[0]).toMatchObject({
      sourceType: "CUSTOM_QUOTATION_VERSION",
      action: "START",
    });
    const where = prisma.salesOrder.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({
      sourceType: { not: "ADDITIONAL_SERVICE_ORDER" },
      lines: {
        some: {},
        none: {
          OR: [
            { fiscalItemCategory: null },
            { fiscalItemCategory: { notIn: ["SERVICE", "MERCHANDISE"] } },
            { fiscalDescription: null },
            { cabysCode: null },
            { unitOfMeasureCode: null },
            { taxCode: null },
            { taxRateCode: null },
            { fiscalTaxPercentage: null },
          ],
        },
      },
    });
  });

  it("preserves five-decimal totals in the eligible-order list", async () => {
    const prisma = prismaMock();
    prisma.salesOrder.findMany.mockResolvedValue([
      eligibleOrder({
        commercialSubtotal: decimal("1450.12345"),
        totalVat: decimal("188.51605"),
        total: decimal("1638.63950"),
      }),
    ]);
    prisma.salesOrder.count.mockResolvedValue(1);
    prisma.billingDocument.findMany.mockResolvedValue([]);
    const repository = new PrismaSalesOrderFiscalBillingRepository(prisma as never);

    const result = await repository.listEligibleSalesOrders("tenant-a", 1, 20);

    expect(result.salesOrders[0]).toMatchObject({
      commercialSubtotal: "1450.12345",
      totalVat: "188.51605",
      total: "1638.63950",
    });
  });

  it("excludes missing and partial frozen tuples from the source-neutral eligibility predicate", async () => {
    const prisma = prismaMock();
    prisma.salesOrder.findMany.mockResolvedValue([]);
    prisma.salesOrder.count.mockResolvedValue(0);
    const repository = new PrismaSalesOrderFiscalBillingRepository(prisma as never);

    await repository.listEligibleSalesOrders("tenant-a", 1, 20);

    const sourceNeutral = prisma.salesOrder.findMany.mock.calls[0][0].where.OR.find(
      (clause: { sourceType?: unknown }) =>
        typeof clause.sourceType === "object" && clause.sourceType !== null,
    );
    expect(sourceNeutral.lines.none.OR).toEqual(
      expect.arrayContaining([
        { fiscalItemCategory: null },
        { fiscalDescription: null },
        { cabysCode: null },
        { unitOfMeasureCode: null },
        { taxCode: null },
        { taxRateCode: null },
        { fiscalTaxPercentage: null },
      ]),
    );
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

function eligibleOrder(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}
