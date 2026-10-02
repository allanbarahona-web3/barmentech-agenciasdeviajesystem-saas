import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import { ADDITIONAL_SERVICE_ORDER_LINE_SOURCE } from "../../operations/intake/operations-intake-outbox.constants";
import {
  operationalWorkSourceIdentityKey,
  type OperationalWorkSourceInspection,
  type OperationalWorkSourceReconciliationReader,
  type OperationalWorkSourceScanRequest,
} from "../../operations/intake/operational-work-source-reconciliation.port";
import type { OperationalWorkSourceItem, OperationalWorkSourceReference } from "../../operations/intake/operational-work-source-reader.port";
import { operationalAdditionalServicePresentation } from "./additional-service-operational-presentation";

@Injectable()
export class AdditionalServiceOperationalWorkSourceReconciliationAdapter implements OperationalWorkSourceReconciliationReader {
  constructor(private readonly prisma: PrismaService) {}

  async scanApprovedSourceItems(request: OperationalWorkSourceScanRequest) {
    return runTenantTransaction<any, { items: OperationalWorkSourceItem[]; nextCursor: string | null }>(this.prisma as any, request.tenantId, async (tx) => {
      const rows = await tx.additionalServiceOrderLine.findMany({
        where: {
          tenantId: request.tenantId,
          ...(request.cursor ? { id: { gt: request.cursor } } : {}),
          order: {
            tenantId: request.tenantId,
            travelPackageId: request.travelPackageId ?? { not: null },
            commercialStatus: "APPROVED",
            proposalApprovedAt: { not: null },
            status: { not: "CANCELLED" },
          },
        },
        select: lineSelect(),
        orderBy: { id: "asc" },
        take: request.limit + 1,
      });
      const page = rows.slice(0, request.limit);
      return {
        items: page.map((line: any) => sourceItem(line)),
        nextCursor: rows.length > request.limit ? page.at(-1)?.id ?? null : null,
      };
    });
  }

  async inspectSourceItems(request: { tenantId: string; references: readonly OperationalWorkSourceReference[] }) {
    const references = request.references.filter((reference) => reference.sourceType === ADDITIONAL_SERVICE_ORDER_LINE_SOURCE);
    if (references.length === 0) return new Map<string, OperationalWorkSourceInspection>();
    return runTenantTransaction<any, Map<string, OperationalWorkSourceInspection>>(this.prisma as any, request.tenantId, async (tx) => {
      const lines = await tx.additionalServiceOrderLine.findMany({
        where: { tenantId: request.tenantId, id: { in: [...new Set(references.map((reference) => reference.sourceLineId))] } },
        select: lineSelect(),
      });
      const linesById = new Map(lines.map((line: any) => [line.id, line]));
      const result = new Map<string, OperationalWorkSourceInspection>();
      for (const reference of references) {
        const line = linesById.get(reference.sourceLineId) as any;
        const key = operationalWorkSourceIdentityKey(reference);
        if (!line) {
          result.set(key, { reference, state: "SOURCE_MISSING", item: null });
        } else if (line.order.id !== reference.sourceId) {
          result.set(key, { reference, state: "SOURCE_IDENTITY_CONFLICT", item: null });
        } else if (line.order.travelPackageId !== reference.travelPackageId) {
          result.set(key, { reference, state: "PACKAGE_MISMATCH", item: null });
        } else if (line.order.status === "CANCELLED") {
          result.set(key, { reference, state: "SOURCE_CANCELLED", item: null });
        } else if (line.order.commercialStatus !== "APPROVED" || !line.order.proposalApprovedAt) {
          result.set(key, { reference, state: "SOURCE_NOT_ELIGIBLE", item: null });
        } else {
          result.set(key, { reference, state: "VALID", item: sourceItem(line) });
        }
      }
      return result;
    });
  }
}

function lineSelect() {
  return {
    tenantId: true,
    id: true,
    serviceCode: true,
    serviceName: true,
    serviceDetailsVersion: true,
    serviceDetails: true,
    finalSellingPrice: true,
    quotationCurrency: true,
    participants: { select: { clientId: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    order: { select: { id: true, travelPackageId: true, commercialStatus: true, status: true, proposalApprovedAt: true } },
  } as const;
}

function sourceItem(line: any): OperationalWorkSourceItem {
  const presentation = operationalAdditionalServicePresentation(line.serviceCode, line.serviceName, line.serviceDetails);
  const participantClientIds = [...new Set(
    line.participants
      .map((participant: { clientId: unknown }) => typeof participant.clientId === "string" ? participant.clientId.trim() : "")
      .filter(Boolean),
  )] as string[];
  return {
    tenantId: line.tenantId,
    travelPackageId: line.order.travelPackageId,
    sourceType: ADDITIONAL_SERVICE_ORDER_LINE_SOURCE,
    sourceId: line.order.id,
    sourceLineId: line.id,
    sourceVersionId: line.serviceDetailsVersion === null ? null : String(line.serviceDetailsVersion),
    sourceReference: null,
    sourceAcceptedAt: line.order.proposalApprovedAt,
    servicePurposeCode: line.serviceCode,
    servicePurposeName: line.serviceName,
    description: descriptionFromPresentation(line.serviceName, presentation),
    participantClientIds,
    soldValue: { scope: "EXACT_SERVICE_LINE", amount: String(line.finalSellingPrice), currency: String(line.quotationCurrency) },
  };
}

function descriptionFromPresentation(serviceName: string, presentation: ReturnType<typeof operationalAdditionalServicePresentation>) {
  const parts = [presentation.subtitle, ...presentation.fields.slice(0, 2).map((field) => `${field.label}: ${field.value}`)]
    .filter((part): part is string => Boolean(part?.trim()));
  return (parts.join(" · ") || serviceName).slice(0, 4000);
}
