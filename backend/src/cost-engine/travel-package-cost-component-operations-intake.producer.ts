import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  OPERATIONS_SOURCE_ITEM_APPROVED_EVENT,
  TRAVEL_PACKAGE_COST_COMPONENT_SOURCE,
} from "../operations/intake/operations-intake-outbox.constants";
import { persistOperationsIntakeOutboxEvents } from "../operations/intake/operations-intake-outbox-writer";

const MAX_COMPONENT_BATCH_SIZE = 25;
const COMPONENT_PAGE_SIZE = 25;

/**
 * Travel/Operations integration boundary. It is called from the owning Cost
 * Engine write transaction after an ACTIVE component has its current snapshot.
 */
@Injectable()
export class TravelPackageCostComponentOperationsIntakeProducer {
  private readonly logger = new Logger(TravelPackageCostComponentOperationsIntakeProducer.name);

  persistEligibleComponent(
    tx: Prisma.TransactionClient,
    tenantId: string,
    costComponentId: string,
  ): Promise<number> {
    return this.persistEligibleComponents(tx, tenantId, [costComponentId]);
  }

  async persistEligibleComponents(
    tx: Prisma.TransactionClient,
    tenantId: string,
    costComponentIds: readonly string[],
  ): Promise<number> {
    const ids = normalizeComponentIds(costComponentIds);
    if (ids.length === 0) return 0;

    const components = await tx.costComponent.findMany({
      where: {
        tenantId,
        id: { in: ids },
        status: "ACTIVE",
        currentSnapshotId: { not: null },
      },
      select: {
        id: true,
        costingProjectId: true,
        currentSnapshot: { select: { id: true, currency: true, capturedAt: true } },
        costingProject: { select: { baseCurrency: true } },
      },
    });
    const projectIds = [...new Set(components.map((component) => component.costingProjectId))];
    if (projectIds.length === 0) return 0;
    const links = await tx.travelPackageCostingProjectLink.findMany({
      where: { tenantId, costingProjectId: { in: projectIds } },
      select: {
        costingProjectId: true,
        travelPackage: { select: { id: true } },
      },
    });
    const travelPackageIdByProjectId = new Map(
      links.map((link) => [link.costingProjectId, link.travelPackage.id]),
    );
    const events = components.flatMap((component) => {
      const snapshot = component.currentSnapshot;
      const travelPackageId = travelPackageIdByProjectId.get(component.costingProjectId);
      if (!snapshot || !travelPackageId || snapshot.currency !== component.costingProject.baseCurrency) return [];
      return [{
        tenantId,
        travelPackageId,
        eventType: OPERATIONS_SOURCE_ITEM_APPROVED_EVENT,
        eventVersion: 1,
        sourceType: TRAVEL_PACKAGE_COST_COMPONENT_SOURCE,
        sourceId: component.costingProjectId,
        sourceLineId: component.id,
        sourceVersionId: snapshot.id,
        availableAt: snapshot.capturedAt,
      }];
    });
    if (events.length === 0) return 0;

    let persisted: { count: number };
    try {
      persisted = await persistOperationsIntakeOutboxEvents(tx, events);
    } catch {
      throw new InternalServerErrorException({
        code: "OPERATIONS_INTAKE_OUTBOX_PERSISTENCE_FAILED",
        message: "No se pudo registrar el trabajo operativo base.",
      });
    }
    this.logger.log({
      event: "travel-package-cost-component-operations-intake-events-prepared",
      tenantId,
      componentCount: events.length,
      insertedCount: persisted.count,
      idempotentReplay: persisted.count !== events.length,
    });
    return persisted.count;
  }

  /**
   * Reconciles only existing base-intake identities after Contract reservation
   * approval has made the contracted roster available in this transaction.
   * The outbox worker remains the sole requirement/passenger materializer.
   */
  async reconcileAfterContractedRoster(
    tx: Prisma.TransactionClient,
    tenantId: string,
    travelPackageId: string,
  ): Promise<{ eligibleComponents: number; eventsCreated: number; eventsRequeued: number }> {
    const contractedParticipantIds = await readContractedParticipantIds(tx, tenantId, travelPackageId);
    if (contractedParticipantIds.length === 0) return { eligibleComponents: 0, eventsCreated: 0, eventsRequeued: 0 };

    let cursor: string | undefined;
    let eligibleComponents = 0;
    let eventsCreated = 0;
    let eventsRequeued = 0;
    do {
      const page = await tx.costComponent.findMany({
        where: {
          tenantId,
          status: "ACTIVE",
          currentSnapshotId: { not: null },
          ...(cursor ? { id: { gt: cursor } } : {}),
          costingProject: {
            travelPackageLinks: { some: { tenantId, travelPackageId } },
          },
        },
        select: {
          id: true,
          costingProjectId: true,
          currentSnapshot: { select: { currency: true } },
          costingProject: { select: { baseCurrency: true } },
        },
        orderBy: { id: "asc" },
        take: COMPONENT_PAGE_SIZE + 1,
      });
      const components = page.slice(0, COMPONENT_PAGE_SIZE).filter((component) =>
        component.currentSnapshot?.currency === component.costingProject.baseCurrency,
      );
      cursor = page.length > COMPONENT_PAGE_SIZE ? page[COMPONENT_PAGE_SIZE - 1]?.id : undefined;
      if (components.length === 0) continue;

      eligibleComponents += components.length;
      eventsCreated += await this.persistEligibleComponents(tx, tenantId, components.map((component) => component.id));
      eventsRequeued += await requeueTerminalEventsWithMissingRosterCoverage(
        tx,
        tenantId,
        travelPackageId,
        components.map((component) => ({ sourceId: component.costingProjectId, sourceLineId: component.id })),
        contractedParticipantIds,
      );
    } while (cursor);

    return { eligibleComponents, eventsCreated, eventsRequeued };
  }
}

async function readContractedParticipantIds(
  tx: Prisma.TransactionClient,
  tenantId: string,
  travelPackageId: string,
): Promise<string[]> {
  const participantIds: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await tx.travelPackageParticipant.findMany({
      where: {
        tenantId,
        travelPackageId,
        ...(cursor ? { id: { gt: cursor } } : {}),
        contractSources: { some: { tenantId, travelPackageId } },
      },
      select: { id: true },
      orderBy: { id: "asc" },
      take: COMPONENT_PAGE_SIZE + 1,
    });
    const participants = page.slice(0, COMPONENT_PAGE_SIZE);
    participantIds.push(...participants.map((participant) => participant.id));
    cursor = page.length > COMPONENT_PAGE_SIZE ? participants.at(-1)?.id : undefined;
  } while (cursor);
  return participantIds;
}

async function requeueTerminalEventsWithMissingRosterCoverage(
  tx: Prisma.TransactionClient,
  tenantId: string,
  travelPackageId: string,
  sources: Array<{ sourceId: string; sourceLineId: string }>,
  contractedParticipantIds: readonly string[],
): Promise<number> {
  const pairs = sources.map((source) => ({ sourceId: source.sourceId, sourceLineId: source.sourceLineId }));
  const [events, requirements] = await Promise.all([
    tx.operationsIntakeOutboxEvent.findMany({
      where: {
        tenantId,
        travelPackageId,
        eventType: OPERATIONS_SOURCE_ITEM_APPROVED_EVENT,
        sourceType: TRAVEL_PACKAGE_COST_COMPONENT_SOURCE,
        OR: pairs,
      },
      select: { id: true, sourceId: true, sourceLineId: true, status: true, lastError: true },
    }),
    tx.operationalRequirement.findMany({
      where: {
        tenantId,
        travelPackageId,
        scopeType: "TRAVEL_PACKAGE",
        sourceType: TRAVEL_PACKAGE_COST_COMPONENT_SOURCE,
        OR: pairs,
      },
      select: { id: true, sourceId: true, sourceLineId: true },
    }),
  ]);
  const requirementIds = requirements.map((requirement) => requirement.id);
  const assignments = requirementIds.length === 0 ? [] : await tx.operationalRequirementPassenger.findMany({
    where: { tenantId, travelPackageId, operationalRequirementId: { in: requirementIds } },
    select: { operationalRequirementId: true, travelPackageParticipantId: true },
  });
  const eventBySource = new Map(events.map((event) => [sourceKey(event.sourceId, event.sourceLineId), event]));
  const requirementBySource = new Map(
    requirements
      .filter((requirement): requirement is typeof requirement & { sourceId: string; sourceLineId: string } =>
        requirement.sourceId !== null && requirement.sourceLineId !== null,
      )
      .map((requirement) => [sourceKey(requirement.sourceId, requirement.sourceLineId), requirement]),
  );
  const assignedParticipantsByRequirementId = new Map<string, Set<string>>();
  for (const assignment of assignments) {
    const assigned = assignedParticipantsByRequirementId.get(assignment.operationalRequirementId) ?? new Set<string>();
    assigned.add(assignment.travelPackageParticipantId);
    assignedParticipantsByRequirementId.set(assignment.operationalRequirementId, assigned);
  }

  const eventIds = sources.flatMap((source) => {
    const event = eventBySource.get(sourceKey(source.sourceId, source.sourceLineId));
    const isLegacyRosterRetry = event?.status === "PENDING" && event.lastError?.startsWith("PARTICIPANT_NOT_FOUND");
    if (!event || (event.status !== "PROCESSED" && event.status !== "FAILED" && !isLegacyRosterRetry)) return [];
    const requirement = requirementBySource.get(sourceKey(source.sourceId, source.sourceLineId));
    const hasMissingAssignment = !requirement || contractedParticipantIds.some((participantId) =>
      !assignedParticipantsByRequirementId.get(requirement.id)?.has(participantId),
    );
    return hasMissingAssignment ? [event.id] : [];
  });
  if (eventIds.length === 0) return 0;

  const requeued = await tx.operationsIntakeOutboxEvent.updateMany({
    where: {
      id: { in: eventIds },
      tenantId,
      OR: [
        { status: { in: ["PROCESSED", "FAILED"] } },
        { status: "PENDING", lastError: { startsWith: "PARTICIPANT_NOT_FOUND" } },
      ],
    },
    data: {
      status: "PENDING",
      attemptCount: 0,
      availableAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      processedAt: null,
      lastAttemptAt: null,
      lastError: null,
    },
  });
  return requeued.count;
}

function sourceKey(sourceId: string, sourceLineId: string) {
  return `${sourceId}\u0000${sourceLineId}`;
}

function normalizeComponentIds(values: readonly string[]) {
  const ids = [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
  if (ids.length > MAX_COMPONENT_BATCH_SIZE) {
    throw new InternalServerErrorException("OPERATIONS_INTAKE_COMPONENT_BATCH_TOO_LARGE");
  }
  return ids;
}
