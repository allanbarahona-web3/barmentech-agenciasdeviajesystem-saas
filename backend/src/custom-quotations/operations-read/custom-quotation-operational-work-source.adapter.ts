import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import { CUSTOM_QUOTATION_LINE_SOURCE } from "../../operations/intake/operations-intake-outbox.constants";
import {
  OperationalWorkMaterializationError,
  type OperationalWorkSourceItem,
  type OperationalWorkSourceReader,
  type OperationalWorkSourceReference,
} from "../../operations/intake/operational-work-source-reader.port";

export { CUSTOM_QUOTATION_LINE_SOURCE };

const SERVICE_PURPOSE_CODE = "CUSTOM_QUOTATION";
const SERVICE_PURPOSE_NAME = "Cotización personalizada";

/**
 * Operations-facing read adapter for an accepted immutable Custom Quotation
 * Version Line. TravelPackage association and event production deliberately
 * remain outside this source-authority boundary.
 */
@Injectable()
export class CustomQuotationOperationalWorkSourceAdapter implements OperationalWorkSourceReader {
  constructor(private readonly prisma: PrismaService) {}

  async readSourceItem(reference: OperationalWorkSourceReference): Promise<OperationalWorkSourceItem> {
    if (reference.sourceType !== CUSTOM_QUOTATION_LINE_SOURCE) {
      throw new OperationalWorkMaterializationError("SOURCE_NOT_FOUND", false, { sourceType: reference.sourceType });
    }
    if (reference.scopeType !== "STANDALONE_CUSTOMER") {
      throw new OperationalWorkMaterializationError("SOURCE_NOT_ELIGIBLE", false, { sourceType: reference.sourceType });
    }

    return runTenantTransaction<any, OperationalWorkSourceItem>(this.prisma as any, reference.tenantId, async (tx) => {
      const line = await tx.customQuotationVersionLine.findFirst({
        where: {
          id: reference.sourceLineId,
          tenantId: reference.tenantId,
          customQuotationVersionId: reference.sourceId,
        },
        select: {
          id: true,
          soldAmount: true,
          description: true,
          customQuotationVersion: {
            select: {
              id: true,
              status: true,
              currency: true,
              acceptedAt: true,
              customQuotation: {
                select: {
                  status: true,
                  customerId: true,
                },
              },
            },
          },
        },
      });
      if (!line) {
        throw new OperationalWorkMaterializationError("SOURCE_NOT_FOUND", false, {
          sourceId: reference.sourceId,
          sourceLineId: reference.sourceLineId,
        });
      }

      const version = line.customQuotationVersion;
      if (
        version.status !== "ACCEPTED"
        || version.customQuotation.status !== "ACCEPTED"
        || !version.acceptedAt
        || !version.customQuotation.customerId
        || line.soldAmount === null
        || line.soldAmount === undefined
        || !isDescription(line.description)
      ) {
        throw new OperationalWorkMaterializationError("SOURCE_NOT_ELIGIBLE", false, {
          sourceId: reference.sourceId,
          sourceLineId: reference.sourceLineId,
        });
      }

      return {
        ...reference,
        customerId: version.customQuotation.customerId,
        sourceVersionId: version.id,
        sourceReference: null,
        sourceAcceptedAt: version.acceptedAt,
        servicePurposeCode: SERVICE_PURPOSE_CODE,
        servicePurposeName: SERVICE_PURPOSE_NAME,
        description: line.description.trim(),
        sourceSnapshot: {
          customQuotationVersionId: version.id,
          customQuotationVersionLineId: line.id,
          description: line.description.trim(),
          soldAmount: String(line.soldAmount),
          currency: String(version.currency),
        },
        soldValueScope: "EXACT_SERVICE_LINE",
        soldValue: {
          scope: "EXACT_SERVICE_LINE",
          amount: String(line.soldAmount),
          currency: String(version.currency),
        },
      };
    });
  }
}

function isDescription(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}
