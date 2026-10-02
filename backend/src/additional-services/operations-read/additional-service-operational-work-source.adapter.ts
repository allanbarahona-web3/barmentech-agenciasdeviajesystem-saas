import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import {
  OperationalWorkMaterializationError,
  type OperationalWorkSourceItem,
  type OperationalWorkSourceReader,
  type OperationalWorkSourceReference,
} from "../../operations/intake/operational-work-source-reader.port";
import { ADDITIONAL_SERVICE_ORDER_LINE_SOURCE } from "../../operations/intake/operations-intake-outbox.constants";
import { operationalAdditionalServicePresentation } from "./additional-service-operational-presentation";

export const ADDITIONAL_SERVICE_ORDER_LINE_SOURCE_TYPE = ADDITIONAL_SERVICE_ORDER_LINE_SOURCE;

@Injectable()
export class AdditionalServiceOperationalWorkSourceAdapter implements OperationalWorkSourceReader {
  constructor(private readonly prisma: PrismaService) {}

  async readSourceItem(reference: OperationalWorkSourceReference): Promise<OperationalWorkSourceItem> {
    if (reference.sourceType !== ADDITIONAL_SERVICE_ORDER_LINE_SOURCE_TYPE) {
      throw new OperationalWorkMaterializationError("SOURCE_NOT_FOUND", false, { sourceType: reference.sourceType });
    }

    return runTenantTransaction<any, OperationalWorkSourceItem>(this.prisma as any, reference.tenantId, async (tx) => {
      const order = await tx.additionalServiceOrder.findFirst({
        where: {
          id: reference.sourceId,
          tenantId: reference.tenantId,
        },
        select: {
          id: true,
          travelPackageId: true,
          commercialStatus: true,
          status: true,
          proposalApprovedAt: true,
          lines: {
            where: { id: reference.sourceLineId, tenantId: reference.tenantId },
            select: {
              id: true,
              serviceCode: true,
              serviceName: true,
              serviceDetailsVersion: true,
              serviceDetails: true,
              finalSellingPrice: true,
              quotationCurrency: true,
              participants: { select: { clientId: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
            },
            take: 1,
          },
        },
      });
      if (!order) {
        throw new OperationalWorkMaterializationError("SOURCE_NOT_FOUND", true, {
          sourceId: reference.sourceId,
          sourceLineId: reference.sourceLineId,
        });
      }
      if (order.travelPackageId !== reference.travelPackageId) {
        throw new OperationalWorkMaterializationError("PACKAGE_MISMATCH", false, { sourceId: reference.sourceId });
      }
      if (order.commercialStatus !== "APPROVED" || order.status === "CANCELLED") {
        throw new OperationalWorkMaterializationError("SOURCE_NOT_ELIGIBLE", false, { sourceId: reference.sourceId });
      }
      const line = order.lines[0];
      if (!line) {
        throw new OperationalWorkMaterializationError("SOURCE_NOT_FOUND", false, {
          sourceId: reference.sourceId,
          sourceLineId: reference.sourceLineId,
        });
      }
      if (!order.proposalApprovedAt) {
        throw new OperationalWorkMaterializationError("SOURCE_NOT_ELIGIBLE", false, { sourceId: reference.sourceId });
      }
      const participantClientIds = new Set<string>();
      for (const participant of line.participants as Array<{ clientId: unknown }>) {
        if (typeof participant.clientId === "string" && participant.clientId.trim()) {
          participantClientIds.add(participant.clientId.trim());
        }
      }
      const clientIds = [...participantClientIds];
      if (clientIds.length !== line.participants.length) {
        throw new OperationalWorkMaterializationError("PARTICIPANT_NOT_FOUND", true, {
          sourceId: reference.sourceId,
          sourceLineId: reference.sourceLineId,
          participantCount: line.participants.length,
        });
      }
      const presentation = operationalAdditionalServicePresentation(line.serviceCode, line.serviceName, line.serviceDetails);
      return {
        ...reference,
        sourceVersionId: line.serviceDetailsVersion === null ? null : String(line.serviceDetailsVersion),
        sourceReference: null,
        sourceAcceptedAt: order.proposalApprovedAt,
        servicePurposeCode: line.serviceCode,
        servicePurposeName: line.serviceName,
        description: descriptionFromPresentation(line.serviceName, presentation),
        participantClientIds: clientIds,
        soldValue: {
          scope: "EXACT_SERVICE_LINE",
          amount: String(line.finalSellingPrice),
          currency: String(line.quotationCurrency),
        },
      };
    });
  }
}

function descriptionFromPresentation(
  serviceName: string,
  presentation: ReturnType<typeof operationalAdditionalServicePresentation>,
) {
  const parts = [presentation.subtitle, ...presentation.fields.slice(0, 2).map((field) => `${field.label}: ${field.value}`)]
    .filter((part): part is string => Boolean(part?.trim()));
  return (parts.join(" · ") || serviceName).slice(0, 4000);
}
