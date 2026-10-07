import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { OperationalPurchasesService } from "./operational-purchases.service";

const tenantId = "tenant-a", travelPackageId = "travel-a", requirementId = "requirement-a", fulfillmentId = "fulfillment-a", purchaseId = "purchase-a";
const actor = { userId: "operator-a", name: "Operator A" };

describe("OperationalPurchasesService", () => {
  it.each(["DRAFT", "RESERVED"])('creates a Decimal-safe purchase and advances %s fulfillment to PURCHASED', async (status) => {
    const c = context(requirement(), fulfillment({ status }));
    c.tx.operationalPurchase.create.mockResolvedValue(purchase());
    c.tx.operationalFulfillment.updateMany.mockResolvedValue({ count: 1 });
    c.finance.readMany.mockResolvedValue([{ eligibility: "ELIGIBLE", reason: "SETTLED" }]);
    await expect(c.service.create(tenantId, travelPackageId, requirementId, fulfillmentId, input(), actor)).resolves.toMatchObject({ amount: "100.25", currency: "USD", providerName: "Provider A" });
    expect(c.tx.operationalPurchase.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ travelPackageId, operationalFulfillmentId: fulfillmentId, amount: expect.any(Prisma.Decimal), currency: "USD", providerName: "Provider A" }) }));
    expect(c.tx.operationalFulfillment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PURCHASED" }) }));
    expect(c.finance.readMany).toHaveBeenCalledWith({ tenantId, sources: [{ sourceType: "CONTRACT", sourceId: "contract-a" }] });
  });

  it("allows multiple purchases while PURCHASED but closes purchase creation after confirmation", async () => {
    const c = context(requirement(), fulfillment({ status: "PURCHASED" }));
    c.tx.operationalRequirement.findFirst.mockResolvedValue(requirement());
    c.tx.operationalFulfillment.findFirst.mockResolvedValue(fulfillment({ status: "PURCHASED" }));
    c.finance.readMany.mockResolvedValue([{ eligibility: "ELIGIBLE", reason: "SETTLED" }]);
    c.tx.operationalFulfillment.updateMany.mockResolvedValue({ count: 1 });
    c.tx.operationalPurchase.create.mockResolvedValueOnce(purchase()).mockResolvedValueOnce(purchase({ id: "purchase-b" }));
    await c.service.create(tenantId, travelPackageId, requirementId, fulfillmentId, input(), actor);
    await c.service.create(tenantId, travelPackageId, requirementId, fulfillmentId, input({ amount: "20.00" }), actor);
    expect(c.tx.operationalPurchase.create).toHaveBeenCalledTimes(2);
    expect(c.tx.operationalFulfillment.updateMany.mock.calls[0][0].data.status).toBe("PURCHASED");

    const confirmed = context(requirement(), fulfillment({ status: "CONFIRMED" }));
    await expect(confirmed.service.create(tenantId, travelPackageId, requirementId, fulfillmentId, input(), actor)).rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_PURCHASE_FULFILLMENT_CONFIRMED" }) });
    expect(confirmed.tx.operationalPurchase.create).not.toHaveBeenCalled();
  });

  it.each([
    [requirement({ status: "CANCELLED" }), fulfillment(), "OPERATIONAL_PURCHASE_PARENT_REQUIREMENT_TERMINAL"],
    [requirement({ status: "NOT_APPLICABLE" }), fulfillment(), "OPERATIONAL_PURCHASE_PARENT_REQUIREMENT_TERMINAL"],
    [requirement(), fulfillment({ status: "CANCELLED" }), "OPERATIONAL_PURCHASE_FULFILLMENT_CANCELLED"],
    [requirement(), fulfillment({ status: "CONFIRMED" }), "OPERATIONAL_PURCHASE_FULFILLMENT_CONFIRMED"],
  ])("rejects purchases beneath terminal parents", async (req, full, code) => {
    const c = context(req, full);
    await expect(c.service.create(tenantId, travelPackageId, requirementId, fulfillmentId, input(), actor)).rejects.toMatchObject({ response: expect.objectContaining({ message: code }) });
  });

  it("fails closed for manual or unavailable finance sources and blocks ineligible Contract sources", async () => {
    const manual = context(requirement({ sourceType: "MANUAL", sourceId: null }), fulfillment());
    await expect(manual.service.create(tenantId, travelPackageId, requirementId, fulfillmentId, input(), actor)).rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_PURCHASE_FINANCIAL_ELIGIBILITY_UNAVAILABLE" }) });
    expect(manual.finance.readMany).not.toHaveBeenCalled();

    const blocked = context(requirement(), fulfillment());
    blocked.finance.readMany.mockResolvedValue([{ eligibility: "BLOCKED", reason: "OUTSTANDING_BALANCE" }]);
    await expect(blocked.service.create(tenantId, travelPackageId, requirementId, fulfillmentId, input(), actor)).rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_PURCHASE_FINANCIAL_ELIGIBILITY_BLOCKED" }) });
    expect(blocked.tx.operationalPurchase.create).not.toHaveBeenCalled();
  });

  it("passes the exact Additional Service source snapshot to Finance and preserves blocked/unavailable gates", async () => {
    const eligible = context(requirement({ sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a" }), fulfillment());
    eligible.finance.readMany.mockResolvedValue([{ eligibility: "ELIGIBLE", reason: "SETTLED" }]);
    eligible.tx.operationalPurchase.create.mockResolvedValue(purchase());
    eligible.tx.operationalFulfillment.updateMany.mockResolvedValue({ count: 1 });
    await expect(eligible.service.create(tenantId, travelPackageId, requirementId, fulfillmentId, input(), actor)).resolves.toMatchObject({ id: purchaseId });
    expect(eligible.finance.readMany).toHaveBeenCalledWith({ tenantId, sources: [{ sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a", travelPackageId }] });

    const blocked = context(requirement({ sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a" }), fulfillment());
    blocked.finance.readMany.mockResolvedValue([{ eligibility: "BLOCKED", reason: "OUTSTANDING_BALANCE" }]);
    await expect(blocked.service.create(tenantId, travelPackageId, requirementId, fulfillmentId, input(), actor)).rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_PURCHASE_FINANCIAL_ELIGIBILITY_BLOCKED" }) });

    const partiallyPaid = context(requirement({ sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a" }), fulfillment());
    partiallyPaid.finance.readMany.mockResolvedValue([{ eligibility: "BLOCKED", reason: "PARTIALLY_PAID" }]);
    await expect(partiallyPaid.service.create(tenantId, travelPackageId, requirementId, fulfillmentId, input(), actor)).rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_PURCHASE_FINANCIAL_ELIGIBILITY_BLOCKED" }) });

    const unavailable = context(requirement({ sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a" }), fulfillment());
    unavailable.finance.readMany.mockResolvedValue([{ eligibility: "BLOCKED", reason: "FINANCIAL_DATA_MISSING" }]);
    await expect(unavailable.service.create(tenantId, travelPackageId, requirementId, fulfillmentId, input(), actor)).rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_PURCHASE_FINANCIAL_ELIGIBILITY_UNAVAILABLE" }) });
  });

  it.each(["OUTSTANDING_BALANCE", "PARTIALLY_PAID", "COMMERCIAL_OBLIGATION_NOT_SETTLED"])("authorizes a base component despite %s without calling Finance", async (reason) => {
    const c = context(requirement({ sourceType: "TRAVEL_PACKAGE_COST_COMPONENT", sourceId: "project-a", sourceLineId: "component-a", sourceVersionId: "snapshot-a" }), fulfillment());
    c.finance.readMany.mockResolvedValue([{ eligibility: "BLOCKED", reason }]);
    c.tx.operationalPurchase.create.mockResolvedValue(purchase());
    c.tx.operationalFulfillment.updateMany.mockResolvedValue({ count: 1 });
    await expect(c.service.create(tenantId, travelPackageId, requirementId, fulfillmentId, input(), actor)).resolves.toMatchObject({ id: purchaseId });
    expect(c.finance.readMany).not.toHaveBeenCalled();
  });

  it.each(["CANCELLED", "CONFIRMED"] as const)("keeps %s base Fulfillments history-only", async (status) => {
    const c = context(requirement({ sourceType: "TRAVEL_PACKAGE_COST_COMPONENT", sourceId: "project-a", sourceLineId: "component-a" }), fulfillment({ status }));
    await expect(c.service.create(tenantId, travelPackageId, requirementId, fulfillmentId, input(), actor)).rejects.toBeInstanceOf(ConflictException);
    expect(c.finance.readMany).not.toHaveBeenCalled();
  });

  it.each([
    [input({ amount: "0" }), "OPERATIONAL_PURCHASE_AMOUNT_INVALID"],
    [input({ amount: "-1" }), "OPERATIONAL_PURCHASE_AMOUNT_INVALID"],
    [input({ currency: "US" }), "OPERATIONAL_PURCHASE_CURRENCY_INVALID"],
    [input({ taxAmount: "-0.01" }), "OPERATIONAL_PURCHASE_TAX_AMOUNT_INVALID"],
    [input({ providerName: " " }), "OPERATIONAL_PURCHASE_PROVIDER_INVALID"],
  ])("validates monetary and provider inputs", async (body, code) => {
    const c = context(requirement(), fulfillment());
    await expect(c.service.create(tenantId, travelPackageId, requirementId, fulfillmentId, body, actor)).rejects.toMatchObject({ response: expect.objectContaining({ message: code }) });
  });

  it("updates only safe metadata and has no delete operation", async () => {
    const c = context(requirement(), fulfillment());
    c.tx.operationalPurchase.findFirst.mockResolvedValue(purchase());
    c.tx.operationalPurchase.updateMany.mockResolvedValue({ count: 1 });
    await c.service.update(tenantId, travelPackageId, requirementId, fulfillmentId, purchaseId, { supplierReference: "SUP-2", notes: "Corrected note" }, actor);
    expect(c.tx.operationalPurchase.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ supplierReference: "SUP-2", notes: "Corrected note" }) }));
    expect(c.tx.operationalPurchase.updateMany.mock.calls[0][0].data).not.toHaveProperty("amount");
    expect((c.service as any).delete).toBeUndefined();
  });

  it("rejects metadata edits beneath a confirmed Fulfillment", async () => {
    const c = context(requirement(), fulfillment({ status: "CONFIRMED" }));
    await expect(c.service.update(tenantId, travelPackageId, requirementId, fulfillmentId, purchaseId, { notes: "Late change" }, actor)).rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_PURCHASE_FULFILLMENT_CONFIRMED" }) });
    expect(c.tx.operationalPurchase.updateMany).not.toHaveBeenCalled();
  });

  it("lists deterministic bounded pages and scopes detail reads to the complete hierarchy", async () => {
    const c = context(requirement(), fulfillment());
    c.tx.operationalPurchase.findMany.mockResolvedValue([purchase()]);
    c.tx.operationalPurchase.count.mockResolvedValue(21);
    await expect(c.service.list(tenantId, travelPackageId, requirementId, fulfillmentId, { page: 1, pageSize: 20, currency: "usd" })).resolves.toMatchObject({ total: 21, totalPages: 2, items: [{ id: purchaseId }] });
    expect(c.tx.operationalPurchase.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ currency: "USD" }), orderBy: [{ purchasedAt: "desc" }, { id: "asc" }], take: 20 }));

    c.tx.operationalPurchase.findFirst.mockResolvedValue(purchase());
    await expect(c.service.find(tenantId, travelPackageId, requirementId, fulfillmentId, purchaseId)).resolves.toMatchObject({ id: purchaseId, createdBy: { userId: "operator-a" } });
    expect(c.tx.operationalPurchase.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: purchaseId, tenantId, travelPackageId, operationalFulfillmentId: fulfillmentId }) }));

    const hidden = context(requirement(), fulfillment()); hidden.tx.operationalPurchase.findFirst.mockResolvedValue(null);
    await expect(hidden.service.find("tenant-b", travelPackageId, requirementId, fulfillmentId, purchaseId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("revalidates the parent inside the write transaction after eligibility", async () => {
    const c = context(requirement(), fulfillment(), [requirement(), requirement()], [fulfillment(), fulfillment({ status: "CANCELLED" })]);
    c.finance.readMany.mockResolvedValue([{ eligibility: "ELIGIBLE", reason: "SETTLED" }]);
    await expect(c.service.create(tenantId, travelPackageId, requirementId, fulfillmentId, input(), actor)).rejects.toBeInstanceOf(ConflictException);
    expect(c.tx.operationalPurchase.create).not.toHaveBeenCalled();
    expect(c.tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("allows standalone Custom Quotation procurement only after Finance reports its exact immutable line eligible", async () => {
    const standalone = requirement({ travelPackageId: null, sourceType: "CUSTOM_QUOTATION_LINE", sourceId: "version-a", sourceLineId: "line-a" });
    const c = context(standalone, fulfillment(), [standalone, standalone], [fulfillment(), fulfillment()]);
    c.finance.readMany.mockResolvedValue([{ eligibility: "ELIGIBLE", reason: "SETTLED" }]);
    c.tx.operationalPurchase.create.mockResolvedValue(purchase({ travelPackageId: null }));
    c.tx.operationalFulfillment.updateMany.mockResolvedValue({ count: 1 });
    await expect(c.service.createStandalone(tenantId, requirementId, fulfillmentId, input(), actor)).resolves.toMatchObject({ id: purchaseId, travelPackageId: null });
    expect(c.finance.readMany).toHaveBeenCalledWith({
      tenantId,
      sources: [{ sourceType: "CUSTOM_QUOTATION_LINE", sourceId: "version-a", sourceLineId: "line-a" }],
    });
    expect(c.tx.operationalPurchase.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ travelPackageId: null, operationalFulfillmentId: fulfillmentId }),
    }));

    const blocked = context(standalone, fulfillment(), [standalone], [fulfillment()]);
    blocked.finance.readMany.mockResolvedValue([{ eligibility: "BLOCKED", reason: "OUTSTANDING_BALANCE" }]);
    await expect(blocked.service.createStandalone(tenantId, requirementId, fulfillmentId, input(), actor)).rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_PURCHASE_FINANCIAL_ELIGIBILITY_BLOCKED" }) });
    expect(blocked.tx.operationalPurchase.create).not.toHaveBeenCalled();
  });

  it("lists standalone purchases through generic fulfillment identity", async () => {
    const standalone = requirement({ travelPackageId: null, sourceType: "CUSTOM_QUOTATION_LINE", sourceId: "version-a", sourceLineId: "line-a" });
    const c = context(standalone, fulfillment(), [standalone], [fulfillment()]);
    c.tx.operationalPurchase.findMany.mockResolvedValue([purchase({ travelPackageId: null })]);
    c.tx.operationalPurchase.count.mockResolvedValue(1);
    await expect(c.service.listStandalone(tenantId, requirementId, fulfillmentId, {})).resolves.toMatchObject({ total: 1, items: [{ travelPackageId: null }] });
    expect(c.tx.operationalPurchase.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId, travelPackageId: null, operationalFulfillmentId: fulfillmentId }) }));
  });
});

function context(req = requirement(), full = fulfillment(), reqs = [req, req], fulls = [full, full]) {
  const tx = { $executeRaw: jest.fn(), operationalRequirement: { findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, operationalFulfillment: { findFirst: jest.fn(), updateMany: jest.fn() }, operationalPurchase: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() } };
  reqs.forEach((item) => tx.operationalRequirement.findFirst.mockResolvedValueOnce(item));
  fulls.forEach((item) => tx.operationalFulfillment.findFirst.mockResolvedValueOnce(item));
  const prisma = { $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)) };
  const finance = { readMany: jest.fn() };
  return { tx, finance, service: new OperationalPurchasesService(prisma as never, finance) };
}
function input(overrides: Record<string, unknown> = {}) { return { providerName: "Provider A", amount: "100.25000", currency: "usd", taxAmount: "0", purchasedAt: "2026-10-01T12:00:00.000Z", ...overrides } as any; }
function requirement(overrides: Record<string, unknown> = {}) { return { id: requirementId, travelPackageId, status: "IN_PROGRESS", sourceType: "CONTRACT", sourceId: "contract-a", sourceLineId: null, sourceVersionId: null, ...overrides }; }
function fulfillment(overrides: Record<string, unknown> = {}) { return { id: fulfillmentId, status: "DRAFT", ...overrides }; }
function purchase(overrides: Record<string, unknown> = {}) { return { id: purchaseId, travelPackageId, operationalFulfillmentId: fulfillmentId, providerName: "Provider A", supplierReference: null, amount: new Prisma.Decimal("100.25000"), currency: "USD", taxAmount: new Prisma.Decimal(0), purchasedAt: new Date("2026-10-01T12:00:00.000Z"), supplierInvoiceNumber: null, notes: null, createdByUserId: "operator-a", createdByName: "Operator A", createdAt: new Date("2026-10-01T12:01:00.000Z"), updatedAt: new Date("2026-10-01T12:01:00.000Z"), ...overrides }; }
