import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { CustomQuotationsService } from "./custom-quotations.service";

const tenantId = "tenant-a";
const actor = { userId: "agent-a", name: "Agent A" };

describe("CustomQuotationsService", () => {
  it("creates a tenant-scoped DRAFT with a concurrency-safe business number", async () => {
    const c = context();
    c.numbers.next.mockResolvedValue(7n);
    c.tx.client.findFirst.mockResolvedValue({ id: "customer-a" });
    c.tx.tenantFiscalClassification.findFirst.mockResolvedValue({ id: "classification-a", isActive: true });
    c.tx.customQuotation.create.mockResolvedValue(quotation());

    const result = await c.service.create(tenantId, create(), actor);

    expect(c.numbers.next).toHaveBeenCalledWith(c.tx, expect.objectContaining({ tenantId, sequenceKey: "CUSTOM_QUOTATION" }));
    expect(c.tx.customQuotation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId, status: "DRAFT", customerId: "customer-a", fiscalClassificationId: "classification-a", createdByUserId: actor.userId, quotationNumber: expect.stringMatching(/^CQ-\d{4}-000007$/) }),
    }));
    expect(result).toMatchObject({ status: "DRAFT" });
    expect(c.tx.customQuotationCostingProjectLink.findFirst).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant customers and inactive fiscal classifications", async () => {
    const customer = context();
    customer.tx.client.findFirst.mockResolvedValue(null);
    await expect(customer.service.create(tenantId, create(), actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(customer.tx.client.findFirst).toHaveBeenCalledWith({ where: { id: "customer-a", tenantId }, select: { id: true } });

    const fiscal = context();
    fiscal.tx.client.findFirst.mockResolvedValue({ id: "customer-a" });
    fiscal.tx.tenantFiscalClassification.findFirst.mockResolvedValue({ id: "classification-a", isActive: false });
    await expect(fiscal.service.create(tenantId, create(), actor)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("uses bounded deterministic quotation listing and tenant predicates", async () => {
    const c = context();
    c.tx.customQuotation.findMany.mockResolvedValue([quotation()]);
    c.tx.customQuotation.count.mockResolvedValue(1);
    const result = await c.service.list(tenantId, { page: 2, pageSize: 99, status: "DRAFT", customerId: "customer-a", search: "CQ" });
    expect(c.tx.customQuotation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId, status: "DRAFT", customerId: "customer-a" }),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: 25, take: 25,
    }));
    expect(result).toMatchObject({ page: 2, pageSize: 25, total: 1 });
  });

  it("reads detail and updates only DRAFT metadata with tenant-safe validation", async () => {
    const c = context();
    c.tx.customQuotation.findFirst
      .mockResolvedValueOnce(quotation({ lines: [line()] }))
      .mockResolvedValueOnce(quotation())
      .mockResolvedValueOnce(quotation({ title: "Actualizada" }));
    c.tx.tenantFiscalClassification.findFirst.mockResolvedValue({ id: "classification-b", isActive: true });
    c.tx.customQuotation.updateMany.mockResolvedValue({ count: 1 });
    await expect(c.service.find(tenantId, "quotation-a")).resolves.toMatchObject({ id: "quotation-a", lines: [{ quantity: "1.0000" }] });
    await expect(c.service.update(tenantId, "quotation-a", { title: "Actualizada", fiscalClassificationId: "classification-b" }, actor)).resolves.toMatchObject({ title: "Actualizada" });
    expect(c.tx.customQuotation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "quotation-a", tenantId, status: "DRAFT" } }));
  });

  it("rejects commercial and line mutations once the quotation is not a draft", async () => {
    const c = context();
    c.tx.customQuotation.findFirst.mockResolvedValue(quotation({ status: "ISSUED" }));
    await expect(c.service.update(tenantId, "quotation-a", { title: "No" }, actor)).rejects.toBeInstanceOf(ConflictException);
    await expect(c.service.addLine(tenantId, "quotation-a", { description: "Traslado" }, actor)).rejects.toBeInstanceOf(ConflictException);
    expect(c.tx.customQuotationLine.create).not.toHaveBeenCalled();
  });

  it("allows a currency change before costing opens and locks it once a project is linked", async () => {
    const before = context();
    before.tx.customQuotation.findFirst
      .mockResolvedValueOnce(quotation())
      .mockResolvedValueOnce(quotation({ currency: "CRC" }));
    before.tx.customQuotationCostingProjectLink.findFirst.mockResolvedValue(null);
    before.tx.customQuotation.updateMany.mockResolvedValue({ count: 1 });
    await expect(before.service.update(tenantId, "quotation-a", { currency: "CRC" as never }, actor)).resolves.toMatchObject({ currency: "CRC" });

    const after = context();
    after.tx.customQuotation.findFirst.mockResolvedValue(quotation());
    after.tx.customQuotationCostingProjectLink.findFirst.mockResolvedValue({ id: "link-a" });
    await expect(after.service.update(tenantId, "quotation-a", { currency: "CRC" as never }, actor)).rejects.toBeInstanceOf(ConflictException);
    expect(after.tx.customQuotation.updateMany).not.toHaveBeenCalled();
  });

  it("manages descriptive lines only in a draft and preserves exact quantity strings", async () => {
    const c = context();
    c.tx.customQuotation.findFirst.mockResolvedValue(quotation());
    c.tx.customQuotationLine.findFirst
      .mockResolvedValueOnce({ displayOrder: 1 })
      .mockResolvedValueOnce(line({ id: "line-a", description: "Actualizado", quantity: decimal("2.5000") }))
      .mockResolvedValueOnce(line({ id: "line-a", displayOrder: 1 }));
    c.tx.customQuotationLine.create.mockResolvedValue(line({ id: "line-b", displayOrder: 2, quantity: decimal("2.5000") }));
    c.tx.customQuotationLine.updateMany.mockResolvedValue({ count: 1 });
    c.tx.customQuotationLine.deleteMany.mockResolvedValue({ count: 1 });
    c.tx.customQuotation.updateMany.mockResolvedValue({ count: 1 });

    await expect(c.service.addLine(tenantId, "quotation-a", { description: "Traslado", quantity: "2.5000" }, actor)).resolves.toMatchObject({ displayOrder: 2, quantity: "2.5000" });
    await expect(c.service.updateLine(tenantId, "quotation-a", "line-a", { description: "Actualizado", quantity: "2.5000" }, actor)).resolves.toMatchObject({ quantity: "2.5000" });
    await c.service.removeLine(tenantId, "quotation-a", "line-a", actor);
    expect(c.tx.customQuotationLine.deleteMany).toHaveBeenCalledWith({ where: { id: "line-a", tenantId, customQuotationId: "quotation-a" } });
    expect(c.tx.customQuotationLine.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { displayOrder: { decrement: 1 } } }));
  });

  it("rejects a non-positive descriptive quantity before persistence", async () => {
    const c = context();
    c.tx.customQuotation.findFirst.mockResolvedValue(quotation());
    await expect(c.service.addLine(tenantId, "quotation-a", { description: "Traslado", quantity: "0" }, actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(c.tx.customQuotationLine.create).not.toHaveBeenCalled();
  });

  it("reorders the complete tenant-owned line set without creating Cost, Pricing, or Sales Order side effects", async () => {
    const c = context();
    c.tx.customQuotation.findFirst.mockResolvedValue(quotation());
    c.tx.customQuotationLine.findMany.mockResolvedValue([line({ id: "line-a", displayOrder: 1 }), line({ id: "line-b", displayOrder: 2 })]);
    c.tx.customQuotationLine.updateMany.mockResolvedValue({ count: 1 });
    c.tx.customQuotation.updateMany.mockResolvedValue({ count: 1 });
    await expect(c.service.reorderLines(tenantId, "quotation-a", ["line-b", "line-a"], actor)).resolves.toEqual({ lineIds: ["line-b", "line-a"] });
    expect(c.tx.customQuotationLine.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { displayOrder: { increment: 2 } } }));
    expect(c.tx.costingProject).toBeUndefined();
    expect(c.tx.pricingConfiguration).toBeUndefined();
    expect(c.tx.salesOrder).toBeUndefined();
  });
});

function context() {
  const delegate = () => ({ findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() });
  const tx = { $executeRaw: jest.fn(), client: delegate(), tenantFiscalClassification: delegate(), customQuotation: delegate(), customQuotationLine: delegate(), customQuotationCostingProjectLink: delegate() } as any;
  const prisma = { $transaction: jest.fn(async (work: (value: typeof tx) => Promise<unknown>) => work(tx)) };
  const numbers = { next: jest.fn() };
  return { tx, numbers, service: new CustomQuotationsService(prisma as never, numbers as never) };
}

function create() {
  return { customerId: "customer-a", currency: "USD" as const, title: "Viaje corporativo", fiscalClassificationId: "classification-a" };
}

function quotation(overrides: Record<string, unknown> = {}) {
  return {
    id: "quotation-a", tenantId, quotationNumber: "CQ-2026-000001", customerId: "customer-a", currency: "USD", title: "Viaje corporativo", commercialObservations: null, quotationValidUntil: null,
    paymentConditionType: null, paymentTermValue: null, paymentTermUnit: null, fiscalClassificationId: "classification-a", status: "DRAFT", createdByUserId: actor.userId, createdByName: actor.name,
    updatedByUserId: null, updatedByName: null, createdAt: new Date("2026-09-21T00:00:00.000Z"), updatedAt: new Date("2026-09-21T00:00:00.000Z"), ...overrides,
  };
}

function line(overrides: Record<string, unknown> = {}) {
  return { id: "line-a", tenantId, customQuotationId: "quotation-a", displayOrder: 1, description: "Traslado", quantity: decimal("1.0000"), commercialNote: null, createdAt: new Date(), updatedAt: new Date(), ...overrides };
}

function decimal(value: string) { return { toFixed: () => value }; }
