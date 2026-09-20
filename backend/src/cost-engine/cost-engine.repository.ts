import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CostComponentDetails, normalizeCostComponentDetails } from "./cost-component-detail-contracts";
import { runCostEngineTenantTransaction } from "./cost-engine-transaction";
import { STANDARD_COST_CATEGORIES } from "./standard-cost-categories";

export type CostActor = { userId: string; name: string };

export type CostComponentInput = {
  costCategoryId: string;
  costSupplierId: string | null;
  title: string;
  description: string | null;
  detailPayload: unknown | null;
  detailSchemaVersion: number | null;
  quantity: string | null;
  unit: string | null;
  sortPosition: number;
};

export type CostSnapshotInput = {
  amount: string;
  currency: string;
  sourceReference: string | null;
  sourceUrl: string | null;
  reason: string | null;
};

type CostEngineTransaction = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  costingProject: Record<string, (...args: any[]) => Promise<any>>;
  costCategory: Record<string, (...args: any[]) => Promise<any>>;
  costSupplier: Record<string, (...args: any[]) => Promise<any>>;
  costComponent: Record<string, (...args: any[]) => Promise<any>>;
  costSnapshot: Record<string, (...args: any[]) => Promise<any>>;
  costAuditEvent: Record<string, (...args: any[]) => Promise<any>>;
  costApplicability: Record<string, (...args: any[]) => Promise<any>>;
  costEvidence: Record<string, (...args: any[]) => Promise<any>>;
};

type CostEngineDatabase = {
  $transaction<T>(work: (transaction: CostEngineTransaction) => Promise<T>): Promise<T>;
};

const ACTIVE = "ACTIVE";
const ARCHIVED = "ARCHIVED";

type ProjectTotalEvolutionSummary = { currentAuthoritativeTotal: string; archivedLifecycleUnknownCount: number | bigint | string };
type ProjectTotalEvolutionRow = {
  effectiveAt: Date;
  authoritativeTotal: string;
  delta: string;
  costComponentId: string;
  costSnapshotId: string | null;
  costCategoryCode: string;
  costCategoryDisplayName: string;
  sourceReference: string | null;
  sourceUrl: string | null;
  reason: string | null;
  eventKind: "SNAPSHOT" | "COMPONENT_ARCHIVED" | "COMPONENT_REACTIVATED";
  eventId: string;
  earliestReconstructableTotal: string;
  total: number | bigint | string;
};

export type MonetaryTimelineEventType = "INITIAL_COST" | "COST_SNAPSHOT" | "AGENT_INITIAL" | "ADMIN_OVERRIDE" | "COMPONENT_DEACTIVATED" | "COMPONENT_REACTIVATED";

type MonetaryTimelineRow = {
  eventId: string;
  eventType: MonetaryTimelineEventType;
  costingProjectId: string;
  costComponentId: string;
  costCategoryCode: string;
  costCategoryDisplayName: string;
  componentTitle: string;
  effectiveAt: Date;
  businessDate: Date | null;
  appliedAmount: string | null;
  observedAmount: string | null;
  currency: string | null;
  actorUserId: string;
  actorName: string;
  sourceReference: string | null;
  sourceUrl: string | null;
  snapshotId: string | null;
  appliedSnapshotId: string | null;
  airfareDailyAuthorityId: string | null;
  overrideReason: string | null;
  componentStatus: "ACTIVE" | "ARCHIVED";
  resultingComponentStatus: "ACTIVE" | "ARCHIVED" | null;
  evidenceCount: bigint | number | string;
  total: bigint | number | string;
};

@Injectable()
export class CostEngineRepository {
  private readonly database: CostEngineDatabase;
  private readonly logger = new Logger(CostEngineRepository.name);

  constructor(prisma: PrismaService) {
    // The client is generated manually after the user applies Cost DB migrations.
    this.database = prisma as unknown as CostEngineDatabase;
  }

  getComposition(tenantId: string, costingProjectId: string, page: number, pageSize: number) {
    return this.withTenantTransaction(tenantId, "cost-engine.get-composition", async (tx) => {
      const project = await tx.costingProject.findFirst({
        where: { id: costingProjectId, tenantId },
        select: {
          id: true, displayName: true, baseCurrency: true, status: true,
          createdAt: true, updatedAt: true,
        },
      });
      if (!project) return null;

      const where = { tenantId, costingProjectId, status: ACTIVE };
      const [components, total] = await Promise.all([
        tx.costComponent.findMany({
          where,
          select: {
            id: true, title: true, description: true, detailPayload: true, detailSchemaVersion: true,
            quantity: true, unit: true, status: true, sortPosition: true,
            createdAt: true, updatedAt: true,
            costCategory: { select: { id: true, code: true, displayName: true } },
            costSupplier: { select: { id: true, name: true, website: true } },
            currentSnapshot: {
              select: {
                id: true, amount: true, currency: true, sequence: true, capturedAt: true,
                capturedByName: true, sourceReference: true, sourceUrl: true, reason: true,
              },
            },
          },
          orderBy: [{ sortPosition: "asc" }, { id: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.costComponent.count({ where }),
      ]);

      const categoryTotals = await tx.$queryRaw<Array<{
        categoryId: string;
        categoryCode: string;
        categoryDisplayName: string;
        amount: string;
      }>>`
        SELECT category."id" AS "categoryId", category."code" AS "categoryCode",
               category."displayName" AS "categoryDisplayName",
               SUM(snapshot."amount")::text AS "amount"
        FROM "cost_components" component
        JOIN "cost_categories" category
          ON category."id" = component."costCategoryId"
         AND category."tenantId" = component."tenantId"
        JOIN "cost_snapshots" snapshot
          ON snapshot."id" = component."currentSnapshotId"
         AND snapshot."tenantId" = component."tenantId"
         AND snapshot."costComponentId" = component."id"
        WHERE component."tenantId" = ${tenantId}
          AND component."costingProjectId" = ${costingProjectId}
          AND component."status" = 'ACTIVE'::"CostComponentStatus"
        GROUP BY category."id", category."code", category."displayName"
        ORDER BY category."displayName" ASC, category."id" ASC
      `;

      return { project, components, total, page, pageSize, categoryTotals };
    });
  }

  getComponentDetail(tenantId: string, costComponentId: string) {
    return this.withTenantTransaction(tenantId, "cost-engine.get-component", (tx) => tx.costComponent.findFirst({
      where: { id: costComponentId, tenantId },
      select: {
        id: true, costingProjectId: true, title: true, description: true, detailPayload: true,
        detailSchemaVersion: true, quantity: true, unit: true, status: true,
        sortPosition: true, createdAt: true, updatedAt: true,
        costCategory: { select: { id: true, code: true, displayName: true } },
        costSupplier: { select: { id: true, name: true, website: true } },
        currentSnapshot: {
          select: {
            id: true, amount: true, currency: true, sequence: true, capturedAt: true,
            capturedByUserId: true, capturedByName: true, sourceReference: true, sourceUrl: true, reason: true,
          },
        },
      },
    }));
  }

  getComponentHistory(tenantId: string, costComponentId: string, page: number, pageSize: number) {
    return this.withTenantTransaction(tenantId, "cost-engine.get-component-history", async (tx) => {
      const component = await tx.costComponent.findFirst({
        where: { id: costComponentId, tenantId },
        select: { id: true },
      });
      if (!component) return null;
      const where = { tenantId, costComponentId };
      const [snapshots, total] = await Promise.all([
        tx.costSnapshot.findMany({
          where,
          select: {
            id: true, amount: true, currency: true, sequence: true, capturedAt: true,
            capturedByUserId: true, capturedByName: true, sourceReference: true, sourceUrl: true, reason: true,
          },
          orderBy: [{ capturedAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.costSnapshot.count({ where }),
      ]);
      return { snapshots, total, page, pageSize };
    });
  }

  getComponentMonetaryTimeline(tenantId: string, costComponentId: string, page: number, pageSize: number) {
    return this.withTenantTransaction(tenantId, "cost-engine.get-component-monetary-timeline", async (tx) => {
      const component = await tx.costComponent.findFirst({
        where: { id: costComponentId, tenantId },
        select: { id: true },
      });
      if (!component) return null;
      return this.monetaryTimeline(tx, tenantId, page, pageSize, costComponentId);
    });
  }

  getProjectMonetaryTimeline(tenantId: string, costingProjectId: string, page: number, pageSize: number, categoryCode?: string) {
    return this.withTenantTransaction(tenantId, "cost-engine.get-project-monetary-timeline", async (tx) => {
      const project = await tx.costingProject.findFirst({
        where: { id: costingProjectId, tenantId },
        select: { id: true },
      });
      if (!project) return null;
      return this.monetaryTimeline(tx, tenantId, page, pageSize, undefined, costingProjectId, categoryCode);
    });
  }

  getProjectTotalEvolution(tenantId: string, costingProjectId: string, page: number, pageSize: number) {
    return this.withTenantTransaction(tenantId, "cost-engine.get-project-total-evolution", async (tx) => {
      const project = await tx.costingProject.findFirst({
        where: { id: costingProjectId, tenantId },
        select: { id: true, baseCurrency: true },
      });
      if (!project) return null;

      const summaries = await tx.$queryRaw<ProjectTotalEvolutionSummary[]>`
        SELECT
          (
            SELECT COALESCE(SUM(snapshot."amount"), 0)::text
            FROM "cost_components" component
            JOIN "cost_snapshots" snapshot
              ON snapshot."id" = component."currentSnapshotId"
             AND snapshot."tenantId" = component."tenantId"
             AND snapshot."costComponentId" = component."id"
             AND snapshot."costingProjectId" = component."costingProjectId"
            WHERE component."tenantId" = ${tenantId}
              AND component."costingProjectId" = ${costingProjectId}
              AND component."status" = 'ACTIVE'::"CostComponentStatus"
          ) AS "currentAuthoritativeTotal",
          (
            SELECT COUNT(*)
            FROM "cost_components" component
            WHERE component."tenantId" = ${tenantId}
              AND component."costingProjectId" = ${costingProjectId}
              AND component."status" = 'ARCHIVED'::"CostComponentStatus"
              AND NOT EXISTS (
                SELECT 1
                FROM "cost_audit_events" audit
                WHERE audit."tenantId" = component."tenantId"
                  AND audit."costingProjectId" = component."costingProjectId"
                  AND audit."costComponentId" = component."id"
                  AND audit."action" = 'COMPONENT_ARCHIVED'
              )
          ) AS "archivedLifecycleUnknownCount"
      `;
      const summary = summaries[0] ?? { currentAuthoritativeTotal: "0", archivedLifecycleUnknownCount: 0 };
      const archivedLifecycleUnknownCount = Number(summary.archivedLifecycleUnknownCount);
      if (archivedLifecycleUnknownCount > 0) {
        return {
          baseCurrency: project.baseCurrency,
          currentAuthoritativeTotal: summary.currentAuthoritativeTotal,
          earliestReconstructableTotal: null,
          points: [], total: 0, page, pageSize,
          lifecycleReconstructionComplete: false,
          lifecycleLimitation: "ARCHIVED_COMPONENT_LIFECYCLE_UNKNOWN",
          archivedLifecycleUnknownCount,
          ordering: "EFFECTIVE_TIMESTAMP_DESC",
        };
      }

      const rows = await tx.$queryRaw<ProjectTotalEvolutionRow[]>`
        WITH lifecycle_events AS (
          SELECT audit."id", audit."costComponentId", audit."createdAt", audit."reason", audit."action"
          FROM "cost_audit_events" audit
          WHERE audit."tenantId" = ${tenantId}
            AND audit."costingProjectId" = ${costingProjectId}
            AND audit."action" IN ('COMPONENT_ARCHIVED', 'COMPONENT_REACTIVATED')
            AND audit."costComponentId" IS NOT NULL
        ), archive_events AS (
          SELECT * FROM lifecycle_events WHERE "action" = 'COMPONENT_ARCHIVED'
        ), reactivation_events AS (
          SELECT * FROM lifecycle_events WHERE "action" = 'COMPONENT_REACTIVATED'
        ), eligible_snapshots AS (
          SELECT snapshot."id", snapshot."costComponentId", snapshot."amount", snapshot."capturedAt",
                 snapshot."sourceReference", snapshot."sourceUrl", snapshot."reason",
                 component."costCategoryId"
          FROM "cost_snapshots" snapshot
          JOIN "cost_components" component
            ON component."id" = snapshot."costComponentId"
           AND component."tenantId" = snapshot."tenantId"
           AND component."costingProjectId" = snapshot."costingProjectId"
          WHERE snapshot."tenantId" = ${tenantId}
            AND snapshot."costingProjectId" = ${costingProjectId}
            AND NOT EXISTS (
            SELECT 1 FROM archive_events archive
            WHERE archive."costComponentId" = snapshot."costComponentId"
              AND archive."createdAt" < snapshot."capturedAt"
              AND NOT EXISTS (
                SELECT 1 FROM reactivation_events reactivation
                WHERE reactivation."costComponentId" = archive."costComponentId"
                  AND reactivation."createdAt" > archive."createdAt"
                  AND reactivation."createdAt" < snapshot."capturedAt"
              )
            )
        ), snapshot_changes AS (
          SELECT snapshot."capturedAt" AS "effectiveAt", snapshot."id" AS "eventId", snapshot."costComponentId",
                 snapshot."id" AS "costSnapshotId", snapshot."amount" - COALESCE(LAG(snapshot."amount") OVER (PARTITION BY snapshot."costComponentId" ORDER BY snapshot."capturedAt" ASC, snapshot."id" ASC), 0) AS "delta",
                 snapshot."costCategoryId", snapshot."sourceReference", snapshot."sourceUrl", snapshot."reason", 'SNAPSHOT'::text AS "eventKind"
          FROM eligible_snapshots snapshot
        ), archive_changes AS (
          SELECT archive."createdAt" AS "effectiveAt", archive."id" AS "eventId", archive."costComponentId",
                 NULL::text AS "costSnapshotId", -snapshot."amount" AS "delta", snapshot."costCategoryId",
                 NULL::text AS "sourceReference", NULL::text AS "sourceUrl", archive."reason", 'COMPONENT_ARCHIVED'::text AS "eventKind"
          FROM archive_events archive
          JOIN LATERAL (
            SELECT eligible."amount", eligible."costCategoryId"
            FROM eligible_snapshots eligible
            WHERE eligible."costComponentId" = archive."costComponentId"
              AND eligible."capturedAt" <= archive."createdAt"
            ORDER BY eligible."capturedAt" DESC, eligible."id" DESC
            LIMIT 1
          ) snapshot ON true
        ), reactivation_changes AS (
          SELECT reactivation."createdAt" AS "effectiveAt", reactivation."id" AS "eventId", reactivation."costComponentId",
                 NULL::text AS "costSnapshotId", snapshot."amount" AS "delta", snapshot."costCategoryId",
                 NULL::text AS "sourceReference", NULL::text AS "sourceUrl", reactivation."reason", 'COMPONENT_REACTIVATED'::text AS "eventKind"
          FROM reactivation_events reactivation
          JOIN LATERAL (
            SELECT eligible."amount", eligible."costCategoryId"
            FROM eligible_snapshots eligible
            WHERE eligible."costComponentId" = reactivation."costComponentId"
              AND eligible."capturedAt" <= reactivation."createdAt"
            ORDER BY eligible."capturedAt" DESC, eligible."id" DESC
            LIMIT 1
          ) snapshot ON true
        ), changes AS (
          SELECT * FROM snapshot_changes WHERE "delta" <> 0
          UNION ALL
          SELECT * FROM archive_changes WHERE "delta" <> 0
          UNION ALL
          SELECT * FROM reactivation_changes WHERE "delta" <> 0
        ), running AS (
          SELECT change.*, SUM(change."delta") OVER (ORDER BY change."effectiveAt" ASC, change."eventId" ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS "authoritativeTotal"
          FROM changes change
        ), scored AS (
          SELECT running.*, category."code" AS "costCategoryCode", category."displayName" AS "costCategoryDisplayName",
                 FIRST_VALUE(running."authoritativeTotal") OVER (ORDER BY running."effectiveAt" ASC, running."eventId" ASC ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS "earliestReconstructableTotal",
                 COUNT(*) OVER () AS "total"
          FROM running
          JOIN "cost_categories" category ON category."id" = running."costCategoryId" AND category."tenantId" = ${tenantId}
        )
        SELECT "effectiveAt", "authoritativeTotal"::text AS "authoritativeTotal", "delta"::text AS "delta",
               "costComponentId", "costSnapshotId", "costCategoryCode", "costCategoryDisplayName",
               "sourceReference", "sourceUrl", "reason", "eventKind", "eventId",
               "earliestReconstructableTotal"::text AS "earliestReconstructableTotal", "total"
        FROM scored
        ORDER BY "effectiveAt" DESC, "eventId" DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `;
      const total = rows.length ? Number(rows[0].total) : 0;
      return {
        baseCurrency: project.baseCurrency,
        currentAuthoritativeTotal: summary.currentAuthoritativeTotal,
        earliestReconstructableTotal: rows.length ? rows[0].earliestReconstructableTotal : null,
        points: rows.map(({ total: _total, earliestReconstructableTotal: _earliest, ...point }) => point),
        total, page, pageSize,
        lifecycleReconstructionComplete: true,
        lifecycleLimitation: null,
        archivedLifecycleUnknownCount: 0,
        ordering: "EFFECTIVE_TIMESTAMP_DESC",
      };
    });
  }

  createComponent(tenantId: string, costingProjectId: string, input: CostComponentInput, snapshot: CostSnapshotInput, actor: CostActor) {
    return this.withTenantTransaction(tenantId, "cost-engine.create-component", async (tx) => {
      const project = await this.requireActiveProject(tx, tenantId, costingProjectId);
      this.requireProjectCurrency(project.baseCurrency, snapshot.currency);
      const category = await this.requireCategory(tx, tenantId, input.costCategoryId);
      if (input.costSupplierId) await this.requireSupplier(tx, tenantId, input.costSupplierId);
      const details = normalizeCostComponentDetails(category, componentDetails(input));
      await this.requireRelatedAirfareComponent(tx, tenantId, costingProjectId, category, details);

      const component = await tx.costComponent.create({
        data: {
          tenantId, costingProjectId, ...input, ...details, status: ACTIVE,
          createdByUserId: actor.userId, createdByName: actor.name,
        },
      });
      const createdSnapshot = await this.createSnapshot(tx, tenantId, costingProjectId, component.id, 1, snapshot, actor);
      await this.setCurrentSnapshot(tx, tenantId, component.id, createdSnapshot.id);
      await this.recordAudit(tx, tenantId, costingProjectId, component.id, "COMPONENT_CREATED", actor, null, { createdWithInitialSnapshot: true });
      return component.id;
    });
  }

  updateComponent(tenantId: string, costComponentId: string, input: Partial<CostComponentInput>, actor: CostActor) {
    return this.withTenantTransaction(tenantId, "cost-engine.update-component", async (tx) => {
      const component = await this.lockAndRequireComponent(tx, tenantId, costComponentId);
      const categoryChanged = input.costCategoryId !== undefined && input.costCategoryId !== component.costCategoryId;
      const category = categoryChanged
        ? await this.requireCategory(tx, tenantId, input.costCategoryId!)
        : component.costCategory;
      if (input.costSupplierId !== undefined && input.costSupplierId !== component.costSupplierId && input.costSupplierId !== null) await this.requireSupplier(tx, tenantId, input.costSupplierId);
      const changedFields = Object.keys(input);
      if (!changedFields.length) throw new BadRequestException("At least one structural field is required.");
      const detailsChanged = categoryChanged || ["detailPayload", "detailSchemaVersion", "quantity", "unit"].some((field) => field in input);
      if (detailsChanged) {
        const normalizedDetails = normalizeCostComponentDetails(category, componentDetails({
          detailPayload: input.detailPayload === undefined ? component.detailPayload : input.detailPayload,
          detailSchemaVersion: input.detailSchemaVersion === undefined ? component.detailSchemaVersion : input.detailSchemaVersion,
          quantity: input.quantity === undefined ? nullableDecimalString(component.quantity) : input.quantity,
          unit: input.unit === undefined ? component.unit : input.unit,
        }));
        await this.requireRelatedAirfareComponent(tx, tenantId, component.costingProjectId, category, normalizedDetails);
        Object.assign(input, normalizedDetails);
      }
      const updated = await tx.costComponent.updateMany({
        where: { id: costComponentId, tenantId },
        data: { ...input, updatedByUserId: actor.userId, updatedByName: actor.name },
      });
      if (updated.count !== 1) throw new ConflictException("Cost component update conflict.");
      await this.recordAudit(tx, tenantId, component.costingProjectId, costComponentId, "COMPONENT_UPDATED", actor, null, {
        changedFields,
        ...(detailsChanged ? { detailFieldsChanged: true, detailSchemaVersion: input.detailSchemaVersion ?? null } : {}),
      });
    });
  }

  archiveComponent(tenantId: string, costComponentId: string, actor: CostActor) {
    return this.withTenantTransaction(tenantId, "cost-engine.archive-component", async (tx) => {
      const component = await this.lockAndRequireComponent(tx, tenantId, costComponentId);
      const updated = await tx.costComponent.updateMany({
        where: { id: costComponentId, tenantId, status: { not: ARCHIVED } },
        data: { status: ARCHIVED, updatedByUserId: actor.userId, updatedByName: actor.name },
      });
      if (updated.count !== 1) throw new ConflictException("Cost component archive conflict.");
      await this.recordAudit(tx, tenantId, component.costingProjectId, costComponentId, "COMPONENT_ARCHIVED", actor);
    });
  }

  reactivateComponent(tenantId: string, costComponentId: string, actor: CostActor) {
    return this.withTenantTransaction(tenantId, "cost-engine.reactivate-component", async (tx) => {
      const component = await this.lockAndRequireComponent(tx, tenantId, costComponentId);
      await this.requireActiveProject(tx, tenantId, component.costingProjectId);
      if (!component.currentSnapshotId) throw new BadRequestException("Cost component must have a current snapshot before reactivation.");
      const updated = await tx.costComponent.updateMany({
        where: { id: costComponentId, tenantId, status: ARCHIVED },
        data: { status: ACTIVE, updatedByUserId: actor.userId, updatedByName: actor.name },
      });
      if (updated.count !== 1) throw new ConflictException("Cost component reactivation conflict.");
      await this.recordAudit(tx, tenantId, component.costingProjectId, costComponentId, "COMPONENT_REACTIVATED", actor);
    });
  }

  duplicateComponent(tenantId: string, costComponentId: string, title: string | undefined, actor: CostActor) {
    return this.withTenantTransaction(tenantId, "cost-engine.duplicate-component", async (tx) => {
      const source = await this.lockAndRequireComponent(tx, tenantId, costComponentId, true);
      const project = await this.requireActiveProject(tx, tenantId, source.costingProjectId);
      if (!source.currentSnapshot) throw new BadRequestException("Cost component must have a current snapshot before duplication.");
      this.requireProjectCurrency(project.baseCurrency, String(source.currentSnapshot.currency));
      const component = await tx.costComponent.create({
        data: {
          tenantId, costingProjectId: source.costingProjectId, costCategoryId: source.costCategoryId,
          costSupplierId: source.costSupplierId, title: title ?? `${source.title} copy`,
          description: source.description, detailPayload: source.detailPayload,
          detailSchemaVersion: source.detailSchemaVersion, quantity: source.quantity, unit: source.unit,
          status: ACTIVE, sortPosition: source.sortPosition + 1,
          createdByUserId: actor.userId, createdByName: actor.name,
        },
      });
      const snapshot = await this.createSnapshot(tx, tenantId, source.costingProjectId, component.id, 1, {
        amount: decimalString(source.currentSnapshot.amount), currency: String(source.currentSnapshot.currency),
        sourceReference: source.currentSnapshot.sourceReference, sourceUrl: source.currentSnapshot.sourceUrl,
        reason: `Duplicated from component ${source.id}`,
      }, actor);
      await this.setCurrentSnapshot(tx, tenantId, component.id, snapshot.id);
      await this.recordAudit(tx, tenantId, source.costingProjectId, component.id, "COMPONENT_DUPLICATED", actor, null, { sourceComponentId: source.id });
      return component.id;
    });
  }

  updateComponentCost(tenantId: string, costComponentId: string, input: CostSnapshotInput, actor: CostActor) {
    return this.withTenantTransaction(tenantId, "cost-engine.update-component-cost", async (tx) => {
      const component = await this.lockAndRequireComponent(tx, tenantId, costComponentId, true);
      if (component.costCategory.origin === "STANDARD" && component.costCategory.code === "AIRFARE" && await this.isTravelLinkedProject(tx, tenantId, component.costingProjectId)) {
        throw new BadRequestException("Travel-linked AIRFARE monetary updates must use the AIRFARE daily authority flow.");
      }
      const project = await this.requireActiveProject(tx, tenantId, component.costingProjectId);
      this.requireProjectCurrency(project.baseCurrency, input.currency);
      const lastSnapshot = await tx.costSnapshot.findFirst({
        where: { tenantId, costComponentId }, select: { sequence: true },
        orderBy: [{ sequence: "desc" }, { id: "desc" }],
      });
      const snapshot = await this.createSnapshot(tx, tenantId, component.costingProjectId, costComponentId, (lastSnapshot?.sequence ?? 0) + 1, input, actor);
      await this.setCurrentSnapshot(tx, tenantId, costComponentId, snapshot.id);
      return snapshot.id;
    });
  }

  listCategories(tenantId: string, page: number, pageSize: number) {
    return this.withTenantTransaction(tenantId, "cost-engine.list-categories", async (tx) => {
      await this.provisionStandardCategories(tx, tenantId);
      const where = { tenantId, isActive: true };
      const [categories, total] = await Promise.all([
        tx.costCategory.findMany({ where, select: { id: true, code: true, displayName: true, origin: true, isActive: true, createdAt: true, updatedAt: true }, orderBy: [{ displayName: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
        tx.costCategory.count({ where }),
      ]);
      return { categories, total, page, pageSize };
    });
  }

  createCategory(tenantId: string, code: string, displayName: string) {
    return this.withTenantTransaction(tenantId, "cost-engine.create-category", async (tx) => {
      await this.provisionStandardCategories(tx, tenantId);
      try {
        return await tx.costCategory.create({ data: { tenantId, code, displayName, origin: "CUSTOM" }, select: { id: true, code: true, displayName: true, origin: true, isActive: true, createdAt: true, updatedAt: true } });
      } catch (error) {
        if (isUniqueConstraint(error)) throw new ConflictException("A cost category with this code already exists.");
        throw error;
      }
    });
  }

  updateCategory(tenantId: string, costCategoryId: string, input: { displayName?: string; isActive?: boolean }) {
    return this.withTenantTransaction(tenantId, "cost-engine.update-category", async (tx) => {
      if (!Object.keys(input).length) throw new BadRequestException("At least one category field is required.");
      const updated = await tx.costCategory.updateMany({ where: { id: costCategoryId, tenantId }, data: input });
      if (updated.count !== 1) throw new NotFoundException("Cost category not found.");
      return tx.costCategory.findFirst({ where: { id: costCategoryId, tenantId }, select: { id: true, code: true, displayName: true, origin: true, isActive: true, createdAt: true, updatedAt: true } });
    });
  }

  listSuppliers(tenantId: string, page: number, pageSize: number) {
    return this.withTenantTransaction(tenantId, "cost-engine.list-suppliers", async (tx) => {
      const where = { tenantId };
      const [suppliers, total] = await Promise.all([
        tx.costSupplier.findMany({ where, select: { id: true, name: true, website: true, notes: true, isActive: true, createdAt: true, updatedAt: true }, orderBy: [{ name: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
        tx.costSupplier.count({ where }),
      ]);
      return { suppliers, total, page, pageSize };
    });
  }

  createSupplier(tenantId: string, input: { name: string; website: string | null; notes: string | null }) {
    return this.withTenantTransaction(tenantId, "cost-engine.create-supplier", async (tx) => {
      try {
        return await tx.costSupplier.create({ data: { tenantId, ...input }, select: { id: true, name: true, website: true, notes: true, isActive: true, createdAt: true, updatedAt: true } });
      } catch (error) {
        if (isUniqueConstraint(error)) throw new ConflictException("A cost supplier with this name already exists.");
        throw error;
      }
    });
  }

  updateSupplier(tenantId: string, costSupplierId: string, input: { name?: string; website?: string | null; notes?: string | null; isActive?: boolean }) {
    return this.withTenantTransaction(tenantId, "cost-engine.update-supplier", async (tx) => {
      if (!Object.keys(input).length) throw new BadRequestException("At least one supplier field is required.");
      try {
        const updated = await tx.costSupplier.updateMany({ where: { id: costSupplierId, tenantId }, data: input });
        if (updated.count !== 1) throw new NotFoundException("Cost supplier not found.");
      } catch (error) {
        if (isUniqueConstraint(error)) throw new ConflictException("A cost supplier with this name already exists.");
        throw error;
      }
      return tx.costSupplier.findFirst({ where: { id: costSupplierId, tenantId }, select: { id: true, name: true, website: true, notes: true, isActive: true, createdAt: true, updatedAt: true } });
    });
  }

  archiveSupplier(tenantId: string, costSupplierId: string) {
    return this.updateSupplier(tenantId, costSupplierId, { isActive: false });
  }

  listApplicabilities(tenantId: string, costComponentId: string, page: number, pageSize: number) {
    return this.withTenantTransaction(tenantId, "cost-engine.list-applicabilities", async (tx) => {
      await this.requireComponent(tx, tenantId, costComponentId);
      const where = { tenantId, costComponentId };
      const [applicabilities, total] = await Promise.all([
        tx.costApplicability.findMany({ where, select: { id: true, scopeType: true, scopeKey: true, label: true, startDate: true, endDate: true, createdAt: true, updatedAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
        tx.costApplicability.count({ where }),
      ]);
      return { applicabilities, total, page, pageSize };
    });
  }

  createApplicability(tenantId: string, costComponentId: string, input: ApplicabilityInput) {
    return this.withTenantTransaction(tenantId, "cost-engine.create-applicability", async (tx) => {
      await this.requireComponent(tx, tenantId, costComponentId);
      return tx.costApplicability.create({ data: { tenantId, costComponentId, ...input }, select: { id: true, scopeType: true, scopeKey: true, label: true, startDate: true, endDate: true, createdAt: true, updatedAt: true } });
    });
  }

  updateApplicability(tenantId: string, costApplicabilityId: string, input: Partial<ApplicabilityInput>) {
    return this.withTenantTransaction(tenantId, "cost-engine.update-applicability", async (tx) => {
      if (!Object.keys(input).length) throw new BadRequestException("At least one applicability field is required.");
      const updated = await tx.costApplicability.updateMany({ where: { id: costApplicabilityId, tenantId }, data: input });
      if (updated.count !== 1) throw new NotFoundException("Cost applicability not found.");
      return tx.costApplicability.findFirst({ where: { id: costApplicabilityId, tenantId }, select: { id: true, scopeType: true, scopeKey: true, label: true, startDate: true, endDate: true, createdAt: true, updatedAt: true } });
    });
  }

  deleteApplicability(tenantId: string, costApplicabilityId: string) {
    return this.withTenantTransaction(tenantId, "cost-engine.delete-applicability", async (tx) => {
      const deleted = await tx.costApplicability.deleteMany({ where: { id: costApplicabilityId, tenantId } });
      if (deleted.count !== 1) throw new NotFoundException("Cost applicability not found.");
    });
  }

  assertSnapshotAccess(tenantId: string, costSnapshotId: string) {
    return this.withTenantTransaction(tenantId, "cost-engine.assert-snapshot-access", async (tx) => {
      const snapshot = await tx.costSnapshot.findFirst({ where: { id: costSnapshotId, tenantId }, select: { id: true } });
      if (!snapshot) throw new NotFoundException("Cost snapshot not found.");
    });
  }

  assertAgentInitialSnapshotEvidenceAccess(tenantId: string, costSnapshotId: string, actorUserId: string) {
    return this.withTenantTransaction(tenantId, "cost-engine.assert-agent-airfare-evidence-access", async (tx) => {
      const snapshots = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT snapshot."id"
        FROM "cost_snapshots" snapshot
        JOIN "airfare_daily_authority_revisions" revision
          ON revision."appliedSnapshotId" = snapshot."id"
         AND revision."tenantId" = snapshot."tenantId"
         AND revision."costComponentId" = snapshot."costComponentId"
         AND revision."costingProjectId" = snapshot."costingProjectId"
        JOIN "airfare_daily_authorities" authority
          ON authority."id" = revision."airfareDailyAuthorityId"
         AND authority."tenantId" = revision."tenantId"
         AND authority."costComponentId" = revision."costComponentId"
         AND authority."costingProjectId" = revision."costingProjectId"
        JOIN "cost_components" component
          ON component."id" = snapshot."costComponentId"
         AND component."tenantId" = snapshot."tenantId"
         AND component."costingProjectId" = snapshot."costingProjectId"
        JOIN "cost_categories" category
          ON category."id" = component."costCategoryId"
         AND category."tenantId" = component."tenantId"
        WHERE snapshot."id" = ${costSnapshotId}
          AND snapshot."tenantId" = ${tenantId}
          AND revision."kind" = 'AGENT_INITIAL'::"AirfareDailyAuthorityRevisionKind"
          AND revision."actorUserId" = ${actorUserId}
          AND snapshot."capturedByUserId" = ${actorUserId}
          AND category."origin" = 'STANDARD'::"CostCategoryOrigin"
          AND category."code" = 'AIRFARE'
      `;
      if (snapshots.length !== 1) throw new NotFoundException("AGENT AIRFARE evidence target not found.");
    });
  }

  createEvidence(tenantId: string, costSnapshotId: string, input: CostEvidenceInput) {
    return this.withTenantTransaction(tenantId, "cost-engine.create-evidence", async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "cost_snapshots"
        WHERE "id" = ${costSnapshotId} AND "tenantId" = ${tenantId}
        FOR UPDATE
      `;
      if (locked.length !== 1) throw new NotFoundException("Cost snapshot not found.");
      return tx.costEvidence.create({
        data: { tenantId, costSnapshotId, ...input },
        select: { id: true, costSnapshotId: true, originalFileName: true, mimeType: true, byteSize: true, contentHash: true, uploadedAt: true, uploadedByUserId: true, uploadedByName: true },
      });
    });
  }

  listEvidence(tenantId: string, costSnapshotId: string, page: number, pageSize: number) {
    return this.withTenantTransaction(tenantId, "cost-engine.list-evidence", async (tx) => {
      await this.requireSnapshot(tx, tenantId, costSnapshotId);
      const where = { tenantId, costSnapshotId };
      const [evidence, total] = await Promise.all([
        tx.costEvidence.findMany({
          where,
          select: { id: true, originalFileName: true, mimeType: true, byteSize: true, contentHash: true, uploadedAt: true, uploadedByUserId: true, uploadedByName: true },
          orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.costEvidence.count({ where }),
      ]);
      return { evidence, total, page, pageSize };
    });
  }

  findEvidenceForAccess(tenantId: string, costSnapshotId: string, costEvidenceId: string) {
    return this.withTenantTransaction(tenantId, "cost-engine.find-evidence-access", (tx) => tx.costEvidence.findFirst({
      where: { id: costEvidenceId, costSnapshotId, tenantId },
      select: { id: true, originalFileName: true, mimeType: true, byteSize: true, objectKey: true },
    }));
  }

  private async monetaryTimeline(
    tx: CostEngineTransaction,
    tenantId: string,
    page: number,
    pageSize: number,
    costComponentId?: string,
    costingProjectId?: string,
    categoryCode?: string,
  ) {
    const rows = await tx.$queryRaw<MonetaryTimelineRow[]>`
      WITH timeline_events AS (
        SELECT snapshot."id" AS "eventId",
               CASE WHEN snapshot."sequence" = 1 THEN 'INITIAL_COST' ELSE 'COST_SNAPSHOT' END AS "eventType",
               snapshot."costingProjectId", snapshot."costComponentId",
               category."code" AS "costCategoryCode", category."displayName" AS "costCategoryDisplayName",
               component."title" AS "componentTitle", snapshot."capturedAt" AS "effectiveAt",
               NULL::date AS "businessDate", snapshot."amount"::text AS "appliedAmount",
               NULL::text AS "observedAmount", snapshot."currency"::text AS "currency",
               snapshot."capturedByUserId" AS "actorUserId", snapshot."capturedByName" AS "actorName",
               snapshot."sourceReference", snapshot."sourceUrl", snapshot."id" AS "snapshotId",
               NULL::text AS "appliedSnapshotId", NULL::text AS "airfareDailyAuthorityId",
               NULL::text AS "overrideReason", component."status"::text AS "componentStatus",
               NULL::text AS "resultingComponentStatus"
        FROM "cost_snapshots" snapshot
        JOIN "cost_components" component
          ON component."id" = snapshot."costComponentId"
         AND component."tenantId" = snapshot."tenantId"
         AND component."costingProjectId" = snapshot."costingProjectId"
        JOIN "cost_categories" category
          ON category."id" = component."costCategoryId"
         AND category."tenantId" = component."tenantId"
        WHERE snapshot."tenantId" = ${tenantId}
          AND (${costComponentId ?? null}::text IS NULL OR snapshot."costComponentId" = ${costComponentId ?? null})
          AND (${costingProjectId ?? null}::text IS NULL OR snapshot."costingProjectId" = ${costingProjectId ?? null})
          AND (${categoryCode ?? null}::text IS NULL OR category."code" = ${categoryCode ?? null})
          AND NOT EXISTS (
            SELECT 1
            FROM "airfare_daily_authority_revisions" revision
            WHERE revision."tenantId" = snapshot."tenantId"
              AND revision."appliedSnapshotId" = snapshot."id"
              AND revision."costComponentId" = snapshot."costComponentId"
              AND revision."costingProjectId" = snapshot."costingProjectId"
          )
        UNION ALL
        SELECT revision."id" AS "eventId", revision."kind"::text AS "eventType",
               revision."costingProjectId", revision."costComponentId",
               category."code" AS "costCategoryCode", category."displayName" AS "costCategoryDisplayName",
               component."title" AS "componentTitle", revision."createdAt" AS "effectiveAt",
               authority."businessDate" AS "businessDate", snapshot."amount"::text AS "appliedAmount",
               revision."observedAmount"::text AS "observedAmount", snapshot."currency"::text AS "currency",
               revision."actorUserId", revision."actorName", revision."sourceReference", revision."sourceUrl",
               revision."appliedSnapshotId" AS "snapshotId", revision."appliedSnapshotId",
               authority."id" AS "airfareDailyAuthorityId", revision."overrideReason", component."status"::text AS "componentStatus",
               NULL::text AS "resultingComponentStatus"
        FROM "airfare_daily_authority_revisions" revision
        JOIN "airfare_daily_authorities" authority
          ON authority."id" = revision."airfareDailyAuthorityId"
         AND authority."tenantId" = revision."tenantId"
         AND authority."costingProjectId" = revision."costingProjectId"
         AND authority."costComponentId" = revision."costComponentId"
        JOIN "cost_components" component
          ON component."id" = revision."costComponentId"
         AND component."tenantId" = revision."tenantId"
         AND component."costingProjectId" = revision."costingProjectId"
        JOIN "cost_categories" category
          ON category."id" = component."costCategoryId"
         AND category."tenantId" = component."tenantId"
        JOIN "cost_snapshots" snapshot
          ON snapshot."id" = revision."appliedSnapshotId"
         AND snapshot."tenantId" = revision."tenantId"
         AND snapshot."costComponentId" = revision."costComponentId"
         AND snapshot."costingProjectId" = revision."costingProjectId"
        WHERE revision."tenantId" = ${tenantId}
          AND (${costComponentId ?? null}::text IS NULL OR revision."costComponentId" = ${costComponentId ?? null})
          AND (${costingProjectId ?? null}::text IS NULL OR revision."costingProjectId" = ${costingProjectId ?? null})
          AND (${categoryCode ?? null}::text IS NULL OR category."code" = ${categoryCode ?? null})
        UNION ALL
        SELECT audit."id" AS "eventId",
               CASE audit."action" WHEN 'COMPONENT_ARCHIVED' THEN 'COMPONENT_DEACTIVATED' ELSE 'COMPONENT_REACTIVATED' END AS "eventType",
               audit."costingProjectId", audit."costComponentId",
               category."code" AS "costCategoryCode", category."displayName" AS "costCategoryDisplayName",
               component."title" AS "componentTitle", audit."createdAt" AS "effectiveAt",
               NULL::date AS "businessDate", NULL::text AS "appliedAmount", NULL::text AS "observedAmount", NULL::text AS "currency",
               audit."actorUserId", audit."actorName", NULL::text AS "sourceReference", NULL::text AS "sourceUrl",
               NULL::text AS "snapshotId", NULL::text AS "appliedSnapshotId", NULL::text AS "airfareDailyAuthorityId", audit."reason" AS "overrideReason",
               component."status"::text AS "componentStatus",
               CASE audit."action" WHEN 'COMPONENT_ARCHIVED' THEN 'ARCHIVED' ELSE 'ACTIVE' END AS "resultingComponentStatus"
        FROM "cost_audit_events" audit
        JOIN "cost_components" component
          ON component."id" = audit."costComponentId"
         AND component."tenantId" = audit."tenantId"
         AND component."costingProjectId" = audit."costingProjectId"
        JOIN "cost_categories" category
          ON category."id" = component."costCategoryId"
         AND category."tenantId" = component."tenantId"
        WHERE audit."tenantId" = ${tenantId}
          AND audit."action" IN ('COMPONENT_ARCHIVED', 'COMPONENT_REACTIVATED')
          AND audit."costComponentId" IS NOT NULL
          AND (${costComponentId ?? null}::text IS NULL OR audit."costComponentId" = ${costComponentId ?? null})
          AND (${costingProjectId ?? null}::text IS NULL OR audit."costingProjectId" = ${costingProjectId ?? null})
          AND (${categoryCode ?? null}::text IS NULL OR category."code" = ${categoryCode ?? null})
      ), paged_events AS (
        SELECT timeline_events.*, COUNT(*) OVER() AS "total"
        FROM timeline_events
        ORDER BY "effectiveAt" DESC, "eventId" DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      ), evidence_counts AS (
        SELECT evidence."costSnapshotId", COUNT(*) AS "evidenceCount"
        FROM "cost_evidence" evidence
        JOIN (SELECT DISTINCT "snapshotId" FROM paged_events) event_snapshot
          ON event_snapshot."snapshotId" = evidence."costSnapshotId"
        WHERE evidence."tenantId" = ${tenantId}
        GROUP BY evidence."costSnapshotId"
      )
      SELECT paged_events.*, COALESCE(evidence_counts."evidenceCount", 0) AS "evidenceCount"
      FROM paged_events
      LEFT JOIN evidence_counts ON evidence_counts."costSnapshotId" = paged_events."snapshotId"
      ORDER BY paged_events."effectiveAt" DESC, paged_events."eventId" DESC
    `;
    const total = rows.length ? count(rows[0].total) : 0;
    return { events: rows.map(({ total: _total, ...event }) => ({ ...event, evidenceCount: count(event.evidenceCount) })), total, page, pageSize };
  }

  private withTenantTransaction<T>(tenantId: string, operation: string, work: (tx: CostEngineTransaction) => Promise<T>): Promise<T> {
    return runCostEngineTenantTransaction(this.database, this.logger, tenantId, operation, work);
  }

  private async requireActiveProject(tx: CostEngineTransaction, tenantId: string, costingProjectId: string) {
    const project = await tx.costingProject.findFirst({ where: { id: costingProjectId, tenantId }, select: { id: true, baseCurrency: true, status: true } });
    if (!project) throw new NotFoundException("Costing project not found.");
    if (project.status === ARCHIVED) throw new BadRequestException("Costing project is archived.");
    return project;
  }

  private async provisionStandardCategories(tx: CostEngineTransaction, tenantId: string) {
    const count = await tx.costCategory.count({
      where: { tenantId, code: { in: STANDARD_COST_CATEGORIES.map((category) => category.code) } },
    });
    if (count === STANDARD_COST_CATEGORIES.length) return;
    await tx.costCategory.createMany({
      data: STANDARD_COST_CATEGORIES.map((category) => ({
        tenantId, code: category.code, displayName: category.displayName, origin: "STANDARD", isActive: true,
      })),
      skipDuplicates: true,
    });
  }

  private async requireCategory(tx: CostEngineTransaction, tenantId: string, costCategoryId: string) {
    const category = await tx.costCategory.findFirst({ where: { id: costCategoryId, tenantId, isActive: true }, select: { id: true, code: true, origin: true } });
    if (!category) throw new NotFoundException("Cost category not found.");
    return category;
  }

  private async requireSupplier(tx: CostEngineTransaction, tenantId: string, costSupplierId: string) {
    const supplier = await tx.costSupplier.findFirst({ where: { id: costSupplierId, tenantId, isActive: true }, select: { id: true } });
    if (!supplier) throw new NotFoundException("Cost supplier not found.");
  }

  private async requireRelatedAirfareComponent(
    tx: CostEngineTransaction,
    tenantId: string,
    costingProjectId: string,
    category: { code: string; origin: string },
    details: CostComponentDetails,
  ) {
    if (category.origin !== "STANDARD" || category.code !== "BAGGAGE" || !details.detailPayload || typeof details.detailPayload !== "object" || Array.isArray(details.detailPayload)) return;
    const relatedAirfareComponentId = (details.detailPayload as Record<string, unknown>).relatedAirfareComponentId;
    if (typeof relatedAirfareComponentId !== "string") return;

    const relatedAirfare = await tx.costComponent.findFirst({
      where: {
        id: relatedAirfareComponentId,
        tenantId,
        costingProjectId,
        status: ACTIVE,
        costCategory: { code: "AIRFARE", origin: "STANDARD" },
      },
      select: { id: true },
    });
    if (!relatedAirfare) throw new BadRequestException("relatedAirfareComponentId must reference an active AIRFARE component in this costing project.");
  }

  private async requireComponent(tx: CostEngineTransaction, tenantId: string, costComponentId: string) {
    const component = await tx.costComponent.findFirst({ where: { id: costComponentId, tenantId }, select: { id: true } });
    if (!component) throw new NotFoundException("Cost component not found.");
  }

  private async requireSnapshot(tx: CostEngineTransaction, tenantId: string, costSnapshotId: string) {
    const snapshot = await tx.costSnapshot.findFirst({ where: { id: costSnapshotId, tenantId }, select: { id: true } });
    if (!snapshot) throw new NotFoundException("Cost snapshot not found.");
  }

  private async isTravelLinkedProject(tx: CostEngineTransaction, tenantId: string, costingProjectId: string) {
    const rows = await tx.$queryRaw<Array<{ linked: boolean }>>`
      SELECT (
        EXISTS (
          SELECT 1 FROM "travel_package_costing_project_links"
          WHERE "tenantId" = ${tenantId} AND "costingProjectId" = ${costingProjectId}
        )
        OR EXISTS (
          SELECT 1 FROM "internal_trip_costing_project_links"
          WHERE "tenantId" = ${tenantId} AND "costingProjectId" = ${costingProjectId}
        )
      ) AS "linked"
    `;
    return rows[0]?.linked === true;
  }

  private async lockAndRequireComponent(tx: CostEngineTransaction, tenantId: string, costComponentId: string, includeSnapshot = false) {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "cost_components"
      WHERE "id" = ${costComponentId} AND "tenantId" = ${tenantId}
      FOR UPDATE
    `;
    if (locked.length !== 1) throw new NotFoundException("Cost component not found.");
    const component = await tx.costComponent.findFirst({
      where: { id: costComponentId, tenantId },
      select: {
        id: true, costingProjectId: true, costCategoryId: true, costSupplierId: true, status: true, currentSnapshotId: true,
        title: true, description: true, detailPayload: true, detailSchemaVersion: true, quantity: true, unit: true,
        sortPosition: true, costCategory: { select: { code: true, origin: true } },
        ...(includeSnapshot ? { currentSnapshot: { select: { amount: true, currency: true, sourceReference: true, sourceUrl: true } } } : {}),
      },
    });
    if (!component) throw new NotFoundException("Cost component not found.");
    return component;
  }

  private async createSnapshot(tx: CostEngineTransaction, tenantId: string, costingProjectId: string, costComponentId: string, sequence: number, input: CostSnapshotInput, actor: CostActor) {
    return tx.costSnapshot.create({
      data: {
        tenantId, costingProjectId, costComponentId, sequence, amount: input.amount,
        currency: input.currency, capturedByUserId: actor.userId, capturedByName: actor.name,
        sourceReference: input.sourceReference, sourceUrl: input.sourceUrl, reason: input.reason,
      },
      select: { id: true },
    });
  }

  private async setCurrentSnapshot(tx: CostEngineTransaction, tenantId: string, costComponentId: string, currentSnapshotId: string) {
    const updated = await tx.costComponent.updateMany({ where: { id: costComponentId, tenantId }, data: { currentSnapshotId } });
    if (updated.count !== 1) throw new ConflictException("Cost component snapshot pointer conflict.");
  }

  private recordAudit(tx: CostEngineTransaction, tenantId: string, costingProjectId: string, costComponentId: string | null, action: string, actor: CostActor, reason: string | null = null, metadata?: Record<string, unknown>) {
    return tx.costAuditEvent.create({ data: { tenantId, costingProjectId, costComponentId, action, actorUserId: actor.userId, actorName: actor.name, reason, metadata } });
  }

  private requireProjectCurrency(projectCurrency: string, snapshotCurrency: string) {
    if (projectCurrency !== snapshotCurrency) throw new BadRequestException("Snapshot currency must match the costing project base currency.");
  }
}

export type ApplicabilityInput = {
  scopeType: string;
  scopeKey: string | null;
  label: string | null;
  startDate: Date | null;
  endDate: Date | null;
};

export type CostEvidenceInput = {
  objectKey: string;
  originalFileName: string;
  mimeType: string;
  byteSize: number;
  contentHash: string;
  uploadedByUserId: string;
  uploadedByName: string;
};

function componentDetails(input: Pick<CostComponentInput, "detailPayload" | "detailSchemaVersion" | "quantity" | "unit">): CostComponentDetails {
  return {
    detailPayload: input.detailPayload ?? null,
    detailSchemaVersion: input.detailSchemaVersion ?? null,
    quantity: input.quantity ?? null,
    unit: input.unit ?? null,
  };
}

function isUniqueConstraint(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002";
}

function decimalString(value: unknown): string {
  if (value && typeof value === "object" && "toFixed" in value && typeof value.toFixed === "function") return value.toFixed();
  return String(value);
}

function nullableDecimalString(value: unknown): string | null {
  return value === null || value === undefined ? null : decimalString(value);
}

function count(value: bigint | number | string): number {
  return Number(value);
}
