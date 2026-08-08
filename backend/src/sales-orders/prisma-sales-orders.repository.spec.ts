import { PrismaService } from "../prisma/prisma.service";
import { PrismaSalesOrdersRepository } from "./prisma-sales-orders.repository";

describe("PrismaSalesOrdersRepository", () => {
  it("lists tenant-owned orders with pagination, search and filters without loading lines", async () => {
    const { repository, findMany, count } = setup();
    findMany.mockResolvedValue([listRow()]);
    count.mockResolvedValue(21);

    const result = await repository.findPage("tenant-1", {
      page: 2,
      pageSize: 10,
      search: "SO-2026",
      status: "CREATED",
      currency: "USD",
      paymentConditionType: "CREDIT",
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-1",
          status: "CREATED",
          currency: "USD",
          paymentConditionType: "CREDIT",
          OR: expect.arrayContaining([
            expect.objectContaining({ orderNumber: expect.any(Object) }),
            expect.objectContaining({ customerName: expect.any(Object) }),
            expect.objectContaining({ customerEmail: expect.any(Object) }),
          ]),
        }),
        skip: 10,
        take: 10,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
    const listSelection = findMany.mock.calls[0][0].select;
    expect(listSelection).not.toHaveProperty("lines");
    expect(listSelection).not.toHaveProperty("tenantId");
    expect(count).toHaveBeenCalledWith({
      where: findMany.mock.calls[0][0].where,
    });
    expect(result).toEqual(
      expect.objectContaining({ page: 2, pageSize: 10, total: 21, totalPages: 3 }),
    );
    expect(result.salesOrders[0]).not.toHaveProperty("tenantId");
    expect(result.salesOrders[0]).not.toHaveProperty("lines");
  });

  it("loads detail and lines by id and tenant using only persisted snapshots", async () => {
    const { repository, findFirst } = setup();
    findFirst.mockResolvedValue(detailRow());

    const result = await repository.findById("tenant-1", "sales-order-1");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sales-order-1", tenantId: "tenant-1" },
      }),
    );
    const selection = findFirst.mock.calls[0][0].select;
    expect(selection).not.toHaveProperty("tenantId");
    expect(selection).not.toHaveProperty("additionalServiceOrder");
    expect(selection.lines.select).toEqual(
      expect.objectContaining({ participants: true, serviceDetails: true }),
    );
    expect(result?.lines[0]).toEqual(
      expect.objectContaining({
        serviceCode: "BAGGAGE",
        participants: [{ fullName: "Customer One", role: "HOLDER" }],
      }),
    );
    expect(result).not.toHaveProperty("tenantId");
    expect(JSON.stringify(result)).not.toMatch(
      /supplier|margin|exchangeRate|pricingConfiguration/i,
    );
  });

  it("returns null when the tenant-scoped detail query finds nothing", async () => {
    const { repository, findFirst } = setup();
    findFirst.mockResolvedValue(null);
    await expect(
      repository.findById("tenant-other", "sales-order-1"),
    ).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sales-order-1", tenantId: "tenant-other" },
      }),
    );
  });
});

function setup() {
  const findMany = jest.fn();
  const count = jest.fn();
  const findFirst = jest.fn();
  const prisma = {
    salesOrder: { findMany, count, findFirst },
  } as unknown as PrismaService;
  return {
    repository: new PrismaSalesOrdersRepository(prisma),
    findMany,
    count,
    findFirst,
  };
}

function listRow() {
  return {
    id: "sales-order-1",
    orderNumber: "SO-2026-000001",
    status: "CREATED",
    customerName: "Customer One",
    customerEmail: "customer@example.test",
    currency: "USD",
    commercialSubtotal: "100.00",
    totalVat: "13.00",
    total: "113.00",
    paymentConditionType: "CREDIT",
    paymentTermValue: 30,
    paymentTermUnit: "DAYS",
    sourceType: "ADDITIONAL_SERVICE_ORDER",
    createdByName: "Agent One",
    createdAt: new Date("2026-08-08T12:00:00.000Z"),
  };
}

function detailRow() {
  return {
    ...listRow(),
    sourceId: "source-1",
    customerId: "customer-1",
    commercialObservations: "Accepted conditions",
    createdByUserId: "agent-1",
    updatedAt: new Date("2026-08-08T12:00:00.000Z"),
    lines: [
      {
        id: "line-1",
        serviceCode: "BAGGAGE",
        serviceName: "Equipaje",
        serviceDetailsVersion: 1,
        serviceDetails: { baggageTypes: ["CARRY_ON"] },
        commercialNotes: null,
        subtotal: "100.00",
        vatPercentage: "13.00",
        vatAmount: "13.00",
        total: "113.00",
        participants: [{ fullName: "Customer One", role: "HOLDER" }],
      },
    ],
  };
}
