import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  OPERATIONS_SOURCE_ITEM_APPROVED_EVENT,
  TRAVEL_PACKAGE_COST_COMPONENT_SOURCE,
} from "../operations/intake/operations-intake-outbox.constants";
import { persistOperationsIntakeOutboxEvents } from "../operations/intake/operations-intake-outbox-writer";

const MAX_COMPONENT_BATCH_SIZE = 25;

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
}

function normalizeComponentIds(values: readonly string[]) {
  const ids = [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
  if (ids.length > MAX_COMPONENT_BATCH_SIZE) {
    throw new InternalServerErrorException("OPERATIONS_INTAKE_COMPONENT_BATCH_TOO_LARGE");
  }
  return ids;
}
