import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ROLES_KEY } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AirfareDailyAuthorityController } from "./airfare-daily-authority.controller";
import { AirfareDailyAuthorityService } from "./airfare-daily-authority.service";
import { TenantBusinessDateResolver } from "./tenant-business-date.resolver";

const agent = { userId: "agent-a", name: "Agent A" };
const admin = { userId: "admin-a", name: "Admin A" };
const observation = { observedAmount: "125.50", sourceReference: "Quote 123", sourceUrl: "https://supplier.example/quote", reason: "Daily quote" };

describe("AIRFARE daily authority writes", () => {
  it("creates the first AGENT authority, snapshot, revision, and both pointers atomically using tenant-local business date", async () => {
    const context = serviceContext({ timezone: "America/Los_Angeles", now: new Date("2026-01-02T02:00:00.000Z") });

    const result = await context.service.registerAgentInitial("tenant-a", "component-a", observation, agent);

    expect(result).toMatchObject({ authorityId: "authority-a", revisionId: "revision-a", snapshotId: "snapshot-a", businessDate: "2026-01-01" });
    expect(context.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(context.tx.tenantBillingConfiguration.findUnique).toHaveBeenCalledWith({ where: { tenantId: "tenant-a" }, select: { fiscalTimezone: true } });
    expect(context.tx.airfareDailyAuthority.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenantId: "tenant-a", costComponentId: "component-a" }) }));
    expect(context.tx.costSnapshot.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: "125.50", currency: "USD", sequence: 3 }) }));
    expect(context.tx.airfareDailyAuthorityRevision.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: "AGENT_INITIAL", observedAmount: "125.50", appliedSnapshotId: "snapshot-a", revisionNumber: 1 }) }));
    expect(context.tx.airfareDailyAuthority.updateMany).toHaveBeenCalledWith({ where: { id: "authority-a", tenantId: "tenant-a" }, data: { currentRevisionId: "revision-a" } });
    expect(context.tx.costComponent.updateMany).toHaveBeenCalledWith({ where: { id: "component-a", tenantId: "tenant-a" }, data: { currentSnapshotId: "snapshot-a" } });
    expect(context.tx.costAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "AIRFARE_DAILY_AUTHORITY_REGISTERED", reason: "Daily quote" }) }));
  });

  it("uses the tenant fallback timezone rather than the UTC calendar date when configuration is absent", async () => {
    const context = serviceContext({ timezone: null, now: new Date("2026-01-02T03:00:00.000Z") });
    await context.service.registerAgentInitial("tenant-a", "component-a", observation, agent);
    expect(context.tx.airfareDailyAuthority.create.mock.calls[0][0].data.businessDate.toISOString().slice(0, 10)).toBe("2026-01-01");
  });

  it("maps only the daily authority unique conflict and leaves no surviving later writes", async () => {
    const context = serviceContext();
    context.tx.airfareDailyAuthority.create.mockRejectedValue({ code: "P2002", meta: { target: ["tenantId", "costComponentId", "businessDate"] } });

    await expect(context.service.registerAgentInitial("tenant-a", "component-a", observation, agent)).rejects.toThrow(new ConflictException("AIRFARE_DAILY_AUTHORITY_ALREADY_REGISTERED"));
    expect(context.tx.costSnapshot.create).not.toHaveBeenCalled();
    expect(context.tx.airfareDailyAuthorityRevision.create).not.toHaveBeenCalled();
    expect(context.tx.costAuditEvent.create).not.toHaveBeenCalled();
  });

  it("does not swallow unrelated persistence errors", async () => {
    const context = serviceContext();
    context.tx.airfareDailyAuthority.create.mockRejectedValue(new Error("storage unavailable"));
    await expect(context.service.registerAgentInitial("tenant-a", "component-a", observation, agent)).rejects.toThrow("storage unavailable");
  });

  it("rejects cross-tenant, non-AIRFARE, archived, unlinked, and terminal components through the single eligible lock", async () => {
    const context = serviceContext({ eligible: null });
    await expect(context.service.registerAgentInitial("tenant-b", "component-a", observation, agent)).rejects.toBeInstanceOf(NotFoundException);
    expect(context.tx.airfareDailyAuthority.create).not.toHaveBeenCalled();
  });

  it("rolls back when a later atomic write fails", async () => {
    const context = serviceContext({ rollbackOnError: true });
    context.tx.costAuditEvent.create.mockRejectedValue(new Error("audit failure"));
    await expect(context.service.registerAgentInitial("tenant-a", "component-a", observation, agent)).rejects.toThrow("audit failure");
    expect(context.root.rollback).toHaveBeenCalledTimes(1);
  });

  it("requires a nonblank ADMIN override reason", async () => {
    const context = serviceContext();
    await expect(context.service.override("tenant-a", "authority-a", { ...observation, overrideReason: " " }, admin)).rejects.toBeInstanceOf(BadRequestException);
    expect(context.root.$transaction).not.toHaveBeenCalled();
  });

  it("appends an ADMIN override revision and advances the authority and component pointers without changing the initial revision", async () => {
    const context = serviceContext({ authority: true });
    const result = await context.service.override("tenant-a", "authority-a", { ...observation, observedAmount: "140.25", overrideReason: "Supplier correction" }, admin);

    expect(result).toEqual({ authorityId: "authority-a", revisionId: "revision-a", snapshotId: "snapshot-a" });
    expect(context.tx.airfareDailyAuthorityRevision.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: "ADMIN_OVERRIDE", revisionNumber: 2, observedAmount: "140.25", overrideReason: "Supplier correction", appliedSnapshotId: "snapshot-a" }) }));
    expect(context.tx.airfareDailyAuthorityRevision.updateMany).not.toHaveBeenCalled();
    expect(context.tx.costSnapshot.updateMany).not.toHaveBeenCalled();
    expect(context.tx.airfareDailyAuthority.updateMany).toHaveBeenCalledWith({ where: { id: "authority-a", tenantId: "tenant-a" }, data: { currentRevisionId: "revision-a" } });
    expect(context.tx.costComponent.updateMany).toHaveBeenCalledWith({ where: { id: "component-a", tenantId: "tenant-a" }, data: { currentSnapshotId: "snapshot-a" } });
    expect(context.tx.costAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "AIRFARE_DAILY_AUTHORITY_OVERRIDDEN", reason: "Supplier correction", metadata: expect.objectContaining({ previousRevisionId: "revision-initial" }) }) }));
  });

  it("exposes AGENT initial and ADMIN override on separate guarded routes", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AirfareDailyAuthorityController)).toBeDefined();
    expect(Reflect.getMetadata(ROLES_KEY, AirfareDailyAuthorityController.prototype.registerAgentInitial)).toEqual([UserRole.AGENT]);
    expect(Reflect.getMetadata(ROLES_KEY, AirfareDailyAuthorityController.prototype.override)).toEqual([UserRole.ADMIN]);
    expect(canActivate(UserRole.ADMIN, "registerAgentInitial")).toBe(false);
    expect(canActivate(UserRole.AGENT, "override")).toBe(false);
  });

  it("returns a single bounded AGENT task read model with AIRFARE route details and exact current cost", async () => {
    const context = serviceContext({ now: new Date("2026-01-02T03:00:00.000Z") });
    context.tx.$queryRaw.mockResolvedValueOnce([dailyTask({ total: 1 })]);

    const result = await context.service.listAgentDailyTasks("tenant-a", 1, 20);

    expect(result).toMatchObject({ total: 1, page: 1, pageSize: 20, tasks: [{
      costComponentId: "component-a", costingProjectId: "project-a", title: "SJO to MAD",
      sourceTravelType: "TRAVEL_PACKAGE", sourceTravelId: "package-a", travelName: "Spain",
      detailPayload: { flightType: "INTERNATIONAL", tripType: "ONE_WAY", origin: "SJO", destination: "MAD", departureDate: "2026-02-01", airline: "IB" },
      currentSnapshot: { amount: "125.50000", currency: "USD" }, baseCurrency: "USD", taskStatus: "PENDING",
    }] });
    expect(context.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(context.tx.costComponent.findFirst).toBeUndefined();
    expect(context.tx.costSnapshot.findMany).toBeUndefined();
    const taskSql = context.tx.$queryRaw.mock.calls[0][0].join("");
    expect(taskSql).toContain('"TravelPackage"');
    expect(taskSql).toContain('"internal_trips"');
    expect(taskSql).toContain('authority."id" IS NULL');
    expect(taskSql).toContain("'CANCELLED', 'COMPLETED'");
    expect(taskSql).toContain('DISTINCT ON ("costComponentId")');
  });

  it("keeps independent AIRFARE components from the same travel entity as separate daily tasks", async () => {
    const context = serviceContext();
    context.tx.$queryRaw.mockResolvedValueOnce([
      dailyTask({ costComponentId: "component-sjo-mad", title: "SJO → MAD", total: 2 }),
      dailyTask({ costComponentId: "component-mad-cai", title: "MAD → CAI", detailPayload: { flightType: "INTERNATIONAL", tripType: "ONE_WAY", origin: "MAD", destination: "CAI", departureDate: "2026-02-02" }, total: 2 }),
    ]);

    const result = await context.service.listAgentDailyTasks("tenant-a", 1, 20);
    const tasks = result.tasks as Array<{ costComponentId: string; sourceTravelId: string }>;

    expect(tasks.map((task) => task.costComponentId)).toEqual(["component-sjo-mad", "component-mad-cai"]);
    expect(tasks.map((task) => task.sourceTravelId)).toEqual(["package-a", "package-a"]);
    expect(context.tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("uses tenant-local business date for task eligibility and reports pending versus registered counts without row queries", async () => {
    const context = serviceContext({ timezone: "America/Los_Angeles", now: new Date("2026-01-02T02:00:00.000Z") });
    context.tx.$queryRaw.mockResolvedValueOnce([{ pendingToday: 2, registeredToday: 3 }]);

    await expect(context.service.getAgentDailyStatus("tenant-a")).resolves.toEqual({ businessDate: "2026-01-01", pendingToday: 2, registeredToday: 3 });
    expect(context.tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("returns ADMIN history in bounded deterministic order without eager evidence and preserves observed versus applied amounts", async () => {
    const context = serviceContext();
    context.tx.$queryRaw.mockResolvedValueOnce([{ id: "component-a" }]).mockResolvedValueOnce([
      history({ revisionId: "override-a", revisionNumber: 2, kind: "ADMIN_OVERRIDE", observedAmount: "90.00000", appliedAmount: "95.00000", overrideReason: "Correction", appliedSnapshotId: "snapshot-override-a", total: 2 }),
      history({ revisionId: "initial-a", revisionNumber: 1, kind: "AGENT_INITIAL", total: 2 }),
    ]);

    const result = await context.service.listComponentHistory("tenant-a", "component-a", 1, 20);
    const revisions = result.history as Array<Record<string, unknown>>;

    expect(revisions).toHaveLength(2);
    expect(revisions[0]).toMatchObject({ revisionNumber: 2, isOverride: true, observedAmount: "90.00000", appliedAmount: "95.00000", overrideReason: "Correction", airfareDailyAuthorityId: "authority-a", appliedSnapshotId: "snapshot-override-a" });
    expect(revisions[1]).toMatchObject({ revisionNumber: 1, isOverride: false, airfareDailyAuthorityId: "authority-a", appliedSnapshotId: "snapshot-initial-a" });
    expect(context.tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(context.tx.costEvidence).toBeUndefined();
  });

  it("tenant-scopes project history and rejects a missing cross-tenant project before reading revisions", async () => {
    const context = serviceContext();
    context.tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(context.service.listProjectHistory("tenant-a", "project-b", 1, 20)).rejects.toBeInstanceOf(NotFoundException);
    expect(context.tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("returns project-wide history with one bounded revision query after the tenant-scoped project check", async () => {
    const context = serviceContext();
    context.tx.$queryRaw.mockResolvedValueOnce([{ id: "project-a" }]).mockResolvedValueOnce([history({ total: 1 })]);

    const result = await context.service.listProjectHistory("tenant-a", "project-a", 1, 20);
    const projectHistory = result.history as Array<Record<string, unknown>>;

    expect(result).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(projectHistory[0]).toMatchObject({ airfareDailyAuthorityId: "authority-a", appliedSnapshotId: "snapshot-initial-a" });
    expect(context.tx.$queryRaw).toHaveBeenCalledTimes(2);
    const historySql = context.tx.$queryRaw.mock.calls[1][0].join("");
    expect(historySql).toContain('authority."id" AS "airfareDailyAuthorityId"');
    expect(historySql).toContain('revision."appliedSnapshotId"');
    expect(historySql).toContain('"cost_snapshots"');
    expect(historySql).not.toContain('"cost_evidence"');
    expect(historySql).toContain('authority."businessDate" DESC, revision."revisionNumber" DESC, revision."id" DESC');
  });

  it("guards daily task and history routes by their respective AGENT and ADMIN roles", () => {
    expect(Reflect.getMetadata(ROLES_KEY, AirfareDailyAuthorityController.prototype.listDailyTasks)).toEqual([UserRole.AGENT]);
    expect(Reflect.getMetadata(ROLES_KEY, AirfareDailyAuthorityController.prototype.getDailyStatus)).toEqual([UserRole.AGENT]);
    expect(Reflect.getMetadata(ROLES_KEY, AirfareDailyAuthorityController.prototype.listComponentHistory)).toEqual([UserRole.ADMIN]);
    expect(Reflect.getMetadata(ROLES_KEY, AirfareDailyAuthorityController.prototype.listProjectHistory)).toEqual([UserRole.ADMIN]);
    expect(canActivate(UserRole.ADMIN, "listDailyTasks")).toBe(false);
    expect(canActivate(UserRole.AGENT, "listComponentHistory")).toBe(false);
  });
});

function serviceContext(options: { timezone?: string | null; now?: Date; eligible?: null; authority?: boolean; rollbackOnError?: boolean } = {}) {
  const tx: any = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue(options.authority ? [authority()] : options.eligible === null ? [] : [component()]),
    tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue(options.timezone === null ? null : { fiscalTimezone: options.timezone ?? "America/Costa_Rica" }) },
    airfareDailyAuthority: { create: jest.fn().mockResolvedValue({ id: "authority-a" }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    airfareDailyAuthorityRevision: { create: jest.fn().mockResolvedValue({ id: "revision-a" }), findFirst: jest.fn().mockResolvedValue(options.authority ? { revisionNumber: 1 } : null), updateMany: jest.fn() },
    costSnapshot: { findFirst: jest.fn().mockResolvedValue({ sequence: 2 }), create: jest.fn().mockResolvedValue({ id: "snapshot-a" }), updateMany: jest.fn() },
    costComponent: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    costAuditEvent: { create: jest.fn().mockResolvedValue({ id: "audit-a" }) },
  };
  const root: any = { rollback: jest.fn(), $transaction: jest.fn(async (work: (value: typeof tx) => Promise<unknown>) => { try { return await work(tx); } catch (error) { if (options.rollbackOnError) root.rollback(); throw error; } }) };
  const resolver = new TenantBusinessDateResolver();
  const now = options.now ?? new Date("2026-01-02T18:00:00.000Z");
  const resolve = resolver.resolve.bind(resolver);
  jest.spyOn(resolver, "resolve").mockImplementation((transaction, tenantId) => resolve(transaction, tenantId, now));
  return { root, tx, service: new AirfareDailyAuthorityService(root as PrismaService, resolver) };
}

function component() { return { id: "component-a", costingProjectId: "project-a", baseCurrency: "USD" }; }
function authority() { return { ...component(), authorityId: "authority-a", currentRevisionId: "revision-initial" }; }

function dailyTask(overrides: Record<string, unknown> = {}) {
  return {
    costComponentId: "component-a", costingProjectId: "project-a", sourceType: "TRAVEL_PACKAGE", sourceTravelId: "package-a",
    travelName: "Spain", startDate: new Date("2026-02-01T00:00:00.000Z"), endDate: new Date("2026-02-10T00:00:00.000Z"),
    title: "SJO to MAD", detailPayload: { flightType: "INTERNATIONAL", tripType: "ONE_WAY", origin: "SJO", destination: "MAD", departureDate: "2026-02-01", airline: "IB", hidden: "not-returned" },
    currentAmount: "125.50000", currentCurrency: "USD", baseCurrency: "USD", total: 1, ...overrides,
  };
}

function history(overrides: Record<string, unknown> = {}) {
  return {
    businessDate: new Date("2026-01-01T00:00:00.000Z"), observedAmount: "100.00000", appliedAmount: "100.00000", kind: "AGENT_INITIAL",
    actorUserId: "agent-a", actorName: "Agent A", observedAt: new Date("2026-01-01T12:00:00.000Z"), createdAt: new Date("2026-01-01T12:00:00.000Z"),
    sourceReference: "Quote", sourceUrl: "https://supplier.example/quote", overrideReason: null, costComponentId: "component-a", costingProjectId: "project-a",
    airfareDailyAuthorityId: "authority-a", appliedSnapshotId: "snapshot-initial-a",
    title: "SJO to MAD", detailPayload: { origin: "SJO", destination: "MAD", departureDate: "2026-02-01" }, revisionNumber: 1, revisionId: "initial-a", total: 1, ...overrides,
  };
}

function canActivate(role: UserRole, method: "registerAgentInitial" | "override" | "listDailyTasks" | "listComponentHistory") {
  try {
    return new RolesGuard(new Reflector()).canActivate({
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
      getHandler: () => AirfareDailyAuthorityController.prototype[method],
      getClass: () => AirfareDailyAuthorityController,
    } as never);
  } catch {
    return false;
  }
}
