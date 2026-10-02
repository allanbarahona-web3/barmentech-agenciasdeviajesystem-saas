import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import type { OperationalAdditionalServiceContext, OperationalAdditionalServiceReader } from "./operational-additional-service-reader.port";
import { operationalAdditionalServicePresentation } from "./additional-service-operational-presentation";

const MAX_BATCH_SIZE = 25;

@Injectable()
export class AdditionalServiceOperationalContextAdapter implements OperationalAdditionalServiceReader {
  constructor(private readonly prisma: PrismaService) {}

  async readForClients(request: { tenantId: string; travelPackageId: string; clientIds: readonly string[] }) {
    const clientIds = normalizedIds(request.clientIds);
    if (clientIds.length === 0) return new Map<string, OperationalAdditionalServiceContext[]>();
    return runTenantTransaction<any, Map<string, OperationalAdditionalServiceContext[]>>(this.prisma as any, request.tenantId, async (tx) => {
      const rows = await tx.additionalServiceOrderParticipant.findMany({
        where: {
          tenantId: request.tenantId, clientId: { in: clientIds },
          line: { order: { tenantId: request.tenantId, travelPackageId: request.travelPackageId, commercialStatus: "APPROVED", status: { not: "CANCELLED" } } },
        },
        select: { clientId: true, line: { select: { id: true, serviceCode: true, serviceName: true, serviceDetailsVersion: true, serviceDetails: true, finalSellingPrice: true, quotationCurrency: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      const result = new Map(clientIds.map((clientId) => [clientId, [] as OperationalAdditionalServiceContext[]]));
      for (const row of rows) {
        if (!row.clientId) continue;
        result.get(row.clientId)?.push({ sourceRef: { type: "ADDITIONAL_SERVICE_ORDER_LINE", id: row.line.id, lineId: row.line.id, version: row.line.serviceDetailsVersion ?? null }, serviceCode: row.line.serviceCode, serviceName: row.line.serviceName, commercialStatus: "APPROVED", soldValue: { amount: String(row.line.finalSellingPrice), currency: String(row.line.quotationCurrency), scope: "EXACT_SERVICE_LINE" }, presentation: operationalAdditionalServicePresentation(row.line.serviceCode, row.line.serviceName, row.line.serviceDetails) });
      }
      return result;
    });
  }
}

function normalizedIds(input: readonly string[]) {
  if (!Array.isArray(input)) throw new BadRequestException("OPERATIONAL_ADDITIONAL_SERVICE_BATCH_INVALID");
  const ids = [...new Set(input.map((id) => String(id || "").trim()))];
  if (ids.some((id) => !id) || ids.length > MAX_BATCH_SIZE) throw new BadRequestException("OPERATIONAL_ADDITIONAL_SERVICE_BATCH_INVALID");
  return ids;
}
