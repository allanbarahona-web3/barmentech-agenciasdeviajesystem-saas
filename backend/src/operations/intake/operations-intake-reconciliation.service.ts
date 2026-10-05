import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import {
  ADDITIONAL_SERVICE_ORDER_LINE_SOURCE,
  OPERATIONS_SOURCE_ITEM_APPROVED_EVENT,
  TRAVEL_PACKAGE_COST_COMPONENT_SOURCE,
} from "./operations-intake-outbox.constants";
import { persistOperationsIntakeOutboxEvents } from "./operations-intake-outbox-writer";
import {
  OPERATIONAL_WORK_SOURCE_RECONCILIATION_READER,
  operationalWorkSourceIdentityKey,
  type OperationalWorkSourceReconciliationReader,
} from "./operational-work-source-reconciliation.port";
import {
  OPERATIONAL_WORK_SOURCE_READER,
  OperationalWorkMaterializationError,
  type OperationalWorkSourceReader,
  type OperationalWorkSourceReference,
} from "./operational-work-source-reader.port";
import {
  OPERATIONAL_CONTRACTED_TRAVEL_PACKAGE_ROSTER_READER,
  type ContractedTravelPackageRosterReader,
} from "./contracted-travel-package-roster-reader.port";
import {
  TRAVEL_PACKAGE_COST_COMPONENT_RECONCILIATION_READER,
  type TravelPackageCostComponentOperationalWorkSourceReconciliationAdapter,
} from "./travel-package-cost-component-operational-work-source-reconciliation.adapter";

type ReconciliationState =
  | "VALID"
  | "MISSING_OPERATIONAL_WORK"
  | "IN_FLIGHT"
  | "FAILED_INTAKE"
  | "PROCESSED_WITHOUT_WORK"
  | "SOURCE_MISSING"
  | "SOURCE_NOT_ELIGIBLE"
  | "SOURCE_CANCELLED_NO_ACTIVITY"
  | "SOURCE_CANCELLED_WITH_ACTIVITY"
  | "PACKAGE_MISMATCH"
  | "SOURCE_IDENTITY_CONFLICT"
  | "SOURCE_DRIFT_NO_OPERATIONAL_ACTIVITY"
  | "SOURCE_DRIFT_WITH_OPERATIONAL_ACTIVITY";

export type OperationsIntakeReconciliationInput = {
  tenantId: string;
  travelPackageId?: string;
  cursor?: string;
  limit?: number;
  dryRun?: boolean;
};

export type OperationsIntakeReconciliationResult = {
  items: Array<{
    sourceType: string;
    sourceId: string;
    sourceLineId: string;
    state: ReconciliationState;
    operationalRequirementId?: string;
    outboxEventId?: string;
    issueCode?: string;
    hasOperationalActivity?: boolean;
  }>;
  nextCursor: string | null;
  summary: ReconciliationSummary;
};

export type ReconciliationSummary = {
  scanned: number;
  valid: number;
  missingWork: number;
  eventsCreated: number;
  inFlight: number;
  failed: number;
  processedWithoutWork: number;
  sourceInvalid: number;
  drift: number;
  cancelledNoActivity: number;
  cancelledWithActivity: number;
};

export type TravelPackageBaseReconciliationState =
  | "HEALTHY"
  | "MISSING_INTAKE"
  | "IN_FLIGHT"
  | "FAILED"
  | "INCONSISTENT"
  | "PASSENGER_EXPANSION"
  | "PASSENGER_CONTRACTION"
  | "SOURCE_DRIFT"
  | "SOURCE_INACTIVE"
  | "SNAPSHOT_UNAVAILABLE";

export type TravelPackageBaseReconciliationResult = {
  items: Array<{
    sourceType: typeof TRAVEL_PACKAGE_COST_COMPONENT_SOURCE;
    sourceId: string;
    sourceLineId: string;
    state: TravelPackageBaseReconciliationState;
    operationalRequirementId?: string;
    outboxEventId?: string;
    issueCode?: string;
    changedFields?: string[];
  }>;
  nextCursor: string | null;
  summary: {
    scanned: number;
    healthy: number;
    missingIntake: number;
    inFlight: number;
    failed: number;
    inconsistent: number;
    passengerExpansion: number;
    passengerContraction: number;
    sourceDrift: number;
    sourceInactive: number;
    snapshotUnavailable: number;
    eventsCreated: number;
    eventsReplayed: number;
  };
};

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 25;

@Injectable()
export class OperationsIntakeReconciliationService {
  private readonly logger = new Logger(OperationsIntakeReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OPERATIONAL_WORK_SOURCE_RECONCILIATION_READER)
    private readonly sourceReconciliationReader: OperationalWorkSourceReconciliationReader,
    @Inject(OPERATIONAL_WORK_SOURCE_READER)
    private readonly sourceReader: OperationalWorkSourceReader,
    @Inject(TRAVEL_PACKAGE_COST_COMPONENT_RECONCILIATION_READER)
    private readonly baseSourceReconciliationReader: TravelPackageCostComponentOperationalWorkSourceReconciliationAdapter,
    @Inject(OPERATIONAL_CONTRACTED_TRAVEL_PACKAGE_ROSTER_READER)
    private readonly contractedRosterReader: ContractedTravelPackageRosterReader,
  ) {}

  /** Explicit bounded repair for commercially approved source lines. Defaults to dry-run. */
  async reconcileAdditionalServices(input: OperationsIntakeReconciliationInput): Promise<OperationsIntakeReconciliationResult> {
    const limit = normalizeLimit(input.limit);
    const dryRun = input.dryRun ?? true;
    this.logger.log({ event: "operations-intake-reconciliation-started", tenantId: input.tenantId, travelPackageId: input.travelPackageId ?? null, dryRun, limit });
    const sourcePage = await this.sourceReconciliationReader.scanApprovedSourceItems({
      tenantId: input.tenantId,
      travelPackageId: input.travelPackageId,
      cursor: input.cursor,
      limit,
    });
    const sourceItems = sourcePage.items;
    const pairs = sourceItems.map((item) => identityWhere(item));
    const snapshot = await runTenantTransaction<any, ReconciliationSnapshot>(this.prisma as any, input.tenantId, async (tx) => {
      if (pairs.length === 0) return { requirements: [], outboxEvents: [] };
      const where = { tenantId: input.tenantId, sourceType: ADDITIONAL_SERVICE_ORDER_LINE_SOURCE, OR: pairs };
      const [requirements, outboxEvents] = await Promise.all([
        tx.operationalRequirement.findMany({ where, select: { id: true, travelPackageId: true, sourceId: true, sourceLineId: true } }),
        tx.operationsIntakeOutboxEvent.findMany({
          where: { tenantId: input.tenantId, eventType: OPERATIONS_SOURCE_ITEM_APPROVED_EVENT, sourceType: ADDITIONAL_SERVICE_ORDER_LINE_SOURCE, OR: pairs },
          select: { id: true, travelPackageId: true, sourceId: true, sourceLineId: true, status: true },
        }),
      ]);
      return { requirements, outboxEvents };
    });
    const requirementsBySource = mapBySource(snapshot.requirements);
    const eventsBySource = mapBySource(snapshot.outboxEvents);
    const result: OperationsIntakeReconciliationResult = { items: [], nextCursor: sourcePage.nextCursor, summary: emptySummary(sourceItems.length) };
    const eventsToCreate = sourceItems
      .filter((item) => !requirementsBySource.has(operationalWorkSourceIdentityKey(item)) && !eventsBySource.has(operationalWorkSourceIdentityKey(item)))
      .filter((item) => item.sourceAcceptedAt instanceof Date)
      .map((item) => ({
        tenantId: item.tenantId,
        travelPackageId: item.travelPackageId,
        eventType: OPERATIONS_SOURCE_ITEM_APPROVED_EVENT,
        eventVersion: 1,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        sourceLineId: item.sourceLineId,
        sourceVersionId: item.sourceVersionId,
        availableAt: item.sourceAcceptedAt!,
      }));
    for (const item of sourceItems) {
      const key = operationalWorkSourceIdentityKey(item);
      const requirement = requirementsBySource.get(key);
      const event = eventsBySource.get(key);
      if (requirement) {
        result.items.push(itemResult(item, "VALID", { operationalRequirementId: requirement.id }));
        result.summary.valid += 1;
      } else if (!event) {
        result.items.push(itemResult(item, "MISSING_OPERATIONAL_WORK"));
        result.summary.missingWork += 1;
      } else if (event.status === "PENDING" || event.status === "PROCESSING") {
        result.items.push(itemResult(item, "IN_FLIGHT", { outboxEventId: event.id }));
        result.summary.inFlight += 1;
      } else if (event.status === "FAILED") {
        result.items.push(itemResult(item, "FAILED_INTAKE", { outboxEventId: event.id, issueCode: "FAILED_INTAKE" }));
        result.summary.failed += 1;
      } else {
        result.items.push(itemResult(item, "PROCESSED_WITHOUT_WORK", { outboxEventId: event.id, issueCode: "PROCESSED_WITHOUT_WORK" }));
        result.summary.processedWithoutWork += 1;
      }
    }
    if (!dryRun && eventsToCreate.length > 0) {
      const persisted = await runTenantTransaction<any, { count: number }>(this.prisma as any, input.tenantId, (tx) => persistOperationsIntakeOutboxEvents(tx, eventsToCreate));
      result.summary.eventsCreated = persisted.count;
      this.logger.log({ event: "operations-intake-backfill-events-created", tenantId: input.tenantId, travelPackageId: input.travelPackageId ?? null, eventCount: persisted.count });
    }
    this.logger.log({ event: "operations-intake-reconciliation-completed", tenantId: input.tenantId, dryRun, ...result.summary });
    return result;
  }

  /** Read-only audit of materialized source-derived work. No source snapshots are changed. */
  async auditMaterializedAdditionalServices(input: Omit<OperationsIntakeReconciliationInput, "dryRun">): Promise<OperationsIntakeReconciliationResult> {
    const limit = normalizeLimit(input.limit);
    const page = await runTenantTransaction<any, RequirementAuditPage>(this.prisma as any, input.tenantId, async (tx) => {
      const rows = await tx.operationalRequirement.findMany({
        where: {
          tenantId: input.tenantId,
          sourceType: ADDITIONAL_SERVICE_ORDER_LINE_SOURCE,
          ...(input.travelPackageId ? { travelPackageId: input.travelPackageId } : {}),
          ...(input.cursor ? { id: { gt: input.cursor } } : {}),
        },
        select: requirementAuditSelect(),
        orderBy: { id: "asc" },
        take: limit + 1,
      });
      const items = rows.slice(0, limit);
      const requirementIds = items.map((row: any) => row.id);
      const [passengers, fulfillments] = requirementIds.length === 0 ? [[], []] : await Promise.all([
        tx.operationalRequirementPassenger.findMany({
          where: { tenantId: input.tenantId, operationalRequirementId: { in: requirementIds } },
          select: { operationalRequirementId: true, travelPackageParticipant: { select: { clientId: true } } },
        }),
        tx.operationalFulfillment.findMany({
          where: { tenantId: input.tenantId, operationalRequirementId: { in: requirementIds } },
          select: { operationalRequirementId: true },
          distinct: ["operationalRequirementId"],
        }),
      ]);
      return { items, passengers, fulfillments, nextCursor: rows.length > limit ? items.at(-1)?.id ?? null : null };
    });
    const references = page.items
      .filter((requirement: any) => typeof requirement.sourceId === "string" && typeof requirement.sourceLineId === "string")
      .map((requirement: any) => referenceFromRequirement(requirement));
    const inspections = await this.sourceReconciliationReader.inspectSourceItems({
      tenantId: input.tenantId,
      references,
    });
    const passengerClients = groupPassengerClients(page.passengers);
    const activeRequirements = new Set(page.fulfillments.map((fulfillment: any) => fulfillment.operationalRequirementId));
    const result: OperationsIntakeReconciliationResult = { items: [], nextCursor: page.nextCursor, summary: emptySummary(page.items.length) };
    for (const requirement of page.items) {
      const reference = referenceFromRequirement(requirement);
      const inspection = typeof requirement.sourceId === "string" && typeof requirement.sourceLineId === "string"
        ? inspections.get(operationalWorkSourceIdentityKey(reference))
        : { reference, state: "SOURCE_IDENTITY_CONFLICT", item: null };
      const hasOperationalActivity = activeRequirements.has(requirement.id);
      const classified = classifyRequirementAudit(requirement, inspection, passengerClients.get(requirement.id) ?? [], hasOperationalActivity);
      result.items.push({
        sourceType: reference.sourceType,
        sourceId: reference.sourceId,
        sourceLineId: reference.sourceLineId,
        state: classified.state,
        operationalRequirementId: requirement.id,
        issueCode: classified.issueCode,
        hasOperationalActivity,
      });
      addAuditSummary(result.summary, classified.state);
    }
    this.logger.log({ event: "operations-intake-source-audit-completed", tenantId: input.tenantId, ...result.summary });
    return result;
  }

  /**
   * Bounded, source-aware audit and safe repair for Cost Engine base work.
   * Requirement snapshots and execution remain strictly read-only here.
   */
  async reconcileTravelPackageBaseComponents(
    input: OperationsIntakeReconciliationInput,
  ): Promise<TravelPackageBaseReconciliationResult> {
    const limit = normalizeLimit(input.limit);
    const dryRun = input.dryRun ?? true;
    const sourcePage = await this.baseSourceReconciliationReader.scanSources({
      tenantId: input.tenantId,
      travelPackageId: input.travelPackageId,
      cursor: input.cursor,
      limit,
    });
    const references = sourcePage.sources.map((source) => source.reference);
    const pairs = references.map(identityWhere);
    const snapshot = await runTenantTransaction<any, BaseReconciliationSnapshot>(this.prisma as any, input.tenantId, async (tx) => {
      if (pairs.length === 0) return { requirements: [], outboxEvents: [], passengers: [] };
      const requirementWhere = {
        tenantId: input.tenantId,
        sourceType: TRAVEL_PACKAGE_COST_COMPONENT_SOURCE,
        OR: pairs,
      };
      const [requirements, outboxEvents] = await Promise.all([
        tx.operationalRequirement.findMany({
          where: requirementWhere,
          select: { id: true, travelPackageId: true, sourceId: true, sourceLineId: true, sourceSnapshot: true },
        }),
        tx.operationsIntakeOutboxEvent.findMany({
          where: {
            tenantId: input.tenantId,
            eventType: OPERATIONS_SOURCE_ITEM_APPROVED_EVENT,
            sourceType: TRAVEL_PACKAGE_COST_COMPONENT_SOURCE,
            OR: pairs,
          },
          select: { id: true, travelPackageId: true, sourceId: true, sourceLineId: true, status: true },
        }),
      ]);
      const requirementIds = requirements.map((requirement: any) => requirement.id);
      const passengers = requirementIds.length === 0 ? [] : await tx.operationalRequirementPassenger.findMany({
        where: { tenantId: input.tenantId, operationalRequirementId: { in: requirementIds } },
        select: { operationalRequirementId: true, travelPackageParticipantId: true },
      });
      return { requirements, outboxEvents, passengers };
    });
    const requirementsBySource = mapBySource(snapshot.requirements);
    const eventsBySource = mapBySource(snapshot.outboxEvents);
    const requirementPassengerIds = groupRequirementPassengerIds(snapshot.passengers);
    const rosterPackageIds = [...new Set(snapshot.requirements.map((requirement) => requirement.travelPackageId))];
    const rosters = await this.contractedRosterReader.readContractedRosters({ tenantId: input.tenantId, travelPackageIds: rosterPackageIds });
    const result: TravelPackageBaseReconciliationResult = {
      items: [], nextCursor: sourcePage.nextCursor, summary: emptyBaseSummary(sourcePage.sources.length),
    };
    const eventsToCreate: Array<ReturnType<typeof intakeEventFromSource>> = [];
    const processedEventIdsToReplay: string[] = [];

    for (const source of sourcePage.sources) {
      const reference = source.reference;
      const key = operationalWorkSourceIdentityKey(reference);
      const requirement = requirementsBySource.get(key);
      const event = eventsBySource.get(key);
      let classified: Omit<TravelPackageBaseReconciliationResult["items"][number], "sourceType" | "sourceId" | "sourceLineId">;

      if (source.state === "SOURCE_INACTIVE") {
        classified = { state: "SOURCE_INACTIVE", operationalRequirementId: requirement?.id, outboxEventId: event?.id, issueCode: "ARCHIVED_SOURCE" };
      } else if (source.state !== "VALID" || !source.item) {
        classified = { state: "INCONSISTENT", operationalRequirementId: requirement?.id, outboxEventId: event?.id, issueCode: "SOURCE_NOT_ELIGIBLE" };
      } else if (!requirement) {
        if (!event) {
          classified = { state: "MISSING_INTAKE" };
          if (!dryRun) eventsToCreate.push(intakeEventFromSource(source.item));
        } else if (event.status === "PENDING" || event.status === "PROCESSING") {
          classified = { state: "IN_FLIGHT", outboxEventId: event.id };
        } else if (event.status === "FAILED") {
          classified = { state: "FAILED", outboxEventId: event.id, issueCode: "FAILED_INTAKE" };
        } else {
          classified = { state: "INCONSISTENT", outboxEventId: event.id, issueCode: "PROCESSED_WITHOUT_WORK" };
        }
      } else if (event?.status === "FAILED") {
        classified = { state: "FAILED", operationalRequirementId: requirement.id, outboxEventId: event.id, issueCode: "FAILED_INTAKE" };
      } else if (event?.status === "PENDING" || event?.status === "PROCESSING") {
        classified = { state: "IN_FLIGHT", operationalRequirementId: requirement.id, outboxEventId: event.id };
      } else if (requirement.sourceSnapshot === null) {
        classified = { state: "SNAPSHOT_UNAVAILABLE", operationalRequirementId: requirement.id, outboxEventId: event?.id, issueCode: "SNAPSHOT_UNAVAILABLE" };
      } else {
        const changedFields = changedSourceSnapshotFields(requirement.sourceSnapshot, source.item.sourceSnapshot);
        if (changedFields.length > 0) {
          classified = { state: "SOURCE_DRIFT", operationalRequirementId: requirement.id, outboxEventId: event?.id, issueCode: "SOURCE_SNAPSHOT_DRIFT", changedFields };
        } else {
          const currentPassengerIds = new Set((rosters.get(requirement.travelPackageId) ?? []).map((participant) => participant.id));
          const storedPassengerIds = requirementPassengerIds.get(requirement.id) ?? new Set<string>();
          const hasExpansion = [...currentPassengerIds].some((participantId) => !storedPassengerIds.has(participantId));
          const hasContraction = [...storedPassengerIds].some((participantId) => !currentPassengerIds.has(participantId));
          if (hasExpansion) {
            classified = { state: "PASSENGER_EXPANSION", operationalRequirementId: requirement.id, outboxEventId: event?.id };
            if (!dryRun) {
              if (!event) eventsToCreate.push(intakeEventFromSource(source.item));
              else if (event.status === "PROCESSED") processedEventIdsToReplay.push(event.id);
            }
          } else if (hasContraction) {
            classified = { state: "PASSENGER_CONTRACTION", operationalRequirementId: requirement.id, outboxEventId: event?.id, issueCode: "PASSENGER_SCOPE_CONTRACTION" };
          } else {
            classified = { state: "HEALTHY", operationalRequirementId: requirement.id, outboxEventId: event?.id };
          }
        }
      }
      result.items.push({ sourceType: TRAVEL_PACKAGE_COST_COMPONENT_SOURCE, sourceId: reference.sourceId, sourceLineId: reference.sourceLineId, ...classified });
      addBaseSummary(result.summary, classified.state);
    }

    if (!dryRun && (eventsToCreate.length > 0 || processedEventIdsToReplay.length > 0)) {
      const repaired = await runTenantTransaction<any, { created: number; replayed: number }>(this.prisma as any, input.tenantId, async (tx) => {
        const created = eventsToCreate.length === 0 ? { count: 0 } : await persistOperationsIntakeOutboxEvents(tx, eventsToCreate);
        const replayed = processedEventIdsToReplay.length === 0 ? { count: 0 } : await tx.operationsIntakeOutboxEvent.updateMany({
          where: {
            id: { in: processedEventIdsToReplay }, tenantId: input.tenantId,
            eventType: OPERATIONS_SOURCE_ITEM_APPROVED_EVENT,
            sourceType: TRAVEL_PACKAGE_COST_COMPONENT_SOURCE,
            status: "PROCESSED",
          },
          data: { status: "PENDING", attemptCount: 0, availableAt: new Date(), lockedAt: null, lockedBy: null, processedAt: null, lastAttemptAt: null, lastError: null },
        });
        return { created: created.count, replayed: replayed.count };
      });
      result.summary.eventsCreated = repaired.created;
      result.summary.eventsReplayed = repaired.replayed;
    }
    this.logger.log({ event: "travel-package-base-operations-reconciliation-completed", tenantId: input.tenantId, dryRun, ...result.summary });
    return result;
  }

  /** Explicit retry only for a currently valid source (or temporary participant absence). */
  async retryFailedAdditionalServiceEvent(tenantId: string, eventId: string): Promise<{ status: "REQUEUED" | "NOT_RETRYABLE" | "NOT_FOUND" }> {
    const event = await runTenantTransaction<any, any>(this.prisma as any, tenantId, (tx) => tx.operationsIntakeOutboxEvent.findFirst({
      where: { id: eventId, tenantId, status: "FAILED" },
      select: { id: true, tenantId: true, travelPackageId: true, eventType: true, eventVersion: true, sourceType: true, sourceId: true, sourceLineId: true },
    }));
    if (!event) return { status: "NOT_FOUND" };
    if (event.eventType !== OPERATIONS_SOURCE_ITEM_APPROVED_EVENT || event.eventVersion !== 1 || event.sourceType !== ADDITIONAL_SERVICE_ORDER_LINE_SOURCE) {
      return { status: "NOT_RETRYABLE" };
    }
    try {
      await this.sourceReader.readSourceItem(referenceFromEvent(event));
    } catch (error) {
      if (!(error instanceof OperationalWorkMaterializationError) || error.code !== "PARTICIPANT_NOT_FOUND") return { status: "NOT_RETRYABLE" };
    }
    const updated = await runTenantTransaction<any, { count: number }>(this.prisma as any, tenantId, (tx) => tx.operationsIntakeOutboxEvent.updateMany({
      where: { id: event.id, tenantId, status: "FAILED" },
      data: { status: "PENDING", attemptCount: 0, availableAt: new Date(), lockedAt: null, lockedBy: null, processedAt: null, lastAttemptAt: null, lastError: null },
    }));
    if (updated.count !== 1) return { status: "NOT_RETRYABLE" };
    this.logger.log({ event: "operations-intake-failed-event-requeued", tenantId, eventId: event.id, sourceId: event.sourceId, sourceLineId: event.sourceLineId });
    return { status: "REQUEUED" };
  }
}

type ReconciliationSnapshot = { requirements: Array<{ id: string; travelPackageId: string; sourceId: string | null; sourceLineId: string | null }>; outboxEvents: Array<{ id: string; travelPackageId: string; sourceId: string; sourceLineId: string; status: string }> };
type BaseReconciliationSnapshot = {
  requirements: Array<{ id: string; travelPackageId: string; sourceId: string | null; sourceLineId: string | null; sourceSnapshot: Prisma.JsonValue | null }>;
  outboxEvents: Array<{ id: string; travelPackageId: string; sourceId: string; sourceLineId: string; status: string }>;
  passengers: Array<{ operationalRequirementId: string; travelPackageParticipantId: string }>;
};
type RequirementAuditPage = { items: any[]; passengers: any[]; fulfillments: any[]; nextCursor: string | null };

function intakeEventFromSource(item: { tenantId: string; travelPackageId: string; sourceType: string; sourceId: string; sourceLineId: string; sourceVersionId: string | null }) {
  return {
    tenantId: item.tenantId,
    travelPackageId: item.travelPackageId,
    eventType: OPERATIONS_SOURCE_ITEM_APPROVED_EVENT,
    eventVersion: 1,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    sourceLineId: item.sourceLineId,
    sourceVersionId: item.sourceVersionId,
    availableAt: new Date(),
  };
}

function emptyBaseSummary(scanned: number): TravelPackageBaseReconciliationResult["summary"] {
  return {
    scanned, healthy: 0, missingIntake: 0, inFlight: 0, failed: 0,
    inconsistent: 0, passengerExpansion: 0, passengerContraction: 0,
    sourceDrift: 0, sourceInactive: 0, snapshotUnavailable: 0,
    eventsCreated: 0, eventsReplayed: 0,
  };
}

function addBaseSummary(
  summary: TravelPackageBaseReconciliationResult["summary"],
  state: TravelPackageBaseReconciliationState,
) {
  if (state === "HEALTHY") summary.healthy += 1;
  else if (state === "MISSING_INTAKE") summary.missingIntake += 1;
  else if (state === "IN_FLIGHT") summary.inFlight += 1;
  else if (state === "FAILED") summary.failed += 1;
  else if (state === "INCONSISTENT") summary.inconsistent += 1;
  else if (state === "PASSENGER_EXPANSION") summary.passengerExpansion += 1;
  else if (state === "PASSENGER_CONTRACTION") summary.passengerContraction += 1;
  else if (state === "SOURCE_DRIFT") summary.sourceDrift += 1;
  else if (state === "SOURCE_INACTIVE") summary.sourceInactive += 1;
  else summary.snapshotUnavailable += 1;
}

function groupRequirementPassengerIds(rows: BaseReconciliationSnapshot["passengers"]) {
  const result = new Map<string, Set<string>>();
  for (const row of rows) {
    const participantIds = result.get(row.operationalRequirementId) ?? new Set<string>();
    participantIds.add(row.travelPackageParticipantId);
    result.set(row.operationalRequirementId, participantIds);
  }
  return result;
}

const SOURCE_SNAPSHOT_FIELDS = [
  "travelPackageId", "costingProjectId", "costComponentId", "category", "title",
  "description", "structuredDetails", "detailSchemaVersion", "quantity", "unit",
  "supplier", "currentCostSnapshotId", "currentInternalCost",
] as const;

function changedSourceSnapshotFields(
  persisted: unknown,
  current: unknown,
): string[] {
  if (!isRecord(persisted) || !isRecord(current)) return ["sourceSnapshot"];
  return SOURCE_SNAPSHOT_FIELDS.filter((field) => canonicalJson(persisted[field]) !== canonicalJson(current[field]));
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value === undefined ? null : value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function identityWhere(item: Pick<OperationalWorkSourceReference, "travelPackageId" | "sourceId" | "sourceLineId">) {
  return { travelPackageId: item.travelPackageId, sourceId: item.sourceId, sourceLineId: item.sourceLineId };
}

function mapBySource<T extends { sourceId: string | null; sourceLineId: string | null }>(items: T[]) {
  const result = new Map<string, T>();
  for (const item of items) if (item.sourceId && item.sourceLineId) result.set(operationalWorkSourceIdentityKey({ sourceId: item.sourceId, sourceLineId: item.sourceLineId }), item);
  return result;
}

function itemResult(item: OperationalWorkSourceReference, state: ReconciliationState, extra: Partial<OperationsIntakeReconciliationResult["items"][number]> = {}) {
  return { sourceType: item.sourceType, sourceId: item.sourceId, sourceLineId: item.sourceLineId, state, ...extra };
}

function emptySummary(scanned: number): ReconciliationSummary {
  return { scanned, valid: 0, missingWork: 0, eventsCreated: 0, inFlight: 0, failed: 0, processedWithoutWork: 0, sourceInvalid: 0, drift: 0, cancelledNoActivity: 0, cancelledWithActivity: 0 };
}

function normalizeLimit(value: number | undefined) {
  if (value === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) throw new Error("OPERATIONS_INTAKE_RECONCILIATION_LIMIT_INVALID");
  return value;
}

function requirementAuditSelect() {
  return {
    id: true, tenantId: true, travelPackageId: true, sourceType: true, sourceId: true, sourceLineId: true, sourceVersionId: true,
    servicePurposeCode: true, servicePurposeName: true, description: true, soldAmount: true, soldCurrency: true, soldValueScope: true,
  } as const;
}

function referenceFromRequirement(requirement: any): OperationalWorkSourceReference {
  return { tenantId: requirement.tenantId, travelPackageId: requirement.travelPackageId, sourceType: requirement.sourceType, sourceId: requirement.sourceId, sourceLineId: requirement.sourceLineId };
}

function referenceFromEvent(event: any): OperationalWorkSourceReference {
  return { tenantId: event.tenantId, travelPackageId: event.travelPackageId, sourceType: event.sourceType, sourceId: event.sourceId, sourceLineId: event.sourceLineId };
}

function groupPassengerClients(rows: any[]) {
  const result = new Map<string, string[]>();
  for (const row of rows) {
    const clientId = row.travelPackageParticipant?.clientId;
    if (typeof clientId !== "string") continue;
    const values = result.get(row.operationalRequirementId) ?? [];
    values.push(clientId);
    result.set(row.operationalRequirementId, values);
  }
  return result;
}

function classifyRequirementAudit(requirement: any, inspection: any, storedClientIds: string[], hasOperationalActivity: boolean) {
  if (!inspection || inspection.state === "SOURCE_MISSING") return { state: "SOURCE_MISSING" as const, issueCode: "SOURCE_MISSING" };
  if (inspection.state === "SOURCE_CANCELLED") return { state: hasOperationalActivity ? "SOURCE_CANCELLED_WITH_ACTIVITY" as const : "SOURCE_CANCELLED_NO_ACTIVITY" as const, issueCode: "SOURCE_CANCELLED" };
  if (inspection.state !== "VALID") return { state: inspection.state as ReconciliationState, issueCode: inspection.state };
  const current = inspection.item;
  const drift = current.sourceVersionId !== requirement.sourceVersionId
    || current.servicePurposeCode !== requirement.servicePurposeCode
    || current.servicePurposeName !== requirement.servicePurposeName
    || current.description !== requirement.description
    || !sameSoldValue(current.soldValue, requirement)
    || !sameSet(current.participantClientIds, storedClientIds);
  return drift
    ? { state: hasOperationalActivity ? "SOURCE_DRIFT_WITH_OPERATIONAL_ACTIVITY" as const : "SOURCE_DRIFT_NO_OPERATIONAL_ACTIVITY" as const, issueCode: "SOURCE_SNAPSHOT_DRIFT" }
    : { state: "VALID" as const };
}

function sameSet(left: readonly string[], right: readonly string[]) {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameSoldValue(
  current: { scope: string; amount: string; currency: string } | null,
  requirement: { soldValueScope: string; soldAmount: Prisma.Decimal | null; soldCurrency: string | null },
) {
  if (!current) return requirement.soldValueScope === "NONE" && requirement.soldAmount === null && requirement.soldCurrency === null;
  if (current.scope !== requirement.soldValueScope || current.currency !== requirement.soldCurrency || !requirement.soldAmount) return false;
  try {
    return new Prisma.Decimal(current.amount).equals(requirement.soldAmount);
  } catch {
    return false;
  }
}

function addAuditSummary(summary: ReconciliationSummary, state: ReconciliationState) {
  if (state === "VALID") summary.valid += 1;
  else if (state === "SOURCE_CANCELLED_NO_ACTIVITY") summary.cancelledNoActivity += 1;
  else if (state === "SOURCE_CANCELLED_WITH_ACTIVITY") summary.cancelledWithActivity += 1;
  else if (state === "SOURCE_DRIFT_NO_OPERATIONAL_ACTIVITY" || state === "SOURCE_DRIFT_WITH_OPERATIONAL_ACTIVITY") summary.drift += 1;
  else summary.sourceInvalid += 1;
}
