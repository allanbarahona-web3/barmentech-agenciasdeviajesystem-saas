import { ConflictException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SalesOrderConversionService } from "./sales-order-conversion.service";

describe("SalesOrderConversionService", () => {
  it("rejects a source outside the authenticated tenant", async () => {
    const { service, query } = setup([[]]);

    await expect(
      service.convertAdditionalServiceOrder("tenant-b", "proposal-a", actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("validates the persisted commercial status", async () => {
    const { service, execute } = setup([[proposal({ commercialStatus: "SENT" })]]);

    await expect(
      service.convertAdditionalServiceOrder("tenant-a", "proposal-a", actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(execute).toHaveBeenCalledTimes(1); // advisory lock only
  });

  it("returns the existing sales order without inserting a duplicate", async () => {
    const existing = salesOrder();
    const { service, execute, query } = setup([
      [proposal({ commercialStatus: "APPROVED" })],
      [existing],
    ]);

    const result = await service.convertAdditionalServiceOrder(
      "tenant-a",
      "proposal-a",
      actor,
    );

    expect(result.orderNumber).toBe("SO-2026-000001");
    expect(execute).toHaveBeenCalledTimes(1); // no INSERT after lock
    expect(String(execute.mock.calls)).not.toMatch(/UPDATE/i);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("creates a customer-facing snapshot without supplier or margin fields", async () => {
    const existing = salesOrder();
    const acceptedLine = {
      additionalServiceCatalogId: "catalog-baggage",
      fiscalItemCategory: "SERVICE",
      serviceCode: "BAGGAGE",
      serviceName: "Equipaje",
      serviceDetailsVersion: 1,
      serviceDetails: { pieceQuantity: 1 },
      commercialNotes: "Incluido",
      subtotal: "100.0000",
      vatPercentage: "13.0000",
      vatAmount: "13.0000",
      total: "113.0000",
      participants: [{ fullName: "Traveler A" }],
    };
    const { service, execute } = setup([
      [proposal({ commercialStatus: "APPROVED" })],
      [],
      [acceptedLine],
      [{ next: 1n }],
      [existing],
    ]);

    await service.convertAdditionalServiceOrder("tenant-a", "proposal-a", actor);

    expect(execute).toHaveBeenCalledTimes(4);
    const lineInsertSql = String(execute.mock.calls[3][0]);
    expect(lineInsertSql).toContain('"additionalServiceCatalogId"');
    expect(lineInsertSql).toContain('"fiscalItemCategory"');
    expect(execute.mock.calls[3]).toEqual(
      expect.arrayContaining([
        "catalog-baggage",
        "SERVICE",
        "BAGGAGE",
        "Equipaje",
        1,
        JSON.stringify({ pieceQuantity: 1 }),
        "Incluido",
        "100.0000",
        "13.0000",
        "113.0000",
        JSON.stringify([{ fullName: "Traveler A" }]),
      ]),
    );
    expect(lineInsertSql).toContain('"participants"');
    expect(lineInsertSql).not.toMatch(/supplier|margin|cost/i);
  });

  it("copies mixed SERVICE and MERCHANDISE categories without per-line queries", async () => {
    const { service, execute, query } = setup([
      [proposal({ commercialStatus: "APPROVED" })],
      [],
      [
        sourceLine({
          additionalServiceCatalogId: "catalog-baggage",
          fiscalItemCategory: "SERVICE",
          serviceCode: "BAGGAGE",
          serviceName: "Equipaje",
        }),
        sourceLine({
          additionalServiceCatalogId: "catalog-transfer",
          fiscalItemCategory: "MERCHANDISE",
          serviceCode: "TRANSFER",
          serviceName: "Traslado",
        }),
      ],
      [{ next: 1n }],
      [salesOrder()],
    ]);

    await service.convertAdditionalServiceOrder("tenant-a", "proposal-a", actor);

    expect(execute).toHaveBeenCalledTimes(5);
    expect(execute.mock.calls[3]).toContain("catalog-baggage");
    expect(execute.mock.calls[3]).not.toContain("catalog-transfer");
    expect(execute.mock.calls[3]).toContain("SERVICE");
    expect(execute.mock.calls[4]).toContain("catalog-transfer");
    expect(execute.mock.calls[4]).not.toContain("catalog-baggage");
    expect(execute.mock.calls[4]).toContain("MERCHANDISE");
    expect(query).toHaveBeenCalledTimes(5);
  });

  it("rejects a missing source catalog identity before Sales Order persistence", async () => {
    const { service, execute, query } = setup([
      [proposal({ commercialStatus: "APPROVED" })],
      [],
      [sourceLine({ additionalServiceCatalogId: null })],
    ]);

    await expect(
      service.convertAdditionalServiceOrder("tenant-a", "proposal-a", actor),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "SALES_ORDER_LINE_CATALOG_IDENTITY_MISSING",
      }),
    });
    expect(query).toHaveBeenCalledTimes(3);
    expect(execute).toHaveBeenCalledTimes(1); // advisory lock only
  });

  it("uses the tenant-scoped source line identity without a catalog lookup", async () => {
    const { service, query, execute } = setup([
      [proposal({ commercialStatus: "APPROVED" })],
      [],
      [sourceLine({ additionalServiceCatalogId: "tenant-a-catalog" })],
      [{ next: 1n }],
      [salesOrder()],
    ]);

    await service.convertAdditionalServiceOrder("tenant-a", "proposal-a", actor);

    const sourceLinesSql = String(query.mock.calls[2][0]);
    expect(sourceLinesSql).toContain('l."tenantId" =');
    expect(sourceLinesSql).toContain('l."additionalServiceCatalogId"');
    expect(sourceLinesSql).toContain('LEFT JOIN "additional_service_catalogs" catalog');
    expect(sourceLinesSql).toContain('catalog."tenantId" = l."tenantId"');
    expect(query).toHaveBeenCalledTimes(5);
    expect(execute.mock.calls[3]).toContain("tenant-a-catalog");
  });

  it.each([null, undefined, "UNSUPPORTED"])(
    "rejects an invalid fiscal item category before Sales Order persistence",
    async (fiscalItemCategory) => {
      const { service, execute, query } = setup([
        [proposal({ commercialStatus: "APPROVED" })],
        [],
        [sourceLine({ fiscalItemCategory })],
      ]);

      await expect(
        service.convertAdditionalServiceOrder("tenant-a", "proposal-a", actor),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: "SALES_ORDER_LINE_FISCAL_ITEM_CATEGORY_INVALID",
        }),
      });
      expect(query).toHaveBeenCalledTimes(3);
      expect(execute).toHaveBeenCalledTimes(1); // source lock only
    },
  );
});

const actor = { id: "user-a", fullName: "Agent A" };

function proposal(overrides: Record<string, unknown>) {
  return {
    id: "proposal-a",
    commercialStatus: "APPROVED",
    quoteCustomerId: "customer-a",
    customerName: "Customer A",
    customerEmail: "customer@example.test",
    quotationCurrency: "USD",
    commercialSubtotal: "100.0000",
    totalVat: "13.0000",
    totalSellingPrice: "113.0000",
    paymentConditionType: "CREDIT",
    paymentTermValue: 30,
    paymentTermUnit: "DAYS",
    commercialObservations: "Accepted",
    ...overrides,
  };
}

function salesOrder() {
  return {
    id: "sales-a",
    orderNumber: "SO-2026-000001",
    status: "CREATED",
    currency: "USD",
    commercialSubtotal: "100.0000",
    totalVat: "13.0000",
    total: "113.0000",
    paymentConditionType: "CREDIT",
    paymentTermValue: 30,
    paymentTermUnit: "DAYS",
    commercialObservations: "Accepted",
    customerName: "Customer A",
    customerEmail: "customer@example.test",
    createdAt: new Date(),
    lines: [],
  };
}

function sourceLine(overrides: Record<string, unknown> = {}) {
  return {
    additionalServiceCatalogId: "catalog-a",
    fiscalItemCategory: "SERVICE",
    serviceCode: "BAGGAGE",
    serviceName: "Equipaje",
    serviceDetailsVersion: 1,
    serviceDetails: { pieceQuantity: 1 },
    commercialNotes: "Incluido",
    subtotal: "100.0000",
    vatPercentage: "13.0000",
    vatAmount: "13.0000",
    total: "113.0000",
    participants: [{ fullName: "Traveler A" }],
    ...overrides,
  };
}

function setup(queryResults: unknown[][]) {
  const query = jest.fn();
  queryResults.forEach((result) => query.mockResolvedValueOnce(result));
  const execute = jest.fn().mockResolvedValue(1);
  const tx = { $queryRaw: query, $executeRaw: execute };
  const prisma = {
    $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    $queryRaw: query,
  } as unknown as PrismaService;
  return {
    service: new SalesOrderConversionService(prisma),
    query,
    execute,
  };
}
