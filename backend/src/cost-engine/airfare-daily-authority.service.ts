import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { runCostEngineTenantTransaction } from "./cost-engine-transaction";
import { TenantBusinessDateResolver } from "./tenant-business-date.resolver";

export type AirfareAuthorityActor = { userId: string; name: string };
export type AirfareObservation = { observedAmount: string; sourceReference?: string | null; sourceUrl?: string | null; reason?: string | null };
export type AirfareOverride = AirfareObservation & { overrideReason: string };

type AirfareTransaction = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  tenantBillingConfiguration: { findUnique(args: unknown): Promise<{ fiscalTimezone: string } | null> };
  airfareDailyAuthority: Record<string, (args: any) => Promise<any>>;
  airfareDailyAuthorityRevision: Record<string, (args: any) => Promise<any>>;
  costSnapshot: Record<string, (args: any) => Promise<any>>;
  costComponent: Record<string, (args: any) => Promise<any>>;
  costAuditEvent: Record<string, (args: any) => Promise<any>>;
};

type AirfareDatabase = { $transaction<T>(work: (tx: AirfareTransaction) => Promise<T>): Promise<T> };

type EligibleComponent = { id: string; costingProjectId: string; baseCurrency: string };
type LockedAuthority = EligibleComponent & { authorityId: string; currentRevisionId: string | null };
type DailyTaskRow = {
  costComponentId: string; costingProjectId: string; sourceType: "TRAVEL_PACKAGE" | "INTERNAL_TRIP";
  sourceTravelId: string; travelName: string; startDate: Date; endDate: Date;
  title: string; detailPayload: unknown; currentAmount: string | null; currentCurrency: string | null;
  baseCurrency: string; total: bigint | number | string;
};
type DailyStatusRow = { pendingToday: bigint | number | string; registeredToday: bigint | number | string };
type HistoryRow = {
  businessDate: Date; observedAmount: string; appliedAmount: string; kind: "AGENT_INITIAL" | "ADMIN_OVERRIDE";
  actorUserId: string; actorName: string; observedAt: Date; createdAt: Date; sourceReference: string | null;
  sourceUrl: string | null; overrideReason: string | null; costComponentId: string; costingProjectId: string;
  airfareDailyAuthorityId: string; appliedSnapshotId: string;
  title: string; detailPayload: unknown; revisionNumber: number; revisionId: string; total: bigint | number | string;
};

@Injectable()
export class AirfareDailyAuthorityService {
  private readonly database: AirfareDatabase;
  private readonly logger = new Logger(AirfareDailyAuthorityService.name);

  constructor(prisma: PrismaService, private readonly businessDates: TenantBusinessDateResolver) {
    this.database = prisma as unknown as AirfareDatabase;
  }

  async registerAgentInitial(tenantId: string, costComponentId: string, input: AirfareObservation, actor: AirfareAuthorityActor) {
    const observation = normalizeObservation(input);
    try {
      return await this.withTenantTransaction(tenantId, "airfare.register-daily", async (tx) => {
        const component = await this.lockEligibleComponent(tx, tenantId, costComponentId);
        const businessDate = await this.businessDates.resolve(tx, tenantId);
        const authority = await tx.airfareDailyAuthority.create({
          data: { tenantId, costingProjectId: component.costingProjectId, costComponentId: component.id, businessDate },
          select: { id: true },
        });
        const snapshot = await this.createSnapshot(tx, tenantId, component, observation, actor);
        const revision = await tx.airfareDailyAuthorityRevision.create({
          data: {
            tenantId, airfareDailyAuthorityId: authority.id, costingProjectId: component.costingProjectId,
            costComponentId: component.id, revisionNumber: 1, kind: "AGENT_INITIAL",
            observedAmount: observation.observedAmount, appliedSnapshotId: snapshot.id,
            sourceReference: observation.sourceReference, sourceUrl: observation.sourceUrl,
            actorUserId: actor.userId, actorName: actor.name,
          },
          select: { id: true },
        });
        await this.advancePointers(tx, tenantId, authority.id, component.id, revision.id, snapshot.id);
        await tx.costAuditEvent.create({
          data: {
            tenantId, costingProjectId: component.costingProjectId, costComponentId: component.id,
            action: "AIRFARE_DAILY_AUTHORITY_REGISTERED", actorUserId: actor.userId, actorName: actor.name,
            reason: observation.reason, metadata: { airfareDailyAuthorityId: authority.id, airfareDailyAuthorityRevisionId: revision.id, businessDate: businessDate.toISOString().slice(0, 10), appliedSnapshotId: snapshot.id },
          },
        });
        return { authorityId: authority.id, revisionId: revision.id, snapshotId: snapshot.id, businessDate: businessDate.toISOString().slice(0, 10) };
      });
    } catch (error) {
      if (isDailyAuthorityUniqueViolation(error)) throw new ConflictException("AIRFARE_DAILY_AUTHORITY_ALREADY_REGISTERED");
      throw error;
    }
  }

  async override(tenantId: string, airfareDailyAuthorityId: string, input: AirfareOverride, actor: AirfareAuthorityActor) {
    const observation = normalizeObservation(input);
    const overrideReason = requiredText(input.overrideReason, "Override reason");
    return this.withTenantTransaction(tenantId, "airfare.override", async (tx) => {
      const authority = await this.lockEligibleAuthority(tx, tenantId, airfareDailyAuthorityId);
      const lastRevision = await tx.airfareDailyAuthorityRevision.findFirst({
        where: { tenantId, airfareDailyAuthorityId }, select: { revisionNumber: true },
        orderBy: [{ revisionNumber: "desc" }, { id: "desc" }],
      });
      const snapshot = await this.createSnapshot(tx, tenantId, authority, observation, actor);
      const revision = await tx.airfareDailyAuthorityRevision.create({
        data: {
          tenantId, airfareDailyAuthorityId, costingProjectId: authority.costingProjectId,
          costComponentId: authority.id, revisionNumber: (lastRevision?.revisionNumber ?? 0) + 1,
          kind: "ADMIN_OVERRIDE", observedAmount: observation.observedAmount, appliedSnapshotId: snapshot.id,
          sourceReference: observation.sourceReference, sourceUrl: observation.sourceUrl, overrideReason,
          actorUserId: actor.userId, actorName: actor.name,
        },
        select: { id: true },
      });
      await this.advancePointers(tx, tenantId, airfareDailyAuthorityId, authority.id, revision.id, snapshot.id);
      await tx.costAuditEvent.create({
        data: {
          tenantId, costingProjectId: authority.costingProjectId, costComponentId: authority.id,
          action: "AIRFARE_DAILY_AUTHORITY_OVERRIDDEN", actorUserId: actor.userId, actorName: actor.name,
          reason: overrideReason, metadata: { airfareDailyAuthorityId, airfareDailyAuthorityRevisionId: revision.id, previousRevisionId: authority.currentRevisionId, appliedSnapshotId: snapshot.id },
        },
      });
      return { authorityId: airfareDailyAuthorityId, revisionId: revision.id, snapshotId: snapshot.id };
    });
  }

  async listAgentDailyTasks(tenantId: string, page = 1, pageSize = 20) {
    return this.withTenantTransaction(tenantId, "airfare.list-daily-tasks", async (tx) => {
      const businessDate = await this.businessDates.resolve(tx, tenantId);
      const rows = await tx.$queryRaw<DailyTaskRow[]>`
        WITH eligible AS (
          SELECT component."id" AS "costComponentId", component."costingProjectId", 'TRAVEL_PACKAGE'::text AS "sourceType",
                 travel."id" AS "sourceTravelId", travel."name" AS "travelName", travel."departureDate" AS "startDate", travel."returnDate" AS "endDate",
                 component."title", component."detailPayload", snapshot."amount"::text AS "currentAmount", snapshot."currency"::text AS "currentCurrency",
                 project."baseCurrency"
          FROM "cost_components" component
          JOIN "cost_categories" category ON category."id" = component."costCategoryId" AND category."tenantId" = component."tenantId"
          JOIN "costing_projects" project ON project."id" = component."costingProjectId" AND project."tenantId" = component."tenantId"
          JOIN "travel_package_costing_project_links" link ON link."costingProjectId" = project."id" AND link."tenantId" = project."tenantId"
          JOIN "TravelPackage" travel ON travel."id" = link."travelPackageId" AND travel."tenantId" = link."tenantId"
          LEFT JOIN "airfare_daily_authorities" authority ON authority."tenantId" = component."tenantId" AND authority."costComponentId" = component."id" AND authority."businessDate" = ${businessDate}
          LEFT JOIN "cost_snapshots" snapshot ON snapshot."id" = component."currentSnapshotId" AND snapshot."tenantId" = component."tenantId" AND snapshot."costComponentId" = component."id"
          WHERE component."tenantId" = ${tenantId} AND component."status" = 'ACTIVE'::"CostComponentStatus"
            AND category."origin" = 'STANDARD'::"CostCategoryOrigin" AND category."code" = 'AIRFARE'
            AND project."status" <> 'ARCHIVED'::"CostingProjectStatus" AND travel."status" NOT IN ('CANCELLED', 'COMPLETED')
            AND authority."id" IS NULL
          UNION ALL
          SELECT component."id", component."costingProjectId", 'INTERNAL_TRIP'::text,
                 travel."id", travel."name", travel."departureDate", travel."returnDate",
                 component."title", component."detailPayload", snapshot."amount"::text, snapshot."currency"::text, project."baseCurrency"
          FROM "cost_components" component
          JOIN "cost_categories" category ON category."id" = component."costCategoryId" AND category."tenantId" = component."tenantId"
          JOIN "costing_projects" project ON project."id" = component."costingProjectId" AND project."tenantId" = component."tenantId"
          JOIN "internal_trip_costing_project_links" link ON link."costingProjectId" = project."id" AND link."tenantId" = project."tenantId"
          JOIN "internal_trips" travel ON travel."id" = link."internalTripId" AND travel."tenantId" = link."tenantId"
          LEFT JOIN "airfare_daily_authorities" authority ON authority."tenantId" = component."tenantId" AND authority."costComponentId" = component."id" AND authority."businessDate" = ${businessDate}
          LEFT JOIN "cost_snapshots" snapshot ON snapshot."id" = component."currentSnapshotId" AND snapshot."tenantId" = component."tenantId" AND snapshot."costComponentId" = component."id"
          WHERE component."tenantId" = ${tenantId} AND component."status" = 'ACTIVE'::"CostComponentStatus"
            AND category."origin" = 'STANDARD'::"CostCategoryOrigin" AND category."code" = 'AIRFARE'
            AND project."status" <> 'ARCHIVED'::"CostingProjectStatus" AND travel."status" NOT IN ('CANCELLED', 'COMPLETED')
            AND authority."id" IS NULL
        ), deduplicated AS (
          SELECT DISTINCT ON ("costComponentId") * FROM eligible ORDER BY "costComponentId", "sourceType"
        )
        SELECT *, COUNT(*) OVER() AS "total" FROM deduplicated
        ORDER BY "startDate" ASC, "sourceType" ASC, "costComponentId" ASC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `;
      return paged("tasks", rows, page, pageSize, taskResponse);
    });
  }

  async getAgentDailyStatus(tenantId: string) {
    return this.withTenantTransaction(tenantId, "airfare.get-daily-status", async (tx) => {
      const businessDate = await this.businessDates.resolve(tx, tenantId);
      const rows = await tx.$queryRaw<DailyStatusRow[]>`
        WITH candidates AS (
          SELECT component."id" AS "costComponentId", authority."id" AS "authorityId"
          FROM "cost_components" component
          JOIN "cost_categories" category ON category."id" = component."costCategoryId" AND category."tenantId" = component."tenantId"
          JOIN "costing_projects" project ON project."id" = component."costingProjectId" AND project."tenantId" = component."tenantId"
          JOIN "travel_package_costing_project_links" link ON link."costingProjectId" = project."id" AND link."tenantId" = project."tenantId"
          JOIN "TravelPackage" travel ON travel."id" = link."travelPackageId" AND travel."tenantId" = link."tenantId"
          LEFT JOIN "airfare_daily_authorities" authority ON authority."tenantId" = component."tenantId" AND authority."costComponentId" = component."id" AND authority."businessDate" = ${businessDate}
          WHERE component."tenantId" = ${tenantId} AND component."status" = 'ACTIVE'::"CostComponentStatus" AND category."origin" = 'STANDARD'::"CostCategoryOrigin" AND category."code" = 'AIRFARE' AND project."status" <> 'ARCHIVED'::"CostingProjectStatus" AND travel."status" NOT IN ('CANCELLED', 'COMPLETED')
          UNION ALL
          SELECT component."id", authority."id"
          FROM "cost_components" component
          JOIN "cost_categories" category ON category."id" = component."costCategoryId" AND category."tenantId" = component."tenantId"
          JOIN "costing_projects" project ON project."id" = component."costingProjectId" AND project."tenantId" = component."tenantId"
          JOIN "internal_trip_costing_project_links" link ON link."costingProjectId" = project."id" AND link."tenantId" = project."tenantId"
          JOIN "internal_trips" travel ON travel."id" = link."internalTripId" AND travel."tenantId" = link."tenantId"
          LEFT JOIN "airfare_daily_authorities" authority ON authority."tenantId" = component."tenantId" AND authority."costComponentId" = component."id" AND authority."businessDate" = ${businessDate}
          WHERE component."tenantId" = ${tenantId} AND component."status" = 'ACTIVE'::"CostComponentStatus" AND category."origin" = 'STANDARD'::"CostCategoryOrigin" AND category."code" = 'AIRFARE' AND project."status" <> 'ARCHIVED'::"CostingProjectStatus" AND travel."status" NOT IN ('CANCELLED', 'COMPLETED')
        ), deduplicated AS (
          SELECT "costComponentId", bool_or("authorityId" IS NOT NULL) AS "registered" FROM candidates GROUP BY "costComponentId"
        )
        SELECT COUNT(*) FILTER (WHERE NOT "registered") AS "pendingToday", COUNT(*) FILTER (WHERE "registered") AS "registeredToday" FROM deduplicated
      `;
      const status = rows[0] ?? { pendingToday: 0, registeredToday: 0 };
      return { businessDate: businessDate.toISOString().slice(0, 10), pendingToday: count(status.pendingToday), registeredToday: count(status.registeredToday) };
    });
  }

  async listComponentHistory(tenantId: string, costComponentId: string, page = 1, pageSize = 20) {
    return this.withTenantTransaction(tenantId, "airfare.list-component-history", async (tx) => {
      await this.requireAirfareComponentForHistory(tx, tenantId, costComponentId);
      const rows = await this.historyRows(tx, tenantId, page, pageSize, costComponentId);
      return paged("history", rows, page, pageSize, historyResponse);
    });
  }

  async listProjectHistory(tenantId: string, costingProjectId: string, page = 1, pageSize = 20) {
    return this.withTenantTransaction(tenantId, "airfare.list-project-history", async (tx) => {
      const projects = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "costing_projects" WHERE "id" = ${costingProjectId} AND "tenantId" = ${tenantId}`;
      if (projects.length !== 1) throw new NotFoundException("Costing project not found.");
      const rows = await this.historyRows(tx, tenantId, page, pageSize, undefined, costingProjectId);
      return paged("history", rows, page, pageSize, historyResponse);
    });
  }

  private async requireAirfareComponentForHistory(tx: AirfareTransaction, tenantId: string, costComponentId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT component."id"
      FROM "cost_components" component
      JOIN "cost_categories" category ON category."id" = component."costCategoryId" AND category."tenantId" = component."tenantId"
      WHERE component."id" = ${costComponentId} AND component."tenantId" = ${tenantId}
        AND category."origin" = 'STANDARD'::"CostCategoryOrigin" AND category."code" = 'AIRFARE'
    `;
    if (rows.length !== 1) throw new NotFoundException("AIRFARE cost component not found.");
  }

  private historyRows(tx: AirfareTransaction, tenantId: string, page: number, pageSize: number, costComponentId?: string, costingProjectId?: string) {
    return tx.$queryRaw<HistoryRow[]>`
      SELECT authority."businessDate", revision."observedAmount"::text AS "observedAmount", snapshot."amount"::text AS "appliedAmount",
             revision."kind"::text AS "kind", revision."actorUserId", revision."actorName", revision."observedAt", revision."createdAt",
             revision."sourceReference", revision."sourceUrl", revision."overrideReason", component."id" AS "costComponentId",
             component."costingProjectId", authority."id" AS "airfareDailyAuthorityId", revision."appliedSnapshotId",
             component."title", component."detailPayload", revision."revisionNumber", revision."id" AS "revisionId",
             COUNT(*) OVER() AS "total"
      FROM "airfare_daily_authority_revisions" revision
      JOIN "airfare_daily_authorities" authority ON authority."id" = revision."airfareDailyAuthorityId" AND authority."tenantId" = revision."tenantId"
      JOIN "cost_components" component ON component."id" = revision."costComponentId" AND component."tenantId" = revision."tenantId" AND component."costingProjectId" = revision."costingProjectId"
      JOIN "cost_snapshots" snapshot ON snapshot."id" = revision."appliedSnapshotId" AND snapshot."tenantId" = revision."tenantId" AND snapshot."costComponentId" = revision."costComponentId" AND snapshot."costingProjectId" = revision."costingProjectId"
      WHERE revision."tenantId" = ${tenantId}
        AND (${costComponentId ?? null}::text IS NULL OR revision."costComponentId" = ${costComponentId ?? null})
        AND (${costingProjectId ?? null}::text IS NULL OR revision."costingProjectId" = ${costingProjectId ?? null})
      ORDER BY authority."businessDate" DESC, revision."revisionNumber" DESC, revision."id" DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `;
  }

  private withTenantTransaction<T>(tenantId: string, operation: string, work: (tx: AirfareTransaction) => Promise<T>) {
    return runCostEngineTenantTransaction(this.database, this.logger, tenantId, operation, work);
  }

  private async lockEligibleComponent(tx: AirfareTransaction, tenantId: string, costComponentId: string): Promise<EligibleComponent> {
    const rows = await tx.$queryRaw<EligibleComponent[]>`
      SELECT component."id", component."costingProjectId", project."baseCurrency"
      FROM "cost_components" component
      JOIN "cost_categories" category
        ON category."id" = component."costCategoryId" AND category."tenantId" = component."tenantId"
      JOIN "costing_projects" project
        ON project."id" = component."costingProjectId" AND project."tenantId" = component."tenantId"
      WHERE component."id" = ${costComponentId}
        AND component."tenantId" = ${tenantId}
        AND component."status" = 'ACTIVE'::"CostComponentStatus"
        AND category."origin" = 'STANDARD'::"CostCategoryOrigin"
        AND category."code" = 'AIRFARE'
        AND project."status" <> 'ARCHIVED'::"CostingProjectStatus"
        AND (
          EXISTS (
            SELECT 1 FROM "travel_package_costing_project_links" link
            JOIN "TravelPackage" travel ON travel."id" = link."travelPackageId" AND travel."tenantId" = link."tenantId"
            WHERE link."tenantId" = component."tenantId" AND link."costingProjectId" = component."costingProjectId"
              AND travel."status" NOT IN ('CANCELLED', 'COMPLETED')
          )
          OR EXISTS (
            SELECT 1 FROM "internal_trip_costing_project_links" link
            JOIN "internal_trips" travel ON travel."id" = link."internalTripId" AND travel."tenantId" = link."tenantId"
            WHERE link."tenantId" = component."tenantId" AND link."costingProjectId" = component."costingProjectId"
              AND travel."status" NOT IN ('CANCELLED', 'COMPLETED')
          )
        )
      FOR UPDATE OF component
    `;
    if (rows.length !== 1) throw new NotFoundException("Eligible AIRFARE cost component not found.");
    return rows[0];
  }

  private async lockEligibleAuthority(tx: AirfareTransaction, tenantId: string, airfareDailyAuthorityId: string): Promise<LockedAuthority> {
    const rows = await tx.$queryRaw<LockedAuthority[]>`
      SELECT authority."id" AS "authorityId", authority."currentRevisionId", component."id", component."costingProjectId", project."baseCurrency"
      FROM "airfare_daily_authorities" authority
      JOIN "cost_components" component ON component."id" = authority."costComponentId" AND component."tenantId" = authority."tenantId" AND component."costingProjectId" = authority."costingProjectId"
      JOIN "cost_categories" category ON category."id" = component."costCategoryId" AND category."tenantId" = component."tenantId"
      JOIN "costing_projects" project ON project."id" = component."costingProjectId" AND project."tenantId" = component."tenantId"
      WHERE authority."id" = ${airfareDailyAuthorityId}
        AND authority."tenantId" = ${tenantId}
        AND component."status" = 'ACTIVE'::"CostComponentStatus"
        AND category."origin" = 'STANDARD'::"CostCategoryOrigin"
        AND category."code" = 'AIRFARE'
        AND project."status" <> 'ARCHIVED'::"CostingProjectStatus"
        AND (
          EXISTS (SELECT 1 FROM "travel_package_costing_project_links" link JOIN "TravelPackage" travel ON travel."id" = link."travelPackageId" AND travel."tenantId" = link."tenantId" WHERE link."tenantId" = authority."tenantId" AND link."costingProjectId" = authority."costingProjectId" AND travel."status" NOT IN ('CANCELLED', 'COMPLETED'))
          OR EXISTS (SELECT 1 FROM "internal_trip_costing_project_links" link JOIN "internal_trips" travel ON travel."id" = link."internalTripId" AND travel."tenantId" = link."tenantId" WHERE link."tenantId" = authority."tenantId" AND link."costingProjectId" = authority."costingProjectId" AND travel."status" NOT IN ('CANCELLED', 'COMPLETED'))
        )
      FOR UPDATE OF authority, component
    `;
    if (rows.length !== 1) throw new NotFoundException("Eligible AIRFARE daily authority not found.");
    return rows[0];
  }

  private async createSnapshot(tx: AirfareTransaction, tenantId: string, component: EligibleComponent, observation: Required<AirfareObservation>, actor: AirfareAuthorityActor) {
    const lastSnapshot = await tx.costSnapshot.findFirst({
      where: { tenantId, costComponentId: component.id }, select: { sequence: true },
      orderBy: [{ sequence: "desc" }, { id: "desc" }],
    });
    return tx.costSnapshot.create({
      data: {
        tenantId, costingProjectId: component.costingProjectId, costComponentId: component.id,
        sequence: (lastSnapshot?.sequence ?? 0) + 1, amount: observation.observedAmount, currency: component.baseCurrency,
        capturedByUserId: actor.userId, capturedByName: actor.name, sourceReference: observation.sourceReference,
        sourceUrl: observation.sourceUrl, reason: observation.reason,
      },
      select: { id: true },
    });
  }

  private async advancePointers(tx: AirfareTransaction, tenantId: string, authorityId: string, costComponentId: string, revisionId: string, snapshotId: string) {
    const authority = await tx.airfareDailyAuthority.updateMany({ where: { id: authorityId, tenantId }, data: { currentRevisionId: revisionId } });
    if (authority.count !== 1) throw new ConflictException("AIRFARE_DAILY_AUTHORITY_POINTER_CONFLICT");
    const component = await tx.costComponent.updateMany({ where: { id: costComponentId, tenantId }, data: { currentSnapshotId: snapshotId } });
    if (component.count !== 1) throw new ConflictException("AIRFARE_COMPONENT_POINTER_CONFLICT");
  }
}

function normalizeObservation(input: AirfareObservation): Required<AirfareObservation> {
  const observedAmount = String(input.observedAmount ?? "").trim();
  if (!/^\d+(?:\.\d{1,5})?$/.test(observedAmount)) throw new BadRequestException("Observed amount must be an exact decimal with at most five fractional digits.");
  return { observedAmount, sourceReference: optionalText(input.sourceReference), sourceUrl: optionalText(input.sourceUrl), reason: optionalText(input.reason) };
}

function optionalText(value: string | null | undefined) { return value?.trim() || null; }
function requiredText(value: string | null | undefined, name: string) { const normalized = optionalText(value); if (!normalized) throw new BadRequestException(`${name} is required.`); return normalized; }

function taskResponse(row: DailyTaskRow) {
  return {
    costComponentId: row.costComponentId,
    costingProjectId: row.costingProjectId,
    sourceTravelType: row.sourceType,
    sourceTravelId: row.sourceTravelId,
    travelName: row.travelName,
    startDate: row.startDate,
    endDate: row.endDate,
    title: row.title,
    detailPayload: airfareRouteDetail(row.detailPayload),
    currentSnapshot: row.currentAmount === null ? null : { amount: row.currentAmount, currency: row.currentCurrency },
    baseCurrency: row.baseCurrency,
    taskStatus: "PENDING",
  };
}

function historyResponse(row: HistoryRow) {
  return {
    businessDate: dateString(row.businessDate), observedAmount: row.observedAmount, appliedAmount: row.appliedAmount,
    kind: row.kind, isOverride: row.kind === "ADMIN_OVERRIDE", actor: { userId: row.actorUserId, name: row.actorName },
    observedAt: row.observedAt, createdAt: row.createdAt, sourceReference: row.sourceReference, sourceUrl: row.sourceUrl,
    overrideReason: row.overrideReason, costComponentId: row.costComponentId, costingProjectId: row.costingProjectId,
    airfareDailyAuthorityId: row.airfareDailyAuthorityId, appliedSnapshotId: row.appliedSnapshotId,
    componentTitle: row.title, route: airfareRouteDetail(row.detailPayload), revisionNumber: row.revisionNumber,
  };
}

function airfareRouteDetail(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const route = Object.fromEntries(["flightType", "tripType", "origin", "destination", "departureDate", "returnDate", "airline", "cabinClass"]
    .filter((key) => record[key] !== undefined)
    .map((key) => [key, record[key]]));
  return Object.keys(route).length ? route : null;
}

function paged<T extends { total: bigint | number | string }, R>(key: string, rows: T[], page: number, pageSize: number, map: (row: T) => R) {
  const total = rows.length ? count(rows[0].total) : 0;
  const values = rows.map(map);
  return { [key]: values, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

function count(value: bigint | number | string) { return typeof value === "bigint" ? Number(value) : Number(value); }
function dateString(value: Date | string) { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10); }

function isDailyAuthorityUniqueViolation(error: unknown) {
  if (!error || typeof error !== "object" || (error as { code?: unknown }).code !== "P2002") return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  return typeof target === "string"
    ? target.includes("airfare_daily_authorities_tenant_component_business_date_key")
    : Array.isArray(target) && target.length === 3 && ["tenantId", "costComponentId", "businessDate"].every((field) => target.includes(field));
}
