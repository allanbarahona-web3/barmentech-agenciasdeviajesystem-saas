import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import type {
  ContractedTravelPackageParticipant,
  ContractedTravelPackageRosterPage,
  ContractedTravelPackageRosterReader,
  ReadContractedTravelPackageRosterRequest,
  ReadContractedTravelPackageRostersRequest,
} from "./contracted-travel-package-roster-reader.port";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 25;

@Injectable()
export class PrismaContractedTravelPackageRosterReader
  implements ContractedTravelPackageRosterReader
{
  constructor(private readonly prisma: PrismaService) {}

  async readContractedRoster(
    request: ReadContractedTravelPackageRosterRequest,
  ): Promise<ContractedTravelPackageRosterPage> {
    const limit = normalizeLimit(request.limit);
    return runTenantTransaction<any, ContractedTravelPackageRosterPage>(
      this.prisma as any,
      request.tenantId,
      async (tx) => {
        const rows = await tx.travelPackageParticipant.findMany({
          where: {
            tenantId: request.tenantId,
            travelPackageId: request.travelPackageId,
            ...(request.cursor ? { id: { gt: request.cursor } } : {}),
            contractSources: {
              some: {
                tenantId: request.tenantId,
                travelPackageId: request.travelPackageId,
              },
            },
          },
          select: { id: true, clientId: true },
          orderBy: { id: "asc" },
          take: limit + 1,
        });
        const participants = rows.slice(0, limit);
        return {
          participants,
          nextCursor: rows.length > limit ? participants.at(-1)?.id ?? null : null,
        };
      },
    );
  }

  async readContractedRosters(
    request: ReadContractedTravelPackageRostersRequest,
  ): Promise<Map<string, ContractedTravelPackageParticipant[]>> {
    const travelPackageIds = [...new Set(request.travelPackageIds)];
    if (travelPackageIds.length > MAX_PAGE_SIZE) {
      throw new BadRequestException("OPERATIONAL_CONTRACTED_ROSTER_BATCH_LIMIT_INVALID");
    }
    const result = new Map<string, ContractedTravelPackageParticipant[]>(
      travelPackageIds.map((travelPackageId) => [travelPackageId, []]),
    );
    if (travelPackageIds.length === 0) return result;
    const rows = await runTenantTransaction<any, Array<ContractedTravelPackageParticipant & { travelPackageId: string }>>(
      this.prisma as any,
      request.tenantId,
      (tx) => tx.travelPackageParticipant.findMany({
        where: {
          tenantId: request.tenantId,
          travelPackageId: { in: travelPackageIds },
          contractSources: {
            some: {
              tenantId: request.tenantId,
              travelPackageId: { in: travelPackageIds },
            },
          },
        },
        select: { id: true, clientId: true, travelPackageId: true },
        orderBy: [{ travelPackageId: "asc" }, { id: "asc" }],
      }),
    );
    for (const row of rows) result.get(row.travelPackageId)?.push({ id: row.id, clientId: row.clientId });
    return result;
  }
}

function normalizeLimit(value: number | undefined) {
  if (value === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
    throw new BadRequestException("OPERATIONAL_CONTRACTED_ROSTER_LIMIT_INVALID");
  }
  return value;
}
