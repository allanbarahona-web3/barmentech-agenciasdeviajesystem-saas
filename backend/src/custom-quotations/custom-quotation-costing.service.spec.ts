import { ConflictException, NotFoundException } from "@nestjs/common";
import { CustomQuotationCostingService } from "./custom-quotation-costing.service";

const actor = { userId: "agent-a", name: "Agent A" };

describe("CustomQuotationCostingService", () => {
  it("lazily creates one standalone CostingProject and immutable quotation link", async () => {
    const c = context();
    c.tx.customQuotation.findFirst.mockResolvedValue(quotation());
    c.tx.customQuotationCostingProjectLink.findFirst.mockResolvedValue(null);
    c.tx.costingProject.create.mockResolvedValue(project());
    c.tx.customQuotationCostingProjectLink.create.mockResolvedValue({ id: "link-a" });
    c.reader.read.mockResolvedValue(currentCost());

    await expect(c.service.resolveOrCreateCostingProject("tenant-a", "quotation-a", actor)).resolves.toEqual(contextResult());
    expect(c.tx.costingProject.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: "tenant-a", baseCurrency: "USD", createdByUserId: actor.userId }),
    }));
    expect(c.tx.customQuotationCostingProjectLink.create).toHaveBeenCalledWith({
      data: { tenantId: "tenant-a", customQuotationId: "quotation-a", costingProjectId: "project-a" },
    });
    expect(c.reader.read).toHaveBeenCalledWith(c.tx, "tenant-a", "project-a");
  });

  it("returns an existing link, including after a non-DRAFT lifecycle transition", async () => {
    const c = context();
    c.tx.customQuotation.findFirst.mockResolvedValue(quotation({ status: "ISSUED" }));
    c.tx.customQuotationCostingProjectLink.findFirst.mockResolvedValue({ costingProject: project() });
    c.reader.read.mockResolvedValue(currentCost());
    await expect(c.service.resolveOrCreateCostingProject("tenant-a", "quotation-a", actor)).resolves.toEqual(contextResult());
    expect(c.tx.costingProject.create).not.toHaveBeenCalled();
    expect(c.tx.customQuotationCostingProjectLink.create).not.toHaveBeenCalled();
  });

  it("recovers the unique-link winner after a concurrent insert race", async () => {
    const c = context({ rollbackOnError: true });
    c.tx.customQuotation.findFirst.mockResolvedValue(quotation());
    c.tx.customQuotationCostingProjectLink.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ costingProject: project({ id: "project-winner" }) });
    c.tx.costingProject.create.mockResolvedValue(project());
    c.tx.customQuotationCostingProjectLink.create.mockRejectedValue({ code: "P2002" });
    c.reader.read.mockResolvedValue({ ...currentCost(), costingProjectId: "project-winner" });
    await expect(c.service.resolveOrCreateCostingProject("tenant-a", "quotation-a", actor)).resolves.toEqual({ ...contextResult(), costingProjectId: "project-winner" });
    expect(c.root.rollback).toHaveBeenCalledTimes(1);
    expect(c.root.$transaction).toHaveBeenCalledTimes(2);
  });

  it("rejects cross-tenant and non-DRAFT quotations when no link exists", async () => {
    const crossTenant = context();
    crossTenant.tx.customQuotation.findFirst.mockResolvedValue(null);
    await expect(crossTenant.service.resolveOrCreateCostingProject("tenant-a", "quotation-b", actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(crossTenant.tx.costingProject.create).not.toHaveBeenCalled();

    const issued = context();
    issued.tx.customQuotation.findFirst.mockResolvedValue(quotation({ status: "ISSUED" }));
    issued.tx.customQuotationCostingProjectLink.findFirst.mockResolvedValue(null);
    await expect(issued.service.resolveOrCreateCostingProject("tenant-a", "quotation-a", actor)).rejects.toBeInstanceOf(ConflictException);
    expect(issued.tx.costingProject.create).not.toHaveBeenCalled();
  });

  it("has no Pricing, Sales Order, Billing, or local cost-calculation dependency", async () => {
    const c = context();
    c.tx.customQuotation.findFirst.mockResolvedValue(quotation());
    c.tx.customQuotationCostingProjectLink.findFirst.mockResolvedValue({ costingProject: project() });
    c.reader.read.mockResolvedValue(currentCost({ authoritativeTotalCost: "123.45000" }));
    await expect(c.service.resolveOrCreateCostingProject("tenant-a", "quotation-a", actor)).resolves.toMatchObject({ authoritativeTotalCost: "123.45000" });
    expect(c.tx.pricingConfiguration).toBeUndefined();
    expect(c.tx.salesOrder).toBeUndefined();
    expect(c.tx.billingDocument).toBeUndefined();
  });
});

function context(options: { rollbackOnError?: boolean } = {}) {
  const tx = {
    $executeRaw: jest.fn(), $queryRaw: jest.fn(), customQuotation: delegate(), customQuotationCostingProjectLink: delegate(), costingProject: delegate(),
  } as any;
  const root: any = {
    rollback: jest.fn(),
    $transaction: jest.fn(async (work: (value: typeof tx) => Promise<unknown>) => {
      try { return await work(tx); } catch (error) { if (options.rollbackOnError) root.rollback(); throw error; }
    }),
  };
  const reader = { read: jest.fn() };
  return { root, tx, reader, service: new CustomQuotationCostingService(root, reader as never) };
}

function delegate() { return { findFirst: jest.fn(), create: jest.fn() }; }
function quotation(overrides: Record<string, unknown> = {}) { return { id: "quotation-a", quotationNumber: "CQ-2026-000001", title: "Viaje corporativo", currency: "USD", status: "DRAFT", ...overrides }; }
function project(overrides: Record<string, unknown> = {}) { return { id: "project-a", baseCurrency: "USD", ...overrides }; }
function currentCost(overrides: Record<string, unknown> = {}) { return { costingProjectId: "project-a", baseCurrency: "USD", authoritativeTotalCost: "0", ...overrides }; }
function contextResult() { return { costingProjectId: "project-a", baseCurrency: "USD", authoritativeTotalCost: "0" }; }
