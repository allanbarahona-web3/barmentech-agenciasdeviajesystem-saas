import { ConflictException, NotFoundException } from "@nestjs/common";
import { CustomQuotationLeadCustomerConversionService } from "./custom-quotation-lead-customer-conversion.service";

const tenantId = "tenant-a";
const completion = {
  fullName: "Ana Cliente",
  idType: "CEDULA_FISICA" as const,
  idNumber: "1-2345-6789",
  email: "ana@example.test",
  phone: "8888-8888",
};
const actor = { userId: "agent-a", name: "Agent A" };

describe("CustomQuotationLeadCustomerConversionService", () => {
  it("atomically creates a Customer, converts the OPEN Lead, and links an ACCEPTED quotation without mutating its version", async () => {
    const c = context();
    c.customers.resolveCustomerIdentityInTransaction.mockResolvedValue({ customer: customer(), reusedExisting: false });

    await expect(c.service.convert(tenantId, "quotation-a", completion, actor)).resolves.toMatchObject({
      quotationId: "quotation-a", leadId: "lead-a", customerId: "customer-a", salesOrderReady: true,
    });

    expect(c.customers.resolveCustomerIdentityInTransaction).toHaveBeenCalledWith(c.tx, tenantId, completion);
    expect(c.tx.lead.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "lead-a", tenantId, status: "OPEN", convertedCustomerId: null },
      data: expect.objectContaining({ status: "CONVERTED", convertedCustomerId: "customer-a", convertedAt: expect.any(Date), updatedByUserId: actor.userId, updatedByName: actor.name }),
    }));
    expect(c.tx.customQuotation.updateMany).toHaveBeenCalledWith({
      where: { id: "quotation-a", tenantId, status: "ACCEPTED", customerId: null },
      data: { customerId: "customer-a" },
    });
    expect(c.tx.customQuotationVersion.updateMany).toBeUndefined();
    expect(c.tx.salesOrder).toBeUndefined();
    expect(c.tx.billingDocument).toBeUndefined();
  });

  it("reuses an identity-matched Customer without creating a duplicate", async () => {
    const c = context();
    c.customers.resolveCustomerIdentityInTransaction.mockResolvedValue({ customer: customer(), reusedExisting: true });

    await expect(c.service.convert(tenantId, "quotation-a", completion, actor)).resolves.toMatchObject({
      customerId: "customer-a", reusedExistingCustomer: true,
    });
    expect(c.customers.resolveCustomerIdentityInTransaction).toHaveBeenCalledTimes(1);
    expect(c.tx.client.create).not.toHaveBeenCalled();
  });

  it("does not partially convert when Customer identity resolution reports a conflicting name", async () => {
    const c = context();
    c.customers.resolveCustomerIdentityInTransaction.mockRejectedValue(new ConflictException("CUSTOMER_IDENTITY_NAME_CONFLICT"));

    await expect(c.service.convert(tenantId, "quotation-a", completion, actor)).rejects.toBeInstanceOf(ConflictException);
    expect(c.tx.lead.updateMany).not.toHaveBeenCalled();
    expect(c.tx.customQuotation.updateMany).not.toHaveBeenCalled();
  });

  it("is idempotent after a Lead and quotation are already consistently converted", async () => {
    const c = context({ quotation: quotation({ customerId: "customer-a" }), lead: lead({ status: "CONVERTED", convertedCustomerId: "customer-a", convertedAt: new Date("2026-09-22T00:00:00.000Z") }) });
    c.tx.client.findFirst.mockResolvedValue(customer());

    await expect(c.service.convert(tenantId, "quotation-a", completion, actor)).resolves.toMatchObject({
      customerId: "customer-a", reusedExistingCustomer: true, salesOrderReady: true,
    });
    expect(c.customers.resolveCustomerIdentityInTransaction).not.toHaveBeenCalled();
    expect(c.tx.lead.updateMany).not.toHaveBeenCalled();
    expect(c.tx.customQuotation.updateMany).not.toHaveBeenCalled();
  });

  it.each(["DRAFT", "ISSUED", "REJECTED", "EXPIRED", "CANCELLED"])("rejects a %s quotation", async (status) => {
    const c = context({ quotation: quotation({ status }) });
    await expect(c.service.convert(tenantId, "quotation-a", completion, actor)).rejects.toThrow("CUSTOM_QUOTATION_LEAD_CONVERSION_NOT_ACCEPTED");
    expect(c.customers.resolveCustomerIdentityInTransaction).not.toHaveBeenCalled();
  });

  it("does not convert an already accepted existing-Customer quotation or create a Lead", async () => {
    const c = context({ quotation: quotation({ leadId: null, customerId: "customer-a" }) });
    c.tx.client.findFirst.mockResolvedValue(customer());

    await expect(c.service.convert(tenantId, "quotation-a", completion, actor)).resolves.toMatchObject({
      leadId: null, customerId: "customer-a", salesOrderReady: true,
    });
    expect(c.customers.resolveCustomerIdentityInTransaction).not.toHaveBeenCalled();
    expect(c.tx.lead.create).not.toHaveBeenCalled();
  });

  it("rejects missing/cross-tenant quotation and Lead access without a Customer write", async () => {
    const quotationMissing = context();
    quotationMissing.tx.$queryRaw.mockResolvedValue([]);
    await expect(quotationMissing.service.convert(tenantId, "quotation-b", completion, actor)).rejects.toBeInstanceOf(NotFoundException);

    const leadMissing = context();
    leadMissing.tx.$queryRaw.mockResolvedValueOnce([{ id: "quotation-a" }]).mockResolvedValueOnce([]);
    await expect(leadMissing.service.convert(tenantId, "quotation-a", completion, actor)).rejects.toThrow("CUSTOM_QUOTATION_LEAD_NOT_FOUND");
    expect(leadMissing.customers.resolveCustomerIdentityInTransaction).not.toHaveBeenCalled();
    expect(leadMissing.tx.client.create).not.toHaveBeenCalled();
  });
});

function context(input: { quotation?: Record<string, unknown>; lead?: Record<string, unknown> } = {}) {
  const tx = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([{ id: "locked" }]),
    customQuotation: { findFirst: jest.fn().mockResolvedValue(input.quotation ?? quotation()), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    customQuotationVersion: { findFirst: jest.fn().mockResolvedValue({ id: "version-a" }) },
    lead: { findFirst: jest.fn().mockResolvedValue(input.lead ?? lead()), updateMany: jest.fn().mockResolvedValue({ count: 1 }), create: jest.fn() },
    client: { findFirst: jest.fn(), create: jest.fn() },
  } as any;
  const prisma = { $transaction: jest.fn(async (work: (value: typeof tx) => Promise<unknown>) => work(tx)) };
  const customers = { resolveCustomerIdentityInTransaction: jest.fn() };
  return { tx, customers, service: new CustomQuotationLeadCustomerConversionService(prisma as never, customers as never) };
}

function quotation(overrides: Record<string, unknown> = {}) {
  return { id: "quotation-a", status: "ACCEPTED", leadId: "lead-a", customerId: null, ...overrides };
}

function lead(overrides: Record<string, unknown> = {}) {
  return { id: "lead-a", status: "OPEN", convertedCustomerId: null, convertedAt: null, ...overrides };
}

function customer() {
  return { id: "customer-a", fullName: "Ana Cliente" };
}
