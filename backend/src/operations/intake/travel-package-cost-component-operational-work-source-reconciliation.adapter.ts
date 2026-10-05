import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import { TRAVEL_PACKAGE_COST_COMPONENT_SOURCE } from "./operations-intake-outbox.constants";
import type { OperationalWorkSourceItem, OperationalWorkSourceReference } from "./operational-work-source-reader.port";
import { travelPackageCostComponentSourceItem } from "./travel-package-cost-component-operational-work-source.adapter";

export const TRAVEL_PACKAGE_COST_COMPONENT_RECONCILIATION_READER = Symbol("TRAVEL_PACKAGE_COST_COMPONENT_RECONCILIATION_READER");

export type TravelPackageCostComponentReconciliationState = "VALID" | "SOURCE_INACTIVE" | "SOURCE_NOT_ELIGIBLE";
export type TravelPackageCostComponentReconciliationSource = {
  reference: OperationalWorkSourceReference;
  state: TravelPackageCostComponentReconciliationState;
  item: OperationalWorkSourceItem | null;
};

@Injectable()
export class TravelPackageCostComponentOperationalWorkSourceReconciliationAdapter {
  constructor(private readonly prisma: PrismaService) {}

  async scanSources(request: { tenantId: string; travelPackageId?: string; cursor?: string; limit: number }) {
    return runTenantTransaction<any, { sources: TravelPackageCostComponentReconciliationSource[]; nextCursor: string | null }>(
      this.prisma as any,
      request.tenantId,
      async (tx) => {
        const rows = await tx.costComponent.findMany({
          where: {
            tenantId: request.tenantId,
            ...(request.cursor ? { id: { gt: request.cursor } } : {}),
            costingProject: {
              travelPackageLinks: {
                some: {
                  tenantId: request.tenantId,
                  ...(request.travelPackageId ? { travelPackageId: request.travelPackageId } : {}),
                },
              },
            },
          },
          select: componentSelect(request),
          orderBy: { id: "asc" },
          take: request.limit + 1,
        });
        const page = rows.slice(0, request.limit);
        return {
          sources: page.map((row: any) => sourceFromRow(request.tenantId, row)),
          nextCursor: rows.length > request.limit ? page.at(-1)?.id ?? null : null,
        };
      },
    );
  }
}

function componentSelect(request: { tenantId: string; travelPackageId?: string }) {
  return {
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
    costingProject: {
      select: {
        baseCurrency: true,
        travelPackageLinks: {
          where: {
            tenantId: request.tenantId,
            ...(request.travelPackageId ? { travelPackageId: request.travelPackageId } : {}),
          },
          select: { travelPackageId: true },
          take: 1,
        },
      },
    },
  } as const;
}

function sourceFromRow(tenantId: string, row: any): TravelPackageCostComponentReconciliationSource {
  const travelPackageId = row.costingProject.travelPackageLinks[0]?.travelPackageId;
  const reference = {
    tenantId,
    travelPackageId: travelPackageId ?? "",
    sourceType: TRAVEL_PACKAGE_COST_COMPONENT_SOURCE,
    sourceId: row.costingProjectId,
    sourceLineId: row.id,
  };
  if (row.status !== "ACTIVE") return { reference, state: "SOURCE_INACTIVE", item: null };
  if (!travelPackageId || !row.currentSnapshotId || !row.currentSnapshot || row.currentSnapshot.currency !== row.costingProject.baseCurrency) {
    return { reference, state: "SOURCE_NOT_ELIGIBLE", item: null };
  }
  return { reference, state: "VALID", item: travelPackageCostComponentSourceItem(reference, row) };
}
