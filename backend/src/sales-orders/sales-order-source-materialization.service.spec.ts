import { Prisma } from "@prisma/client";
import {
  SalesOrderSourceMaterializationService,
  type SourceNeutralSalesOrderCommand,
} from "./sales-order-source-materialization.service";

describe("SalesOrderSourceMaterializationService", () => {
  it("forwards a source-neutral approved commercial command with its complete frozen fiscal line", async () => {
    const materialize = jest.fn().mockResolvedValue({
      salesOrderId: "sales-a",
      orderNumber: "SO-2026-000001",
      reusedExisting: false,
    });
    const service = new SalesOrderSourceMaterializationService({
      materialize,
    } as never);
    const command = sourceNeutralCommand();
    const { source, ...order } = command;

    await expect(service.materialize({ tenantId: "tenant-a" }, command)).resolves.toEqual({
      salesOrderId: "sales-a",
      orderNumber: "SO-2026-000001",
      reusedExisting: false,
    });

    expect(materialize).toHaveBeenCalledWith("tenant-a", {
      ...order,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
    });
    expect(materialize.mock.calls[0][1].lines[0]).toMatchObject({
      fiscalDescription: "Transporte privado",
      cabysCode: "1234567890123",
      unitOfMeasureCode: "Sp",
      taxCode: "01",
      taxRateCode: "08",
    });
    expect(materialize.mock.calls[0][1].lines[0].fiscalTaxPercentage.equals("13.0000")).toBe(true);
  });

  it("returns the existing source-idempotent Sales Order result without adding a second path", async () => {
    const materialize = jest.fn().mockResolvedValue({
      salesOrderId: "sales-a",
      orderNumber: "SO-2026-000001",
      reusedExisting: true,
    });
    const service = new SalesOrderSourceMaterializationService({
      materialize,
    } as never);

    const result = await service.materialize(
      { tenantId: "tenant-a" },
      sourceNeutralCommand(),
    );

    expect(result.reusedExisting).toBe(true);
    expect(materialize).toHaveBeenCalledTimes(1);
  });

  it("composes with a caller-owned tenant transaction without changing source idempotency", async () => {
    const materializeInTransaction = jest.fn().mockResolvedValue({
      salesOrderId: "sales-a", orderNumber: "SO-2026-000001", reusedExisting: false,
    });
    const service = new SalesOrderSourceMaterializationService({
      materializeInTransaction,
    } as never);
    const transaction = {} as never;
    const command = sourceNeutralCommand();
    const { source, ...order } = command;

    await expect(service.materializeInTransaction(transaction, { tenantId: "tenant-a" }, command)).resolves.toEqual({
      salesOrderId: "sales-a", orderNumber: "SO-2026-000001", reusedExisting: false,
    });
    expect(materializeInTransaction).toHaveBeenCalledWith(transaction, "tenant-a", {
      ...order, sourceType: source.sourceType, sourceId: source.sourceId,
    });
  });

  it("rejects a source resolved from another tenant before materialization", async () => {
    const materialize = jest.fn();
    const service = new SalesOrderSourceMaterializationService({
      materialize,
    } as never);
    const command = sourceNeutralCommand();
    command.source.tenantId = "tenant-b";

    await expect(
      service.materialize({ tenantId: "tenant-a" }, command),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ message: "SALES_ORDER_SOURCE_TENANT_INVALID" }),
    });
    expect(materialize).not.toHaveBeenCalled();
  });

  it("has no Additional Services, Billing, or Hacienda dependency", () => {
    const materialize = jest.fn();
    const service = new SalesOrderSourceMaterializationService({
      materialize,
    } as never);

    expect(service).toBeInstanceOf(SalesOrderSourceMaterializationService);
  });
});

function sourceNeutralCommand(): SourceNeutralSalesOrderCommand {
  return {
    source: {
      sourceType: "CUSTOM_QUOTATION",
      sourceId: "quotation-a",
      tenantId: "tenant-a",
    },
    customerId: "customer-a",
    customerName: "Cliente A",
    customerEmail: "cliente@example.test",
    currency: "USD",
    commercialSubtotal: decimal("100.0000"),
    totalVat: decimal("13.0000"),
    total: decimal("113.0000"),
    paymentConditionType: "CASH",
    paymentTermValue: null,
    paymentTermUnit: null,
    commercialObservations: "Válida hasta la fecha indicada por la fuente.",
    actor: { userId: "admin-a", name: "Admin A" },
    lines: [
      {
        serviceCode: "PRIVATE-TRANSPORT",
        description: "Transporte privado",
        fiscalItemCategory: "SERVICE",
        fiscalDescription: "Transporte privado",
        cabysCode: "1234567890123",
        unitOfMeasureCode: "Sp",
        taxCode: "01",
        taxRateCode: "08",
        fiscalTaxPercentage: decimal("13.0000"),
        fiscalClassificationId: "classification-a",
        subtotal: decimal("100.0000"),
        vatPercentage: decimal("13.0000"),
        vatAmount: decimal("13.0000"),
        total: decimal("113.0000"),
        participants: [],
      },
    ],
  };
}

function decimal(value: string) {
  return new Prisma.Decimal(value);
}
