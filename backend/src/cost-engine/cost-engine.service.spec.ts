import { BadRequestException, ConflictException, NotFoundException, ValidationPipe } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ROLES_KEY } from "../auth/roles.decorator";
import { CostEngineController } from "./cost-engine.controller";
import { CostEngineRepository } from "./cost-engine.repository";
import { CostEngineService } from "./cost-engine.service";
import { ListCostComponentsDto } from "./dto/cost-engine.dto";
import { STANDARD_COST_CATEGORIES } from "./standard-cost-categories";

const actor = { userId: "user-a", name: "Admin A" };

describe("Cost Engine foundation", () => {
  it("tenant-scopes component reads and establishes RLS context in the transaction", async () => {
    const context = repositoryContext();
    context.tx.costComponent.findFirst.mockResolvedValue(null);

    await expect(context.repository.getComponentDetail("tenant-a", "component-b")).resolves.toBeNull();

    expect(context.root.$transaction).toHaveBeenCalledTimes(1);
    expect(context.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(context.tx.costComponent.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "component-b", tenantId: "tenant-a" },
    }));
  });

  it("creates a component, first snapshot, pointer, and structural audit in one transaction", async () => {
    const context = repositoryContext();
    context.tx.costingProject.findFirst.mockResolvedValue(project());
    context.tx.costCategory.findFirst.mockResolvedValue({ id: "category-a" });
    context.tx.costComponent.create.mockResolvedValue({ id: "component-a" });
    context.tx.costSnapshot.create.mockResolvedValue({ id: "snapshot-1" });
    context.tx.costComponent.updateMany.mockResolvedValue({ count: 1 });
    context.tx.costAuditEvent.create.mockResolvedValue({ id: "audit-1" });

    await expect(context.repository.createComponent("tenant-a", "project-a", componentInput(), snapshotInput(), actor)).resolves.toBe("component-a");

    expect(context.tx.costSnapshot.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: "tenant-a", costingProjectId: "project-a", costComponentId: "component-a", sequence: 1, amount: "125.50", currency: "USD" }),
    }));
    expect(context.tx.costComponent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "component-a", tenantId: "tenant-a" }, data: { currentSnapshotId: "snapshot-1" },
    }));
    expect(context.tx.costAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "COMPONENT_CREATED", costComponentId: "component-a" }),
    }));
  });

  it("rolls back the monetary write when the transaction callback fails", async () => {
    const context = repositoryContext({ rollbackOnError: true });
    context.tx.costingProject.findFirst.mockResolvedValue(project());
    context.tx.costCategory.findFirst.mockResolvedValue({ id: "category-a" });
    context.tx.costComponent.create.mockResolvedValue({ id: "component-a" });
    context.tx.costSnapshot.create.mockResolvedValue({ id: "snapshot-1" });
    context.tx.costComponent.updateMany.mockResolvedValue({ count: 1 });
    context.tx.costAuditEvent.create.mockRejectedValue(new Error("audit failed"));

    await expect(context.repository.createComponent("tenant-a", "project-a", componentInput(), snapshotInput(), actor)).rejects.toThrow("audit failed");
    expect(context.root.rollback).toHaveBeenCalledTimes(1);
  });

  it("records a new immutable snapshot and advances the current pointer for a monetary update", async () => {
    const context = repositoryContext();
    context.tx.$queryRaw.mockResolvedValue([{ id: "component-a" }]);
    context.tx.costComponent.findFirst.mockResolvedValue(component());
    context.tx.costingProject.findFirst.mockResolvedValue(project());
    context.tx.costSnapshot.findFirst.mockResolvedValue({ sequence: 2 });
    context.tx.costSnapshot.create.mockResolvedValue({ id: "snapshot-3" });
    context.tx.costComponent.updateMany.mockResolvedValue({ count: 1 });

    await expect(context.repository.updateComponentCost("tenant-a", "component-a", snapshotInput(), actor)).resolves.toBe("snapshot-3");

    expect(context.tx.costSnapshot.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sequence: 3 }) }));
    expect(context.tx.costComponent.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { currentSnapshotId: "snapshot-3" } }));
  });

  it("rejects generic monetary updates only for travel-linked STANDARD AIRFARE components", async () => {
    const context = repositoryContext();
    context.tx.$queryRaw.mockResolvedValueOnce([{ id: "component-a" }]).mockResolvedValueOnce([{ linked: true }]);
    context.tx.costComponent.findFirst.mockResolvedValue(component({ costCategory: { code: "AIRFARE", origin: "STANDARD" } }));

    await expect(context.repository.updateComponentCost("tenant-a", "component-a", snapshotInput(), actor)).rejects.toThrow("AIRFARE daily authority flow");
    expect(context.tx.costSnapshot.create).not.toHaveBeenCalled();
  });

  it("leaves generic structural AIRFARE edits and unlinked AIRFARE monetary updates available", async () => {
    const context = repositoryContext();
    context.tx.$queryRaw.mockResolvedValueOnce([{ id: "component-a" }]).mockResolvedValueOnce([{ linked: false }]);
    context.tx.costComponent.findFirst.mockResolvedValue(component({ costCategory: { code: "AIRFARE", origin: "STANDARD" } }));
    context.tx.costingProject.findFirst.mockResolvedValue(project());
    context.tx.costSnapshot.findFirst.mockResolvedValue({ sequence: 2 });
    context.tx.costSnapshot.create.mockResolvedValue({ id: "snapshot-3" });
    context.tx.costComponent.updateMany.mockResolvedValue({ count: 1 });

    await expect(context.repository.updateComponentCost("tenant-a", "component-a", snapshotInput(), actor)).resolves.toBe("snapshot-3");
    expect(context.tx.costSnapshot.create).toHaveBeenCalledTimes(1);
  });

  it("updates structural details without creating or changing a monetary snapshot", async () => {
    const context = repositoryContext();
    context.tx.$queryRaw.mockResolvedValue([{ id: "component-a" }]);
    context.tx.costComponent.findFirst.mockResolvedValue(component({
      costCategory: { code: "AIRFARE", origin: "STANDARD" },
      detailPayload: null, detailSchemaVersion: null, quantity: null, unit: null,
    }));
    context.tx.costComponent.updateMany.mockResolvedValue({ count: 1 });
    context.tx.costAuditEvent.create.mockResolvedValue({ id: "audit-detail" });

    await context.repository.updateComponent("tenant-a", "component-a", {
      detailPayload: { flightType: "INTERNATIONAL", tripType: "ONE_WAY", origin: "SJO", destination: "MAD", departureDate: "2026-10-01" },
      detailSchemaVersion: 1,
      quantity: "2.000",
      unit: "tickets",
    }, actor);

    expect(context.tx.costSnapshot.create).not.toHaveBeenCalled();
    expect(context.tx.costComponent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ detailSchemaVersion: 1, quantity: "2", unit: "tickets" }),
    }));
    expect(context.tx.costAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "COMPONENT_UPDATED", metadata: expect.objectContaining({ detailFieldsChanged: true }) }),
    }));
  });

  it("duplicates a component with a new initial snapshot", async () => {
    const context = repositoryContext();
    context.tx.$queryRaw.mockResolvedValue([{ id: "component-a" }]);
    context.tx.costComponent.findFirst.mockResolvedValue(component({ currentSnapshot: snapshot("125.50") }));
    context.tx.costingProject.findFirst.mockResolvedValue(project());
    context.tx.costComponent.create.mockResolvedValue({ id: "component-copy" });
    context.tx.costSnapshot.create.mockResolvedValue({ id: "snapshot-copy" });
    context.tx.costComponent.updateMany.mockResolvedValue({ count: 1 });
    context.tx.costAuditEvent.create.mockResolvedValue({ id: "audit-copy" });

    await expect(context.repository.duplicateComponent("tenant-a", "component-a", undefined, actor)).resolves.toBe("component-copy");

    expect(context.tx.costComponent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ACTIVE", title: "Lodging copy" }) }));
    expect(context.tx.costSnapshot.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ costComponentId: "component-copy", sequence: 1, amount: "125.50" }) }));
  });

  it("rejects a monetary currency different from the project base currency", async () => {
    const context = repositoryContext();
    context.tx.costingProject.findFirst.mockResolvedValue(project());

    await expect(context.repository.createComponent("tenant-a", "project-a", componentInput(), { ...snapshotInput(), currency: "CRC" }, actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(context.tx.costComponent.create).not.toHaveBeenCalled();
  });

  it("returns composition component details with exact quantity serialization, current snapshot, and totals", async () => {
    const repository = {
      getComposition: jest.fn().mockResolvedValue({
        project: project(),
        components: [component({
          detailPayload: { origin: "SJO", destination: "MAD", flightNumbers: ["IB6314"] },
          detailSchemaVersion: 2,
          quantity: { toFixed: () => "2.00000" },
          unit: "tickets",
          currentSnapshot: snapshot("0.10"),
        })],
        total: 1, page: 1, pageSize: 20,
        categoryTotals: [
          { categoryId: "category-a", categoryCode: "LODGING", categoryDisplayName: "Lodging", amount: "0.10" },
          { categoryId: "category-b", categoryCode: "OTHER", categoryDisplayName: "Other", amount: "0.20" },
        ],
      }),
    } as unknown as CostEngineRepository;
    const service = new CostEngineService(repository);

    const result = await service.getComposition("tenant-a", "project-a");

    expect(result.authoritativeTotalCost).toBe("0.3");
    expect(result.categorySubtotals).toHaveLength(2);
    expect(result.components[0]).toMatchObject({
      detailPayload: { origin: "SJO", destination: "MAD", flightNumbers: ["IB6314"] },
      detailSchemaVersion: 2,
      quantity: "2.00000",
      unit: "tickets",
    });
    expect(result.components[0].currentSnapshot.amount).toBe("0.10");
  });

  it("uses one bounded component query with composition details and no per-component detail lookup", async () => {
    const context = repositoryContext();
    context.tx.costingProject.findFirst.mockResolvedValue(project());
    context.tx.costComponent.findMany.mockResolvedValue([]);
    context.tx.costComponent.count.mockResolvedValue(0);
    context.tx.$queryRaw.mockResolvedValue([]);

    await context.repository.getComposition("tenant-a", "project-a", 1, 20);

    expect(context.tx.costComponent.findMany).toHaveBeenCalledTimes(1);
    expect(context.tx.costComponent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: "tenant-a", costingProjectId: "project-a", status: "ACTIVE" },
      take: 20,
      select: expect.objectContaining({
        detailPayload: true,
        detailSchemaVersion: true,
        quantity: true,
        unit: true,
        costCategory: expect.any(Object),
        costSupplier: expect.any(Object),
        currentSnapshot: expect.any(Object),
      }),
    }));
    expect(context.tx.costComponent.findFirst).not.toHaveBeenCalled();
    expect(context.tx.costCategory.findFirst).not.toHaveBeenCalled();
    expect(context.tx.costSupplier.findFirst).not.toHaveBeenCalled();
    expect(context.tx.costSnapshot.findMany).not.toHaveBeenCalled();
    expect(context.tx.costEvidence.findMany).not.toHaveBeenCalled();
  });

  it("reads component history with deterministic bounded pagination", async () => {
    const context = repositoryContext();
    context.tx.costComponent.findFirst.mockResolvedValue({ id: "component-a" });
    context.tx.costSnapshot.findMany.mockResolvedValue([snapshot("125.50")]);
    context.tx.costSnapshot.count.mockResolvedValue(21);

    const result = await context.repository.getComponentHistory("tenant-a", "component-a", 2, 20);

    expect(result).toMatchObject({ total: 21, page: 2, pageSize: 20 });
    expect(context.tx.costSnapshot.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: "tenant-a", costComponentId: "component-a" },
      orderBy: [{ capturedAt: "desc" }, { id: "desc" }], skip: 20, take: 20,
    }));
  });

  it("reads the unified component monetary timeline in one tenant transaction with bounded evidence counts", async () => {
    const context = repositoryContext();
    context.tx.costComponent.findFirst.mockResolvedValue({ id: "component-a" });
    context.tx.$queryRaw.mockResolvedValue([monetaryEvent({ eventType: "INITIAL_COST", evidenceCount: 2, total: 3 })]);

    const result = await context.repository.getComponentMonetaryTimeline("tenant-a", "component-a", 1, 20);

    expect(result).toMatchObject({ total: 3, page: 1, pageSize: 20, events: [expect.objectContaining({ eventType: "INITIAL_COST", evidenceCount: 2 })] });
    expect(context.tx.costComponent.findFirst).toHaveBeenCalledWith({ where: { id: "component-a", tenantId: "tenant-a" }, select: { id: true } });
    expect(context.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(context.tx.costEvidence.findMany).not.toHaveBeenCalled();
    const timelineSql = context.tx.$queryRaw.mock.calls[0][0].join("");
    expect(timelineSql).toContain("CASE WHEN snapshot.\"sequence\" = 1 THEN 'INITIAL_COST' ELSE 'COST_SNAPSHOT' END");
    expect(timelineSql).toContain("AND NOT EXISTS");
    expect(timelineSql).toContain('revision."appliedSnapshotId" = snapshot."id"');
    expect(timelineSql).toContain("evidence_counts AS");
    expect(timelineSql).toContain("SELECT DISTINCT \"snapshotId\" FROM paged_events");
    expect(timelineSql).toContain('ORDER BY "effectiveAt" DESC, "eventId" DESC');
    expect(timelineSql).toContain("LIMIT ");
  });

  it("returns no cross-tenant component timeline rows before querying events", async () => {
    const context = repositoryContext();
    context.tx.costComponent.findFirst.mockResolvedValue(null);

    await expect(context.repository.getComponentMonetaryTimeline("tenant-a", "component-b", 1, 20)).resolves.toBeNull();

    expect(context.tx.$queryRaw).not.toHaveBeenCalled();
  });

  it("maps unified timeline events with exact monetary strings and supports non-AIRFARE project categories", async () => {
    const repository = {
      getProjectMonetaryTimeline: jest.fn().mockResolvedValue({
        events: [monetaryEvent({ eventType: "COST_SNAPSHOT", costCategoryCode: "LODGING", costCategoryDisplayName: "Hospedaje", appliedAmount: "101.23000", observedAmount: null, evidenceCount: 1 })],
        total: 1, page: 1, pageSize: 20,
      }),
    } as unknown as CostEngineRepository;
    const service = new CostEngineService(repository);

    const result = await service.getProjectMonetaryTimeline("tenant-a", "project-a");

    expect(result.events[0]).toMatchObject({
      eventType: "COST_SNAPSHOT", category: { code: "LODGING", displayName: "Hospedaje" }, appliedAmount: "101.23000",
      costCategoryCode: "LODGING", costCategoryDisplayName: "Hospedaje", observedAmount: null, evidenceCount: 1, hasEvidence: true, snapshotId: "snapshot-a", airfareDailyAuthorityId: null,
    });
    expect(result.events[0].businessDate).toBeNull();
    expect(repository.getProjectMonetaryTimeline).toHaveBeenCalledWith("tenant-a", "project-a", 1, 20);
  });

  it("keeps generic snapshots and each authority revision as distinct, non-duplicated timeline events", async () => {
    const repository = {
      getComponentMonetaryTimeline: jest.fn().mockResolvedValue({
        events: [
          monetaryEvent({ eventId: "snapshot-initial", eventType: "INITIAL_COST", snapshotId: "snapshot-initial", appliedSnapshotId: null, airfareDailyAuthorityId: null }),
          monetaryEvent({ eventId: "snapshot-update", eventType: "COST_SNAPSHOT", snapshotId: "snapshot-update", appliedSnapshotId: null, airfareDailyAuthorityId: null }),
          monetaryEvent({ eventId: "revision-agent", eventType: "AGENT_INITIAL", snapshotId: "snapshot-agent", appliedSnapshotId: "snapshot-agent", airfareDailyAuthorityId: "authority-a", observedAmount: "120.00000" }),
          monetaryEvent({ eventId: "revision-admin", eventType: "ADMIN_OVERRIDE", snapshotId: "snapshot-admin", appliedSnapshotId: "snapshot-admin", airfareDailyAuthorityId: "authority-a", observedAmount: "118.00000", overrideReason: "Proveedor corrigió la tarifa" }),
        ], total: 4, page: 1, pageSize: 20,
      }),
    } as unknown as CostEngineRepository;
    const service = new CostEngineService(repository);

    const result = await service.getComponentMonetaryTimeline("tenant-a", "component-a");

    expect(result.events.map((event) => event.eventType)).toEqual(["INITIAL_COST", "COST_SNAPSHOT", "AGENT_INITIAL", "ADMIN_OVERRIDE"]);
    expect(result.events.map((event) => event.eventId)).toEqual(["snapshot-initial", "snapshot-update", "revision-agent", "revision-admin"]);
    expect(result.events[0].airfareDailyAuthorityId).toBeNull();
    expect(result.events[2]).toMatchObject({ snapshotId: "snapshot-agent", appliedSnapshotId: "snapshot-agent", airfareDailyAuthorityId: "authority-a" });
    expect(result.events[3].overrideReason).toBe("Proveedor corrigió la tarifa");
  });

  it("reconstructs bounded project-total change points with exact strings from one joined history query", async () => {
    const context = repositoryContext();
    context.tx.costingProject.findFirst.mockResolvedValue(project());
    context.tx.$queryRaw
      .mockResolvedValueOnce([{ currentAuthoritativeTotal: "175.75000", archivedLifecycleUnknownCount: 0 }])
      .mockResolvedValueOnce([
        evolutionPoint({ effectiveAt: new Date("2026-01-03T10:00:00.000Z"), authoritativeTotal: "175.75000", delta: "25.25000", costComponentId: "component-b", costSnapshotId: "snapshot-b2", costCategoryCode: "AIRFARE", costCategoryDisplayName: "Airfare", eventId: "snapshot-b2", earliestReconstructableTotal: "100.50000", total: 3 }),
        evolutionPoint({ effectiveAt: new Date("2026-01-02T10:00:00.000Z"), authoritativeTotal: "150.50000", delta: "50.00000", costComponentId: "component-a", costSnapshotId: "snapshot-a1", eventId: "snapshot-a1", earliestReconstructableTotal: "100.50000", total: 3 }),
      ]);

    const result = await context.repository.getProjectTotalEvolution("tenant-a", "project-a", 1, 20);

    expect(result).toMatchObject({ baseCurrency: "USD", currentAuthoritativeTotal: "175.75000", earliestReconstructableTotal: "100.50000", total: 3, page: 1, pageSize: 20, lifecycleReconstructionComplete: true, ordering: "EFFECTIVE_TIMESTAMP_DESC" });
    expect(result?.points).toEqual(expect.arrayContaining([
      expect.objectContaining({ authoritativeTotal: "175.75000", delta: "25.25000", costComponentId: "component-b", costSnapshotId: "snapshot-b2", costCategoryCode: "AIRFARE" }),
    ]));
    expect(context.tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(context.tx.costSnapshot.findMany).not.toHaveBeenCalled();
    expect(context.tx.costComponent.findMany).not.toHaveBeenCalled();
    const evolutionSql = context.tx.$queryRaw.mock.calls[1][0].join("");
    expect(evolutionSql).toContain('LAG(snapshot."amount")');
    expect(evolutionSql).toContain('SUM(change."delta") OVER');
    expect(evolutionSql).toContain("'COMPONENT_ARCHIVED'");
    expect(evolutionSql).toContain('LIMIT ');
    expect(evolutionSql).toContain('ORDER BY "effectiveAt" DESC, "eventId" DESC');
  });

  it("returns an explicit archived-component lifecycle limitation instead of inventing historical totals", async () => {
    const context = repositoryContext();
    context.tx.costingProject.findFirst.mockResolvedValue(project());
    context.tx.$queryRaw.mockResolvedValueOnce([{ currentAuthoritativeTotal: "80.00000", archivedLifecycleUnknownCount: 1 }]);

    await expect(context.repository.getProjectTotalEvolution("tenant-a", "project-a", 2, 20)).resolves.toMatchObject({
      currentAuthoritativeTotal: "80.00000", earliestReconstructableTotal: null, points: [], total: 0, page: 2,
      lifecycleReconstructionComplete: false, lifecycleLimitation: "ARCHIVED_COMPONENT_LIFECYCLE_UNKNOWN", archivedLifecycleUnknownCount: 1,
    });
    expect(context.tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("rejects cross-tenant project total evolution before running monetary reconstruction", async () => {
    const context = repositoryContext();
    context.tx.costingProject.findFirst.mockResolvedValue(null);

    await expect(context.repository.getProjectTotalEvolution("tenant-a", "project-b", 1, 20)).resolves.toBeNull();
    expect(context.tx.$queryRaw).not.toHaveBeenCalled();
    expect(context.tx.costingProject.findFirst).toHaveBeenCalledWith({ where: { id: "project-b", tenantId: "tenant-a" }, select: { id: true, baseCurrency: true } });
  });

  it("exposes project-total evolution through the existing ADMIN-only Cost Engine controller", () => {
    expect(Reflect.getMetadata(ROLES_KEY, CostEngineController)).toEqual([UserRole.ADMIN]);
    expect(CostEngineController.prototype.getProjectTotalEvolution).toBeDefined();
  });

  it("exposes component and project monetary timelines through the existing ADMIN-only Cost Engine controller", () => {
    expect(Reflect.getMetadata(ROLES_KEY, CostEngineController)).toEqual([UserRole.ADMIN]);
    expect(CostEngineController.prototype.getComponentMonetaryTimeline).toBeDefined();
    expect(CostEngineController.prototype.getProjectMonetaryTimeline).toBeDefined();
  });

  it("creates evidence metadata only after locking the tenant-scoped snapshot in the tenant transaction", async () => {
    const context = repositoryContext();
    context.tx.$queryRaw.mockResolvedValue([{ id: "snapshot-a" }]);
    context.tx.costEvidence.create.mockResolvedValue({ id: "evidence-a" });

    await context.repository.createEvidence("tenant-a", "snapshot-a", {
      objectKey: "cost-engine/evidence/tenant-a/snapshot-a/object.pdf",
      originalFileName: "object.pdf",
      mimeType: "application/pdf",
      byteSize: 10,
      contentHash: "a".repeat(64),
      uploadedByUserId: "user-a",
      uploadedByName: "Admin A",
    });

    expect(context.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(context.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(context.tx.costEvidence.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: "tenant-a", costSnapshotId: "snapshot-a" }),
    }));
  });

  it("reads evidence by tenant-scoped snapshot with deterministic bounded pagination", async () => {
    const context = repositoryContext();
    context.tx.costSnapshot.findFirst.mockResolvedValue({ id: "snapshot-a" });
    context.tx.costEvidence.findMany.mockResolvedValue([]);
    context.tx.costEvidence.count.mockResolvedValue(0);

    await context.repository.listEvidence("tenant-a", "snapshot-a", 2, 20);

    expect(context.tx.costEvidence.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: "tenant-a", costSnapshotId: "snapshot-a" },
      orderBy: [{ uploadedAt: "desc" }, { id: "desc" }], skip: 20, take: 20,
    }));
  });

  it("provisions standard categories once and keeps the warm list path free of provisioning writes", async () => {
    const context = repositoryContext();
    context.tx.costCategory.findMany.mockResolvedValue([]);
    context.tx.costCategory.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(STANDARD_COST_CATEGORIES.length)
      .mockResolvedValueOnce(STANDARD_COST_CATEGORIES.length)
      .mockResolvedValueOnce(STANDARD_COST_CATEGORIES.length);
    context.tx.costCategory.createMany.mockResolvedValue({ count: STANDARD_COST_CATEGORIES.length });

    await context.repository.listCategories("tenant-a", 1, 20);
    await context.repository.listCategories("tenant-a", 1, 20);

    expect(context.tx.costCategory.createMany).toHaveBeenCalledTimes(1);
    expect(context.tx.costCategory.createMany).toHaveBeenCalledWith({
      data: STANDARD_COST_CATEGORIES.map((category) => expect.objectContaining({ tenantId: "tenant-a", code: category.code, origin: "STANDARD" })),
      skipDuplicates: true,
    });
    expect(context.tx.costCategory.upsert).not.toHaveBeenCalled();
  });

  it("keeps custom categories separate from Cost Engine-owned standard codes", async () => {
    const context = repositoryContext();
    context.tx.costCategory.create.mockResolvedValue({ id: "category-a", code: "CUSTOM_FEE", origin: "CUSTOM" });
    await context.repository.createCategory("tenant-a", "CUSTOM_FEE", "Custom Fee");
    expect(context.tx.costCategory.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenantId: "tenant-a", code: "CUSTOM_FEE", origin: "CUSTOM" }) }));

    context.tx.costCategory.updateMany.mockResolvedValue({ count: 1 });
    context.tx.costCategory.findFirst.mockResolvedValue({ id: "category-a", code: "CUSTOM_FEE", displayName: "Custom Fee", isActive: false });
    await context.repository.updateCategory("tenant-a", "category-a", { displayName: "Stay", isActive: false });
    expect(context.tx.costCategory.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { displayName: "Stay", isActive: false } }));

    context.tx.costCategory.create.mockRejectedValue({ code: "P2002" });
    await expect(context.repository.createCategory("tenant-a", "CUSTOM_FEE", "Duplicate")).rejects.toBeInstanceOf(ConflictException);
    expect(STANDARD_COST_CATEGORIES.map((category) => category.code)).toEqual([
      "AIRFARE", "BAGGAGE", "LODGING", "TRANSPORTATION", "TOUR",
      "INSURANCE", "EVENT_TICKET", "VISA_ASSISTANCE", "MEALS", "OTHER",
    ]);
  });

  it("does not create a custom category with a standard category code", async () => {
    const context = repositoryContext();
    context.tx.costCategory.count.mockResolvedValue(0);
    context.tx.costCategory.createMany.mockResolvedValue({ count: STANDARD_COST_CATEGORIES.length });
    context.tx.costCategory.create.mockRejectedValue({ code: "P2002" });

    await expect(context.repository.createCategory("tenant-a", "AIRFARE", "Duplicate airfare")).rejects.toBeInstanceOf(ConflictException);

    expect(context.tx.costCategory.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    expect(context.tx.costCategory.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ code: "AIRFARE", origin: "CUSTOM" }) }));
  });

  it("lists active categories tenant-scoped with bounded deterministic pagination and no relation queries", async () => {
    const context = repositoryContext();
    context.tx.costCategory.findMany.mockResolvedValue([]);
    context.tx.costCategory.count.mockResolvedValue(0);
    await context.repository.listCategories("tenant-a", 1, 20);
    expect(context.tx.costCategory.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "tenant-a", isActive: true }, take: 20, orderBy: [{ displayName: "asc" }, { id: "asc" }] }));
    expect(context.tx.costComponent.findFirst).not.toHaveBeenCalled();
  });

  it("creates, updates, and deactivates Cost Engine-owned suppliers", async () => {
    const context = repositoryContext();
    context.tx.costSupplier.create.mockResolvedValue({ id: "supplier-a", name: "Offline Vendor", website: null, notes: null, isActive: true });
    await context.repository.createSupplier("tenant-a", { name: "Offline Vendor", website: null, notes: null });
    expect(context.tx.costSupplier.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenantId: "tenant-a", name: "Offline Vendor", website: null }) }));

    context.tx.costSupplier.updateMany.mockResolvedValue({ count: 1 });
    context.tx.costSupplier.findFirst.mockResolvedValue({ id: "supplier-a", isActive: false });
    await context.repository.updateSupplier("tenant-a", "supplier-a", { notes: "Manual", isActive: false });
    await context.repository.archiveSupplier("tenant-a", "supplier-a");
    expect(context.tx.costSupplier.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: "supplier-a", tenantId: "tenant-a" }, data: { isActive: false } }));
  });

  it("manages generic applicability only for components in the current tenant", async () => {
    const context = repositoryContext();
    context.tx.costComponent.findFirst.mockResolvedValue(null);
    await expect(context.repository.createApplicability("tenant-a", "component-b", applicabilityInput())).rejects.toBeInstanceOf(NotFoundException);

    context.tx.costComponent.findFirst.mockResolvedValue({ id: "component-a" });
    context.tx.costApplicability.create.mockResolvedValue({ id: "app-a", scopeType: "UNIT" });
    await context.repository.createApplicability("tenant-a", "component-a", applicabilityInput());
    expect(context.tx.costApplicability.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenantId: "tenant-a", costComponentId: "component-a", scopeType: "UNIT" }) }));

    context.tx.costApplicability.updateMany.mockResolvedValue({ count: 1 });
    context.tx.costApplicability.findFirst.mockResolvedValue({ id: "app-a", label: "Updated" });
    await context.repository.updateApplicability("tenant-a", "app-a", { label: "Updated" });
    context.tx.costApplicability.deleteMany.mockResolvedValue({ count: 1 });
    await expect(context.repository.deleteApplicability("tenant-a", "app-a")).resolves.toBeUndefined();
  });

  it("enforces the 25-item pagination maximum at the API DTO boundary", async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    await expect(pipe.transform({ page: "1", pageSize: "26" }, { type: "query", metatype: ListCostComponentsDto })).rejects.toBeDefined();
  });
});

function repositoryContext(options: { rollbackOnError?: boolean } = {}) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn(),
    costingProject: delegate(), costCategory: delegate(), costSupplier: delegate(),
    costComponent: delegate(), costSnapshot: delegate(), costAuditEvent: delegate(), costApplicability: delegate(),
    costEvidence: delegate(),
  };
  const root: any = {
    rollback: jest.fn(),
    $transaction: jest.fn(async (work: (value: typeof tx) => Promise<unknown>) => {
      try { return await work(tx); } catch (error) { if (options.rollbackOnError) root.rollback(); throw error; }
    }),
  };
  return { tx, root, repository: new CostEngineRepository(root as PrismaService) };
}

function delegate() {
  return { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), createMany: jest.fn(), upsert: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() };
}

function project() { return { id: "project-a", baseCurrency: "USD", status: "ACTIVE", displayName: "Project" }; }
function component(overrides: Record<string, unknown> = {}) { return { id: "component-a", costingProjectId: "project-a", costCategoryId: "category-a", costSupplierId: null, title: "Lodging", description: null, detailPayload: null, detailSchemaVersion: null, quantity: null, unit: null, costCategory: { code: "OTHER", origin: "STANDARD" }, sortPosition: 0, ...overrides }; }
function snapshot(amount: string) { return { id: "snapshot-a", amount: { toFixed: () => amount }, currency: "USD", sourceReference: null, sourceUrl: null }; }
function evolutionPoint(overrides: Record<string, unknown> = {}) { return { effectiveAt: new Date("2026-01-01T10:00:00.000Z"), authoritativeTotal: "100.50000", delta: "100.50000", costComponentId: "component-a", costSnapshotId: "snapshot-a1", costCategoryCode: "LODGING", costCategoryDisplayName: "Lodging", sourceReference: "Quote", sourceUrl: null, reason: null, eventKind: "SNAPSHOT", eventId: "snapshot-a1", earliestReconstructableTotal: "100.50000", total: 1, ...overrides }; }
function monetaryEvent(overrides: Record<string, unknown> = {}) { return { eventId: "snapshot-a", eventType: "INITIAL_COST", costingProjectId: "project-a", costComponentId: "component-a", costCategoryCode: "AIRFARE", costCategoryDisplayName: "Boleto aéreo", componentTitle: "SJO → MAD", effectiveAt: new Date("2026-01-01T10:00:00.000Z"), businessDate: null, appliedAmount: "100.00000", observedAmount: null, currency: "USD", actorUserId: "user-a", actorName: "Admin A", sourceReference: "Cotización", sourceUrl: "https://provider.example/quote", snapshotId: "snapshot-a", appliedSnapshotId: null, airfareDailyAuthorityId: null, overrideReason: null, evidenceCount: 0, total: 1, ...overrides }; }
function componentInput() { return { costCategoryId: "category-a", costSupplierId: null, title: "Lodging", description: null, detailPayload: null, detailSchemaVersion: null, quantity: null, unit: null, sortPosition: 0 }; }
function snapshotInput() { return { amount: "125.50", currency: "USD", sourceReference: null, sourceUrl: null, reason: null }; }
function applicabilityInput() { return { scopeType: "UNIT", scopeKey: null, label: null, startDate: null, endDate: null }; }
