import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import { TRAVEL_PACKAGE_COST_COMPONENT_SOURCE } from "./operations-intake-outbox.constants";
import {
  OperationalWorkMaterializationError,
  type OperationalWorkSourceItem,
  type OperationalWorkSourceReader,
  type OperationalWorkSourceReference,
} from "./operational-work-source-reader.port";

export const TRAVEL_PACKAGE_COST_COMPONENT_SOURCE_TYPE = TRAVEL_PACKAGE_COST_COMPONENT_SOURCE;

/**
 * Operations-facing TravelPackage/Cost Engine integration read. It only
 * projects current descriptive context; Cost Engine keeps cost authority.
 */
@Injectable()
export class TravelPackageCostComponentOperationalWorkSourceAdapter
  implements OperationalWorkSourceReader
{
  constructor(private readonly prisma: PrismaService) {}

  async readSourceItem(
    reference: OperationalWorkSourceReference,
  ): Promise<OperationalWorkSourceItem> {
    if (reference.sourceType !== TRAVEL_PACKAGE_COST_COMPONENT_SOURCE_TYPE) {
      throw new OperationalWorkMaterializationError("SOURCE_NOT_FOUND", false, {
        sourceType: reference.sourceType,
      });
    }

    return runTenantTransaction<any, OperationalWorkSourceItem>(
      this.prisma as any,
      reference.tenantId,
      async (tx) => {
        const travelPackage = await tx.travelPackage.findFirst({
          where: { id: reference.travelPackageId, tenantId: reference.tenantId },
          select: {
            id: true,
            costingProjectLinks: {
              where: {
                tenantId: reference.tenantId,
                costingProjectId: reference.sourceId,
              },
              select: { costingProjectId: true },
              take: 1,
            },
          },
        });
        if (!travelPackage) {
          throw new OperationalWorkMaterializationError("SOURCE_NOT_FOUND", true, {
            travelPackageId: reference.travelPackageId,
          });
        }
        if (travelPackage.costingProjectLinks.length !== 1) {
          throw new OperationalWorkMaterializationError("PACKAGE_MISMATCH", false, {
            travelPackageId: reference.travelPackageId,
            costingProjectId: reference.sourceId,
          });
        }

        const component = await tx.costComponent.findFirst({
          where: {
            id: reference.sourceLineId,
            tenantId: reference.tenantId,
            costingProjectId: reference.sourceId,
          },
          select: {
            id: true,
            costingProjectId: true,
            title: true,
            description: true,
            detailPayload: true,
            detailSchemaVersion: true,
            quantity: true,
            unit: true,
            status: true,
            currentSnapshotId: true,
            costCategory: { select: { code: true, displayName: true } },
            costSupplier: { select: { id: true, name: true } },
            currentSnapshot: { select: { id: true, amount: true, currency: true } },
          },
        });
        if (!component) {
          throw new OperationalWorkMaterializationError("SOURCE_NOT_FOUND", false, {
            costingProjectId: reference.sourceId,
            costComponentId: reference.sourceLineId,
          });
        }
        if (component.status !== "ACTIVE") {
          throw new OperationalWorkMaterializationError("SOURCE_NOT_ELIGIBLE", false, {
            costComponentId: component.id,
            status: component.status,
          });
        }
        if (!component.currentSnapshotId || !component.currentSnapshot) {
          throw new OperationalWorkMaterializationError("SOURCE_NOT_ELIGIBLE", false, {
            costComponentId: component.id,
            reason: "CURRENT_COST_SNAPSHOT_REQUIRED",
          });
        }

        const project = await tx.costingProject.findFirst({
          where: { id: reference.sourceId, tenantId: reference.tenantId },
          select: { id: true, baseCurrency: true },
        });
        if (!project) {
          throw new OperationalWorkMaterializationError("SOURCE_NOT_FOUND", false, {
            costingProjectId: reference.sourceId,
          });
        }
        if (component.currentSnapshot.currency !== project.baseCurrency) {
          throw new OperationalWorkMaterializationError("SOURCE_NOT_ELIGIBLE", false, {
            costComponentId: component.id,
            reason: "CURRENT_COST_SNAPSHOT_CURRENCY_MISMATCH",
          });
        }

        return travelPackageCostComponentSourceItem(reference, component);
      },
    );
  }
}

/** Shared by bounded reconciliation reads; adapters remain the snapshot-shape owner. */
export function travelPackageCostComponentSourceItem(
  reference: OperationalWorkSourceReference,
  component: any,
): OperationalWorkSourceItem {
  return {
    ...reference,
    sourceVersionId: component.currentSnapshot.id,
    sourceReference: null,
    sourceAcceptedAt: null,
    servicePurposeCode: component.costCategory.code,
    servicePurposeName: component.costCategory.displayName,
    description: sourceDescription(component.title, component.description),
    // Base applicability is deliberately resolved later from stable
    // TravelPackageParticipant IDs, not client/name matching.
    participantClientIds: [],
    participantScope: "ALL_CONTRACTED_TRAVEL_PACKAGE_PARTICIPANTS",
    sourceSnapshot: {
      travelPackageId: reference.travelPackageId,
      costingProjectId: component.costingProjectId,
      costComponentId: component.id,
      category: component.costCategory,
      title: component.title,
      description: component.description,
      structuredDetails: component.detailPayload,
      detailSchemaVersion: component.detailSchemaVersion,
      quantity: component.quantity === null ? null : String(component.quantity),
      unit: component.unit,
      supplier: component.costSupplier,
      currentCostSnapshotId: component.currentSnapshot.id,
      currentInternalCost: {
        amount: String(component.currentSnapshot.amount),
        currency: component.currentSnapshot.currency,
      },
    },
    soldValueScope: "NONE",
    soldValue: null,
  };
}

function sourceDescription(title: string, description: string | null) {
  return [title, description]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" · ")
    .slice(0, 4000);
}
