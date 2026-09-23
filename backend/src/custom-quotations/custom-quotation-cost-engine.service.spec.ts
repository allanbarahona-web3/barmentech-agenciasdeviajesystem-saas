import { ConflictException, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { ROLES_KEY } from "../auth/roles.decorator";
import { CostEngineController } from "../cost-engine/cost-engine.controller";
import { CustomQuotationCostEngineService } from "./custom-quotation-cost-engine.service";
import { CustomQuotationsController } from "./custom-quotations.controller";

const actor = { userId: "agent-a", name: "Agent A" };

describe("CustomQuotationCostEngineService", () => {
  it("allows the quotation-scoped adapter for ADMIN and AGENT while generic Cost Engine remains ADMIN-only", () => {
    expect(Reflect.getMetadata(ROLES_KEY, CustomQuotationsController)).toEqual([UserRole.ADMIN, UserRole.AGENT]);
    expect(Reflect.getMetadata(ROLES_KEY, CostEngineController)).toEqual([UserRole.ADMIN]);
  });

  it("reads only the linked quotation CostingProject through Cost Engine", async () => {
    const c = context();
    c.costs.getComposition.mockResolvedValue({ project: { id: "project-a" }, authoritativeTotalCost: "12.50000" });

    await expect(c.service.composition("tenant-a", "quotation-a")).resolves.toMatchObject({ authoritativeTotalCost: "12.50000" });

    expect(c.costs.getComposition).toHaveBeenCalledWith("tenant-a", "project-a", 1, 20);
    expect(c.tx.customQuotationCostingProjectLink.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: "tenant-a", customQuotationId: "quotation-a" },
    }));
  });

  it("permits DRAFT component mutations only after locking the quotation and delegates Cost Engine validation", async () => {
    const c = context();
    c.costs.createComponent.mockResolvedValue({ id: "component-a" });
    c.costs.updateComponent.mockResolvedValue({ id: "component-a", title: "Vuelo actualizado" });
    c.costs.updateComponentCost.mockResolvedValue({ id: "component-a" });
    c.costs.archiveComponent.mockResolvedValue({ id: "component-a", status: "ARCHIVED" });
    c.costs.createSupplier.mockResolvedValue({ id: "supplier-a", name: "Proveedor" });
    const dto = { costCategoryId: "category-a", title: "Vuelo", amount: "100.12345", currency: "USD" } as never;

    await expect(c.service.createComponent("tenant-a", "quotation-a", dto, actor)).resolves.toEqual({ id: "component-a" });
    await c.service.updateComponent("tenant-a", "quotation-a", "component-a", { title: "Vuelo actualizado" } as never, actor);
    await c.service.updateComponentCost("tenant-a", "quotation-a", "component-a", { amount: "101.12345", currency: "USD" } as never, actor);
    await c.service.archiveComponent("tenant-a", "quotation-a", "component-a", actor);
    await c.service.createSupplier("tenant-a", "quotation-a", { name: "Proveedor" } as never);

    expect(c.tx.$queryRaw).toHaveBeenCalledTimes(5);
    expect(c.costs.createComponent).toHaveBeenCalledWith("tenant-a", "project-a", dto, actor);
    expect(c.costs.updateComponent).toHaveBeenCalledWith("tenant-a", "component-a", { title: "Vuelo actualizado" }, actor);
    expect(c.costs.updateComponentCost).toHaveBeenCalledWith("tenant-a", "component-a", { amount: "101.12345", currency: "USD" }, actor);
    expect(c.costs.archiveComponent).toHaveBeenCalledWith("tenant-a", "component-a", actor);
    expect(c.costs.createSupplier).toHaveBeenCalledWith("tenant-a", { name: "Proveedor" });
  });

  it("rejects mutations after issue without delegating Cost Engine work", async () => {
    const c = context({ status: "ISSUED" });

    await expect(c.service.createSupplier("tenant-a", "quotation-a", { name: "Proveedor" } as never)).rejects.toBeInstanceOf(ConflictException);

    expect(c.costs.createSupplier).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant quotations and components from another quotation project", async () => {
    const crossTenant = context({ quotation: null });
    await expect(crossTenant.service.composition("tenant-a", "quotation-b")).rejects.toBeInstanceOf(NotFoundException);
    expect(crossTenant.costs.getComposition).not.toHaveBeenCalled();

    const otherComponent = context({ component: null });
    await expect(otherComponent.service.updateComponent("tenant-a", "quotation-a", "component-b", { title: "Otro" } as never, actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(otherComponent.costs.updateComponent).not.toHaveBeenCalled();
  });

  it("scopes evidence reads and uploads to snapshots in the linked project", async () => {
    const c = context();
    c.evidence.list.mockResolvedValue({ evidence: [] });
    c.evidence.upload.mockResolvedValue({ id: "evidence-a" });

    await c.service.listEvidence("tenant-a", "quotation-a", "snapshot-a");
    await c.service.uploadEvidence("tenant-a", "quotation-a", "snapshot-a", { buffer: Buffer.from("x"), mimetype: "application/pdf", originalname: "e.pdf", size: 1 }, actor);

    expect(c.evidence.list).toHaveBeenCalledWith("tenant-a", "snapshot-a", 1, 20);
    expect(c.evidence.upload).toHaveBeenCalledWith("tenant-a", "snapshot-a", expect.any(Object), actor);

    const outside = context({ snapshot: null });
    await expect(outside.service.evidenceAccess("tenant-a", "quotation-a", "snapshot-b", "evidence-b")).rejects.toBeInstanceOf(NotFoundException);
    expect(outside.evidence.getAccess).not.toHaveBeenCalled();
  });

  it("does not introduce Pricing, Sales Order, Billing, or Additional Services dependencies", () => {
    const c = context();
    expect((c.service as any).pricing).toBeUndefined();
    expect((c.service as any).salesOrders).toBeUndefined();
    expect((c.service as any).billing).toBeUndefined();
    expect((c.service as any).additionalServices).toBeUndefined();
  });
});

function context(options: { status?: string; quotation?: Record<string, unknown> | null; component?: Record<string, unknown> | null; snapshot?: Record<string, unknown> | null } = {}) {
  const tx = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([{ id: "quotation-a" }]),
    customQuotation: { findFirst: jest.fn().mockResolvedValue(options.quotation === undefined ? { id: "quotation-a", status: options.status ?? "DRAFT" } : options.quotation) },
    customQuotationCostingProjectLink: { findFirst: jest.fn().mockResolvedValue({ costingProject: { id: "project-a", tenantId: "tenant-a" } }) },
    costComponent: { findFirst: jest.fn().mockResolvedValue(options.component === undefined ? { id: "component-a" } : options.component) },
    costSnapshot: { findFirst: jest.fn().mockResolvedValue(options.snapshot === undefined ? { id: "snapshot-a" } : options.snapshot) },
  } as any;
  const root = { $transaction: jest.fn((work: (value: typeof tx) => Promise<unknown>) => work(tx)) };
  const costs = {
    getComposition: jest.fn(), listCategories: jest.fn(), createCategory: jest.fn(), listSuppliers: jest.fn(), createSupplier: jest.fn(),
    createComponent: jest.fn(), updateComponent: jest.fn(), updateComponentCost: jest.fn(), archiveComponent: jest.fn(),
  };
  const evidence = { list: jest.fn(), getAccess: jest.fn(), upload: jest.fn() };
  return { tx, costs, evidence, service: new CustomQuotationCostEngineService(root as never, costs as never, evidence as never) };
}
