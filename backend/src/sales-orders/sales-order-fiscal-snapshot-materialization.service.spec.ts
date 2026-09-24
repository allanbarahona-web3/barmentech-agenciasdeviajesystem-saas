import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { SalesOrderFiscalSnapshotMaterializationService } from "./sales-order-fiscal-snapshot-materialization.service";

const tenantId = "tenant-a";
const fiscalSelection = {
  cabysCode: "1234567890123",
  unitOfMeasureCode: "Sp",
  taxCode: "01",
  taxRateCode: "08",
  taxPercentage: "13.0000",
};

describe("SalesOrderFiscalSnapshotMaterializationService", () => {
  it("persists a valid frozen fiscal tuple with exact decimal values", async () => {
    const c = context();
    c.tx.tenantFiscalClassification.findMany.mockResolvedValue([{ id: "classification-a" }]);

    const result = await c.service.materialize(tenantId, input());

    expect(result).toMatchObject({ reusedExisting: false, orderNumber: expect.stringMatching(/^SO-\d{4}-000001$/) });
    expect(c.fiscal.resolveFiscalSelection).toHaveBeenCalledWith(tenantId, fiscalIdentity(), false);
    expect(c.tx.tenantFiscalClassification.findMany).toHaveBeenCalledWith({
      where: { tenantId, id: { in: ["classification-a"] } }, select: { id: true },
    });
    const lineInsert = findSqlCall(c.tx.$executeRaw, 'INSERT INTO "sales_order_lines"');
    expect(lineInsert).toBeDefined();
    expect(lineInsert?.slice(1)).toEqual(expect.arrayContaining([
      "classification-a",
      "Detalle fiscal congelado",
      "1234567890123",
      "Sp",
      "01",
      "08",
      decimal("13.0000"),
      decimal("100.00000"),
      decimal("13.00000"),
      decimal("113.00000"),
    ]));
  });

  it("casts null service details and empty participants as jsonb", async () => {
    const c = context();
    c.tx.tenantFiscalClassification.findMany.mockResolvedValue([{ id: "classification-a" }]);

    await c.service.materialize(tenantId, input());

    const lineInsert = findSqlCall(c.tx.$executeRaw, 'INSERT INTO "sales_order_lines"');
    expect(lineInsert).toBeDefined();
    const values = lineInsert!.slice(1);
    expect(values[14]).toBe("null");
    expect(values[20]).toBe("[]");
    expect(lineInsert![0][15]).toContain("::jsonb");
    expect(lineInsert![0][21]).toContain("::jsonb");
  });

  it("accepts an optional same-tenant fiscal classification as provenance only", async () => {
    const c = context();
    c.tx.tenantFiscalClassification.findMany.mockResolvedValue([{ id: "classification-a" }]);

    await c.service.materialize(tenantId, input());

    expect(findSqlCall(c.tx.$executeRaw, 'INSERT INTO "sales_order_lines"')?.slice(1)).toContain("classification-a");
  });

  it("rejects a classification that does not belong to the tenant", async () => {
    const c = context();
    c.tx.tenantFiscalClassification.findMany.mockResolvedValue([]);

    await expect(c.service.materialize(tenantId, input())).rejects.toMatchObject({
      response: expect.objectContaining({ message: "SALES_ORDER_FISCAL_CLASSIFICATION_TENANT_INVALID" }),
    });
    expect(findSqlCall(c.tx.$executeRaw, 'INSERT INTO "sales_order_lines"')).toBeUndefined();
  });

  it("rejects an invalid CABYS before persistence", async () => {
    const c = context();
    c.fiscal.resolveFiscalSelection.mockRejectedValue(new BadRequestException("FISCAL_CATALOG_ENTRY_NOT_FOUND"));

    await expect(c.service.materialize(tenantId, input())).rejects.toBeInstanceOf(BadRequestException);
    expect(c.tx.tenantFiscalClassification.findMany).not.toHaveBeenCalled();
    expect(findSqlCall(c.tx.$executeRaw, 'INSERT INTO "sales_orders"')).toBeUndefined();
  });

  it("rejects an invalid UoM or tax-rate combination before persistence", async () => {
    const c = context();
    c.fiscal.resolveFiscalSelection.mockRejectedValue(new BadRequestException("FISCAL_CATALOG_ENTRY_NOT_FOUND"));

    await expect(c.service.materialize(tenantId, input({ unitOfMeasureCode: "INVALID" }))).rejects.toBeInstanceOf(BadRequestException);
    expect(findSqlCall(c.tx.$executeRaw, 'INSERT INTO "sales_orders"')).toBeUndefined();
  });

  it("does not retain a live source profile dependency after snapshot persistence", async () => {
    const c = context();
    c.tx.tenantFiscalClassification.findMany.mockResolvedValue([{ id: "classification-a" }]);
    const sourceProfile = { ...fiscalSelection };
    const command = input({
      cabysCode: sourceProfile.cabysCode,
      unitOfMeasureCode: sourceProfile.unitOfMeasureCode,
      taxCode: sourceProfile.taxCode,
      taxRateCode: sourceProfile.taxRateCode,
    });

    await c.service.materialize(tenantId, command);
    sourceProfile.taxRateCode = "11";
    sourceProfile.taxPercentage = "0.0000";

    const lineInsert = findSqlCall(c.tx.$executeRaw, 'INSERT INTO "sales_order_lines"');
    expect(lineInsert?.slice(1)).toEqual(expect.arrayContaining(["08", decimal("13.0000")]));
    expect(c.fiscal.resolveFiscalSelection).toHaveBeenCalledTimes(1);
  });

  it("returns the existing Sales Order for the same tenant source identity", async () => {
    const c = context();
    c.tx.salesOrder.findFirst.mockResolvedValue({
      id: "sales-existing",
      orderNumber: "SO-2026-000007",
    });

    await expect(c.service.materialize(tenantId, input())).resolves.toEqual({
      salesOrderId: "sales-existing",
      orderNumber: "SO-2026-000007",
      reusedExisting: true,
    });
    expect(c.fiscal.resolveFiscalSelection).not.toHaveBeenCalled();
    expect(findSqlCall(c.tx.$executeRaw, 'INSERT INTO "sales_orders"')).toBeUndefined();
  });

  it("rejects a customer outside the tenant before Sales Order persistence", async () => {
    const c = context();
    c.tx.client.findFirst.mockResolvedValue(null);
    c.tx.tenantFiscalClassification.findMany.mockResolvedValue([{ id: "classification-a" }]);

    await expect(c.service.materialize(tenantId, input())).rejects.toMatchObject({
      response: expect.objectContaining({ message: "SALES_ORDER_CUSTOMER_TENANT_INVALID" }),
    });
    expect(findSqlCall(c.tx.$executeRaw, 'INSERT INTO "sales_orders"')).toBeUndefined();
  });

  it("has no Additional Services or Billing dependency", async () => {
    const c = context();
    c.tx.tenantFiscalClassification.findMany.mockResolvedValue([{ id: "classification-a" }]);

    await expect(c.service.materialize(tenantId, input())).resolves.toMatchObject({ reusedExisting: false });
    expect(Object.keys(c)).toEqual(expect.arrayContaining(["service", "fiscal", "tx"]));
  });
});

function context() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ next: BigInt(1) }]),
    salesOrder: { findFirst: jest.fn().mockResolvedValue(null) },
    client: { findFirst: jest.fn().mockResolvedValue({ id: "customer-a" }) },
    tenantFiscalClassification: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = { $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)) };
  const fiscal = { resolveFiscalSelection: jest.fn().mockResolvedValue(fiscalSelection) };
  return { service: new SalesOrderFiscalSnapshotMaterializationService(prisma as never, fiscal as never), tx, fiscal };
}

function input(lineOverrides: Record<string, unknown> = {}) {
  return {
    sourceType: "CUSTOM_QUOTATION",
    sourceId: "quotation-a",
    customerId: "customer-a",
    customerName: "Cliente A",
    customerEmail: "cliente@example.com",
    currency: "USD" as const,
    commercialSubtotal: decimal("100.00000"),
    totalVat: decimal("13.00000"),
    total: decimal("113.00000"),
    actor: { userId: "admin-a", name: "Admin A" },
    lines: [{
      serviceCode: "PRIVATE-TRANSPORT",
      description: "Transporte privado",
      fiscalItemCategory: "SERVICE" as const,
      fiscalDescription: "Detalle fiscal congelado",
      ...fiscalSelection,
      fiscalTaxPercentage: decimal("13.0000"),
      fiscalClassificationId: "classification-a",
      subtotal: decimal("100.00000"),
      vatPercentage: decimal("13.0000"),
      vatAmount: decimal("13.00000"),
      total: decimal("113.00000"),
      participants: [],
      ...lineOverrides,
    }],
  };
}

function decimal(value: string) {
  return new Prisma.Decimal(value);
}

function fiscalIdentity() {
  return {
    cabysCode: fiscalSelection.cabysCode,
    unitOfMeasureCode: fiscalSelection.unitOfMeasureCode,
    taxCode: fiscalSelection.taxCode,
    taxRateCode: fiscalSelection.taxRateCode,
  };
}

function findSqlCall(mock: jest.Mock, fragment: string) {
  return mock.mock.calls.find((call) => Array.isArray(call[0]) && call[0].join("").includes(fragment));
}
