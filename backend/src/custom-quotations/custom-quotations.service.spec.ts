import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { CustomQuotationsService } from "./custom-quotations.service";

const tenantId = "tenant-a";
const actor = { userId: "agent-a", name: "Agent A" };

describe("CustomQuotationsService", () => {
  it("creates a tenant-scoped DRAFT with a concurrency-safe business number", async () => {
    const c = context();
    c.numbers.next.mockResolvedValue(7n);
    c.tx.client.findFirst.mockResolvedValue({ id: "customer-a" });
    c.tx.customQuotation.create.mockResolvedValue(quotation());

    const result = await c.service.create(tenantId, { ...create(), fiscalClassificationId: "classification-a" } as never, actor);

    expect(c.numbers.next).toHaveBeenCalledWith(c.tx, expect.objectContaining({ tenantId, sequenceKey: "CUSTOM_QUOTATION" }));
    expect(c.tx.customQuotation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId, status: "DRAFT", customerId: "customer-a", createdByUserId: actor.userId, quotationNumber: expect.stringMatching(/^CQ-\d{4}-000007$/) }),
    }));
    expect(c.tx.customQuotation.create.mock.calls[0][0].data).not.toHaveProperty("fiscalClassificationId");
    expect(result).toMatchObject({ status: "DRAFT" });
    expect(c.tx.customQuotationCostingProjectLink.findFirst).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant customers while allowing a draft before fiscal defaults are configured", async () => {
    const customer = context();
    customer.tx.client.findFirst.mockResolvedValue(null);
    await expect(customer.service.create(tenantId, create(), actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(customer.tx.client.findFirst).toHaveBeenCalledWith({ where: { id: "customer-a", tenantId }, select: { id: true } });

    const draft = context();
    draft.numbers.next.mockResolvedValue(8n);
    draft.tx.client.findFirst.mockResolvedValue({ id: "customer-a" });
    draft.tx.customQuotation.create.mockResolvedValue(quotation({ fiscalClassificationId: null }));
    await expect(draft.service.create(tenantId, create(), actor)).resolves.toMatchObject({ status: "DRAFT" });
    expect(draft.tx.tenantFiscalClassification).toBeUndefined();
  });

  it("creates a Lead-targeted draft without creating a Customer", async () => {
    const c = context();
    c.numbers.next.mockResolvedValue(9n);
    c.tx.lead.findFirst.mockResolvedValue({ id: "lead-a", status: "OPEN" });
    c.tx.customQuotation.create.mockResolvedValue(quotation({ leadId: "lead-a", customerId: null, lead: lead(), customer: null }));

    await expect(c.service.create(tenantId, { ...create(), leadId: "lead-a", customerId: undefined }, actor))
      .resolves.toMatchObject({ leadId: "lead-a", customerId: null, target: { type: "LEAD", id: "lead-a" } });
    expect(c.tx.lead.findFirst).toHaveBeenCalledWith({ where: { id: "lead-a", tenantId }, select: { id: true, status: true } });
    expect(c.tx.client.findFirst).not.toHaveBeenCalled();
    expect(c.tx.customQuotation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ leadId: "lead-a", customerId: null }),
    }));
  });

  it("accepts CASH and CREDIT/DAYS commercial terms", async () => {
    const cash = context();
    cash.numbers.next.mockResolvedValue(10n);
    cash.tx.client.findFirst.mockResolvedValue({ id: "customer-a" });
    cash.tx.customQuotation.create.mockResolvedValue(quotation({ paymentConditionType: "CASH" }));

    await cash.service.create(tenantId, { ...create(), paymentConditionType: "CASH" } as never, actor);
    expect(cash.tx.customQuotation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ paymentConditionType: "CASH", paymentTermValue: null, paymentTermUnit: null }),
    }));

    const credit = context();
    credit.numbers.next.mockResolvedValue(11n);
    credit.tx.client.findFirst.mockResolvedValue({ id: "customer-a" });
    credit.tx.customQuotation.create.mockResolvedValue(quotation({ paymentConditionType: "CREDIT", paymentTermValue: 30, paymentTermUnit: "DAYS" }));

    await credit.service.create(tenantId, { ...create(), paymentConditionType: "CREDIT", paymentTermValue: 30, paymentTermUnit: "DAYS" } as never, actor);
    expect(credit.tx.customQuotation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ paymentConditionType: "CREDIT", paymentTermValue: 30, paymentTermUnit: "DAYS" }),
    }));
  });

  it("rejects CREDIT/MONTHS on create and DRAFT update before any quotation write", async () => {
    const createAttempt = context();
    await expect(createAttempt.service.create(
      tenantId,
      { ...create(), paymentConditionType: "CREDIT", paymentTermValue: 12, paymentTermUnit: "MONTHS" } as never,
      actor,
    )).rejects.toThrow("CUSTOM_QUOTATION_CREDIT_TERM_UNIT_INVALID");
    expect(createAttempt.tx.customQuotation.create).not.toHaveBeenCalled();

    const updateAttempt = context();
    updateAttempt.tx.customQuotation.findFirst.mockResolvedValue(quotation());
    await expect(updateAttempt.service.update(
      tenantId,
      "quotation-a",
      { paymentConditionType: "CREDIT", paymentTermValue: 12, paymentTermUnit: "MONTHS" } as never,
      actor,
    )).rejects.toThrow("CUSTOM_QUOTATION_CREDIT_TERM_UNIT_INVALID");
    expect(updateAttempt.tx.customQuotation.updateMany).not.toHaveBeenCalled();
  });

  it("requires exactly one initial tenant-owned OPEN commercial target", async () => {
    const neither = context();
    await expect(neither.service.create(tenantId, { currency: "USD", title: "Viaje" } as never, actor))
      .rejects.toBeInstanceOf(BadRequestException);

    const both = context();
    await expect(both.service.create(tenantId, { ...create(), leadId: "lead-a" }, actor))
      .rejects.toBeInstanceOf(BadRequestException);

    const crossTenantLead = context();
    crossTenantLead.tx.lead.findFirst.mockResolvedValue(null);
    await expect(crossTenantLead.service.create(tenantId, { ...create(), leadId: "lead-b", customerId: undefined }, actor))
      .rejects.toBeInstanceOf(NotFoundException);

    const convertedLead = context();
    convertedLead.tx.lead.findFirst.mockResolvedValue({ id: "lead-a", status: "CONVERTED" });
    await expect(convertedLead.service.create(tenantId, { ...create(), leadId: "lead-a", customerId: undefined }, actor))
      .rejects.toBeInstanceOf(ConflictException);
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

  it("returns bounded tenant-safe Lead quotation summaries with the latest immutable version in the relational query", async () => {
    const c = context();
    c.tx.lead.findFirst.mockResolvedValue({ id: "lead-a" });
    c.tx.customQuotation.findMany.mockResolvedValue([
      leadQuotation({
        customerId: "customer-a",
        versions: [latestVersion({
          status: "ACCEPTED",
          finalSellingPrice: decimal("1450.12345"),
          acceptedAt: new Date("2026-09-22T13:00:00.000Z"),
          salesOrderId: "sales-a",
          salesOrder: { id: "sales-a", orderNumber: "SO-2026-000001" },
        })],
      }),
    ]);
    c.tx.customQuotation.count.mockResolvedValue(1);

    const result = await c.service.listForLead(tenantId, "lead-a", { page: 2, pageSize: 99 });
    expect(result).toMatchObject({
      page: 2,
      pageSize: 25,
      items: [{
        id: "quotation-a",
        customerId: "customer-a",
        latestVersion: {
          id: "version-a",
          status: "ACCEPTED",
          finalSellingPrice: "1450.12345",
          acceptedAt: new Date("2026-09-22T13:00:00.000Z"),
          salesOrder: { id: "sales-a", orderNumber: "SO-2026-000001" },
        },
      }],
    });
    expect(result.items[0]).not.toHaveProperty("fiscalClassificationId");
    expect(result.items[0]).not.toHaveProperty("costingProjectId");
    expect(result.items[0].latestVersion).not.toHaveProperty("pricingCalculationVersionId");
    expect(c.tx.lead.findFirst).toHaveBeenCalledWith({ where: { id: "lead-a", tenantId }, select: { id: true } });
    expect(c.tx.customQuotation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId, leadId: "lead-a" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: 25,
      take: 25,
      select: expect.objectContaining({ versions: expect.objectContaining({ take: 1, orderBy: [{ versionNumber: "desc" }, { id: "desc" }] }) }),
    }));
    expect(c.tx.customQuotationVersion.findMany).not.toHaveBeenCalled();
  });

  it("keeps converted Lead quotations in history and rejects cross-tenant Lead access", async () => {
    const converted = context();
    converted.tx.lead.findFirst.mockResolvedValue({ id: "lead-a" });
    converted.tx.customQuotation.findMany.mockResolvedValue([leadQuotation({ customerId: "customer-a", versions: [] })]);
    converted.tx.customQuotation.count.mockResolvedValue(1);
    await expect(converted.service.listForLead(tenantId, "lead-a", {})).resolves.toMatchObject({ page: 1, pageSize: 20, items: [{ customerId: "customer-a", latestVersion: null }] });

    const crossTenant = context();
    crossTenant.tx.lead.findFirst.mockResolvedValue(null);
    await expect(crossTenant.service.listForLead("tenant-b", "lead-a", {})).rejects.toBeInstanceOf(NotFoundException);
    expect(crossTenant.tx.customQuotation.findMany).not.toHaveBeenCalled();
  });

  it("returns persisted rejection metadata from the latest immutable version", async () => {
    const c = context();
    c.tx.lead.findFirst.mockResolvedValue({ id: "lead-a" });
    c.tx.customQuotation.findMany.mockResolvedValue([leadQuotation({
      status: "REJECTED",
      versions: [latestVersion({ status: "REJECTED", rejectedAt: new Date("2026-09-22T14:00:00.000Z") })],
    })]);
    c.tx.customQuotation.count.mockResolvedValue(1);

    await expect(c.service.listForLead(tenantId, "lead-a", {})).resolves.toMatchObject({
      items: [{ latestVersion: { status: "REJECTED", rejectedAt: new Date("2026-09-22T14:00:00.000Z") } }],
    });
  });

  it("reads detail and updates only DRAFT metadata with tenant-safe validation", async () => {
    const c = context();
    c.tx.customQuotation.findFirst
      .mockResolvedValueOnce(quotation({ lines: [line()] }))
      .mockResolvedValueOnce(quotation())
      .mockResolvedValueOnce(quotation({ title: "Actualizada" }));
    c.tx.customQuotation.updateMany.mockResolvedValue({ count: 1 });
    await expect(c.service.find(tenantId, "quotation-a")).resolves.toMatchObject({ id: "quotation-a", lines: [{ quantity: "1.0000" }] });
    await expect(c.service.update(tenantId, "quotation-a", { title: "Actualizada", fiscalClassificationId: "classification-b" } as never, actor)).resolves.toMatchObject({ title: "Actualizada" });
    expect(c.tx.customQuotation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "quotation-a", tenantId, status: "DRAFT" } }));
    expect(c.tx.customQuotation.updateMany.mock.calls[0][0].data).not.toHaveProperty("fiscalClassificationId");
  });

  it("returns target summaries in list/detail without per-row target lookups", async () => {
    const c = context();
    c.tx.customQuotation.findMany.mockResolvedValue([
      quotation({ leadId: "lead-a", customerId: null, lead: lead(), customer: null }),
      quotation({ leadId: null, customerId: "customer-a", lead: null, customer: customer() }),
    ]);
    c.tx.customQuotation.count.mockResolvedValue(2);
    c.tx.customQuotation.findFirst.mockResolvedValue(quotation({ leadId: "lead-a", customerId: null, lead: lead(), customer: null, lines: [] }));

    await expect(c.service.list(tenantId, {})).resolves.toMatchObject({ items: [
      { target: { type: "LEAD", displayName: "Ada Lead", companyName: "Orbit Travel" } },
      { target: { type: "CUSTOMER", displayName: "Cliente A", companyName: null } },
    ] });
    await expect(c.service.find(tenantId, "quotation-a")).resolves.toMatchObject({ target: { type: "LEAD", email: "ada@example.test" } });
    expect(c.tx.lead.findFirst).not.toHaveBeenCalled();
    expect(c.tx.client.findFirst).not.toHaveBeenCalled();
    expect(c.tx.customQuotation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({ lead: expect.anything(), customer: expect.anything() }),
    }));
  });

  it.each([
    ["Lead to Lead", quotation({ leadId: "lead-a", customerId: null }), { leadId: "lead-b" }, { leadId: "lead-b", customerId: null }],
    ["Customer to Customer", quotation({ leadId: null, customerId: "customer-a" }), { customerId: "customer-b" }, { leadId: null, customerId: "customer-b" }],
    ["Lead to Customer", quotation({ leadId: "lead-a", customerId: null }), { customerId: "customer-b" }, { leadId: null, customerId: "customer-b" }],
    ["Customer to Lead", quotation({ leadId: null, customerId: "customer-a" }), { leadId: "lead-b" }, { leadId: "lead-b", customerId: null }],
  ])("changes DRAFT target safely: %s", async (_label, current, patch, expected) => {
    const c = context();
    c.tx.customQuotation.findFirst
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(quotation({ ...expected, lead: expected.leadId ? lead({ id: expected.leadId }) : null, customer: expected.customerId ? customer({ id: expected.customerId }) : null }));
    c.tx.customQuotationVersion.findFirst.mockResolvedValue(null);
    c.tx.lead.findFirst.mockResolvedValue({ id: "lead-b", status: "OPEN" });
    c.tx.client.findFirst.mockResolvedValue({ id: "customer-b" });
    c.tx.customQuotation.updateMany.mockResolvedValue({ count: 1 });

    await c.service.update(tenantId, "quotation-a", patch as never, actor);
    expect(c.tx.customQuotation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining(expected) }));
    expect(c.tx.customQuotationVersion.findFirst).toHaveBeenCalledWith({ where: { tenantId, customQuotationId: "quotation-a" }, select: { id: true } });
  });

  it("rejects target changes after issuance and does not convert a Lead", async () => {
    const c = context();
    c.tx.customQuotation.findFirst.mockResolvedValue(quotation({ status: "ISSUED", leadId: "lead-a", customerId: null }));
    await expect(c.service.update(tenantId, "quotation-a", { customerId: "customer-a" }, actor))
      .rejects.toBeInstanceOf(ConflictException);
    expect(c.tx.lead.updateMany).not.toHaveBeenCalled();
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

  it("retires all free-form line mutations, including for a DRAFT quotation", async () => {
    const c = context();
    await expect(c.service.addLine(tenantId, "quotation-a", { description: "Traslado", quantity: "2.5000" }, actor)).rejects.toThrow("CUSTOM_QUOTATION_STRUCTURED_COMPONENTS_REQUIRED");
    await expect(c.service.updateLine(tenantId, "quotation-a", "line-a", { description: "Actualizado" }, actor)).rejects.toThrow("CUSTOM_QUOTATION_STRUCTURED_COMPONENTS_REQUIRED");
    await expect(c.service.removeLine(tenantId, "quotation-a", "line-a", actor)).rejects.toThrow("CUSTOM_QUOTATION_STRUCTURED_COMPONENTS_REQUIRED");
    await expect(c.service.reorderLines(tenantId, "quotation-a", ["line-a"], actor)).rejects.toThrow("CUSTOM_QUOTATION_STRUCTURED_COMPONENTS_REQUIRED");
    expect(c.tx.customQuotationLine.create).not.toHaveBeenCalled();
    expect(c.tx.customQuotationLine.updateMany).not.toHaveBeenCalled();
    expect(c.tx.customQuotationLine.deleteMany).not.toHaveBeenCalled();
  });

  it("does not retain free-form quantity validation as commercial authority", async () => {
    const c = context();
    await expect(c.service.addLine(tenantId, "quotation-a", { description: "Traslado", quantity: "0" }, actor)).rejects.toBeInstanceOf(ConflictException);
    expect(c.tx.customQuotationLine.create).not.toHaveBeenCalled();
  });

  it("does not use free-form line reordering as a second commercial authority", async () => {
    const c = context();
    await expect(c.service.reorderLines(tenantId, "quotation-a", ["line-b", "line-a"], actor)).rejects.toThrow("CUSTOM_QUOTATION_STRUCTURED_COMPONENTS_REQUIRED");
    expect(c.tx.customQuotationLine.updateMany).not.toHaveBeenCalled();
    expect(c.tx.costingProject).toBeUndefined();
    expect(c.tx.pricingConfiguration).toBeUndefined();
    expect(c.tx.salesOrder).toBeUndefined();
  });
});

function context() {
  const delegate = () => ({ findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() });
  const tx = { $executeRaw: jest.fn(), client: delegate(), lead: delegate(), customQuotation: delegate(), customQuotationVersion: delegate(), customQuotationLine: delegate(), customQuotationCostingProjectLink: delegate() } as any;
  const prisma = { $transaction: jest.fn(async (work: (value: typeof tx) => Promise<unknown>) => work(tx)) };
  const numbers = { next: jest.fn() };
  return { tx, numbers, service: new CustomQuotationsService(prisma as never, numbers as never) };
}

function create() {
  return { customerId: "customer-a", currency: "USD" as const, title: "Viaje corporativo" };
}

function quotation(overrides: Record<string, unknown> = {}) {
  return {
    id: "quotation-a", tenantId, quotationNumber: "CQ-2026-000001", leadId: null, customerId: "customer-a", currency: "USD", title: "Viaje corporativo", commercialObservations: null, quotationValidUntil: null,
    paymentConditionType: null, paymentTermValue: null, paymentTermUnit: null, fiscalClassificationId: null, status: "DRAFT", createdByUserId: actor.userId, createdByName: actor.name,
    updatedByUserId: null, updatedByName: null, createdAt: new Date("2026-09-21T00:00:00.000Z"), updatedAt: new Date("2026-09-21T00:00:00.000Z"), ...overrides,
  };
}

function lead(overrides: Record<string, unknown> = {}) {
  return { id: "lead-a", fullName: "Ada Lead", email: "ada@example.test", phone: "2222", companyName: "Orbit Travel", ...overrides };
}

function customer(overrides: Record<string, unknown> = {}) {
  return { id: "customer-a", fullName: "Cliente A", email: "cliente@example.test", phone: "8888", ...overrides };
}

function line(overrides: Record<string, unknown> = {}) {
  return { id: "line-a", tenantId, customQuotationId: "quotation-a", displayOrder: 1, description: "Traslado", quantity: decimal("1.0000"), commercialNote: null, createdAt: new Date(), updatedAt: new Date(), ...overrides };
}

function leadQuotation(overrides: Record<string, unknown> = {}) {
  return {
    id: "quotation-a", quotationNumber: "CQ-2026-000001", title: "Viaje corporativo", status: "ACCEPTED", currency: "USD",
    createdAt: new Date("2026-09-21T00:00:00.000Z"), quotationValidUntil: null, customerId: null, versions: [], ...overrides,
  };
}

function latestVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: "version-a", versionNumber: 1, status: "ISSUED", finalSellingPrice: decimal("1000.00000"),
    createdAt: new Date("2026-09-21T01:00:00.000Z"), acceptedAt: null, rejectedAt: null, salesOrderId: null, salesOrder: null, ...overrides,
  };
}

function decimal(value: string) { return { toFixed: () => value, toString: () => value }; }
