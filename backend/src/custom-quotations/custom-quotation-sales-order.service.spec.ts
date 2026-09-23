import { ConflictException, NotFoundException } from "@nestjs/common";
import { CustomQuotationSalesOrderService } from "./custom-quotation-sales-order.service";

const actor = { userId: "agent-a", name: "Agent A" };

describe("CustomQuotationSalesOrderService", () => {
  it("materializes one source-neutral Sales Order from the accepted immutable version", async () => {
    const c = context();
    c.tx.customQuotationVersion.findFirst.mockResolvedValue(version());
    c.salesOrders.materializeInTransaction.mockResolvedValue({ salesOrderId: "sales-a", orderNumber: "SO-2026-000001", reusedExisting: false });

    await expect(c.service.materialize("tenant-a", "quotation-a", "version-a", actor)).resolves.toEqual({
      salesOrderId: "sales-a", orderNumber: "SO-2026-000001", reusedExisting: false,
    });

    expect(c.salesOrders.materializeInTransaction).toHaveBeenCalledWith(c.tx, { tenantId: "tenant-a" }, expect.objectContaining({
      source: { tenantId: "tenant-a", sourceType: "CUSTOM_QUOTATION_VERSION", sourceId: "version-a" },
      customerId: "customer-a", customerName: "Cliente A", customerEmail: "cliente@example.test",
      currency: "USD", paymentConditionType: "CREDIT", paymentTermValue: 30, paymentTermUnit: "DAYS",
      commercialObservations: "Incluye traslados",
    }));
    const command = c.salesOrders.materializeInTransaction.mock.calls[0][2];
    expect(command.total.toFixed(5)).toBe("1450.12345");
    expect(command.lines).toHaveLength(1);
    expect(command.lines[0]).toMatchObject({
      serviceCode: "CUSTOM_QUOTATION", description: "Paquete turístico personalizado",
      fiscalDescription: "Paquete turístico personalizado", fiscalItemCategory: "SERVICE",
      cabysCode: "1234567890123", unitOfMeasureCode: "Unid", taxCode: "01", taxRateCode: "08",
      fiscalTaxPercentage: expect.anything(), fiscalClassificationId: "fiscal-a", participants: [],
    });
    expect(command.lines[0].fiscalTaxPercentage.toFixed(4)).toBe("13.0000");
    expect(command.lines[0].total.toFixed(5)).toBe("1450.12345");
    expect(c.tx.customQuotationVersion.updateMany).toHaveBeenCalledWith({
      where: { id: "version-a", tenantId: "tenant-a", customQuotationId: "quotation-a", salesOrderId: null },
      data: { salesOrderId: "sales-a" },
    });
    expect(c.tx.tenantFiscalClassification).toBeUndefined();
    expect(c.tx.additionalServiceCatalog).toBeUndefined();
    expect(c.tx.billingDocument).toBeUndefined();
    expect(c.tx.accountReceivable).toBeUndefined();
  });

  it("uses frozen version data even if mutable quotation configuration changes later", async () => {
    const c = context();
    const frozen = version();
    c.tx.customQuotationVersion.findFirst.mockResolvedValue(frozen);
    c.salesOrders.materializeInTransaction.mockResolvedValue({ salesOrderId: "sales-a", orderNumber: "SO-2026-000001", reusedExisting: false });

    await c.service.materialize("tenant-a", "quotation-a", "version-a", actor);
    frozen.fiscalDescription = "Configuración modificada";
    frozen.customQuotation.customer.fullName = "Cliente modificado";

    const command = c.salesOrders.materializeInTransaction.mock.calls[0][2];
    expect(command.lines[0].fiscalDescription).toBe("Paquete turístico personalizado");
    expect(command.customerName).toBe("Cliente A");
  });

  it("reuses the existing linked Sales Order without another materialization", async () => {
    const c = context();
    c.tx.customQuotationVersion.findFirst.mockResolvedValue(version({ salesOrderId: "sales-a" }));
    c.tx.salesOrder.findFirst.mockResolvedValue({ id: "sales-a", orderNumber: "SO-2026-000001", sourceType: "CUSTOM_QUOTATION_VERSION", sourceId: "version-a" });

    await expect(c.service.materialize("tenant-a", "quotation-a", "version-a", actor)).resolves.toEqual({
      salesOrderId: "sales-a", orderNumber: "SO-2026-000001", reusedExisting: true,
    });
    expect(c.salesOrders.materializeInTransaction).not.toHaveBeenCalled();
    expect(c.tx.customQuotationVersion.updateMany).not.toHaveBeenCalled();
  });

  it("blocks an accepted Lead-only quotation until a Customer is resolved", async () => {
    const c = context();
    c.tx.customQuotationVersion.findFirst.mockResolvedValue(version({
      customQuotation: { id: "quotation-a", status: "ACCEPTED", leadId: "lead-a", customerId: null, customer: null },
    }));

    await expect(c.service.materialize("tenant-a", "quotation-a", "version-a", actor))
      .rejects.toThrow("CUSTOM_QUOTATION_CUSTOMER_REQUIRED_FOR_SALES_ORDER");
    expect(c.salesOrders.materializeInTransaction).not.toHaveBeenCalled();
    expect(c.tx.client).toBeUndefined();
  });

  it("rejects non-accepted, malformed, and cross-tenant versions before materialization", async () => {
    const issued = context();
    issued.tx.customQuotationVersion.findFirst.mockResolvedValue(version({ status: "ISSUED" }));
    await expect(issued.service.materialize("tenant-a", "quotation-a", "version-a", actor)).rejects.toBeInstanceOf(ConflictException);
    expect(issued.salesOrders.materializeInTransaction).not.toHaveBeenCalled();

    const incomplete = context();
    incomplete.tx.customQuotationVersion.findFirst.mockResolvedValue(version({ cabysCode: null }));
    await expect(incomplete.service.materialize("tenant-a", "quotation-a", "version-a", actor)).rejects.toBeInstanceOf(ConflictException);
    expect(incomplete.salesOrders.materializeInTransaction).not.toHaveBeenCalled();

    const crossTenant = context();
    crossTenant.tx.$queryRaw.mockResolvedValue([]);
    await expect(crossTenant.service.materialize("tenant-a", "quotation-b", "version-b", actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(crossTenant.tx.customQuotationVersion.findFirst).not.toHaveBeenCalled();
  });
});

function context() {
  const tx = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([{ id: "locked" }]),
    customQuotationVersion: { findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    salesOrder: { findFirst: jest.fn() },
  } as any;
  const prisma = { $transaction: jest.fn(async (work: (value: typeof tx) => Promise<unknown>) => work(tx)) };
  const salesOrders = { materializeInTransaction: jest.fn() };
  return { tx, salesOrders, service: new CustomQuotationSalesOrderService(prisma as never, salesOrders as never) };
}

function version(overrides: Record<string, unknown> = {}) {
  return {
    id: "version-a", customQuotationId: "quotation-a", status: "ACCEPTED", currency: "USD",
    finalSellingPrice: "1450.12345", paymentConditionType: "CREDIT", paymentTermValue: 30,
    paymentTermUnit: "DAYS", commercialObservations: "Incluye traslados", fiscalClassificationId: "fiscal-a",
    fiscalDescription: "Paquete turístico personalizado", fiscalItemCategory: "SERVICE", cabysCode: "1234567890123",
    unitOfMeasureCode: "Unid", taxCode: "01", taxRateCode: "08", fiscalTaxPercentage: "13.0000", salesOrderId: null,
    customQuotation: { id: "quotation-a", status: "ACCEPTED", customerId: "customer-a", customer: { fullName: "Cliente A", email: "cliente@example.test" } },
    ...overrides,
  };
}
