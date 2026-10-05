import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import type {
  OperationalPassengerNote,
  OperationalPassengerNoteReader,
  ReadOperationalPassengerNotesRequest,
} from "./operational-passenger-note-reader.port";
import type {
  OperationalPassengerContractContext,
  OperationalPassengerContractContextReader,
  ReadOperationalPassengerContractContextsRequest,
} from "./operational-passenger-contract-context-reader.port";
import type {
  ParticipantSourceReader,
  ParticipantSourceRef,
  ReadParticipantSourcesRequest,
} from "./participant-source-reader.port";

const MAX_PARTICIPANT_BATCH_SIZE = 25;

/**
 * Contract/Travel integration adapter. It exposes neutral participant sources
 * and normalized Contract-originated notes without leaking Contract internals.
 */
@Injectable()
export class ContractTravelOperationsReadAdapter
  implements ParticipantSourceReader, OperationalPassengerNoteReader, OperationalPassengerContractContextReader
{
  constructor(private readonly prisma: PrismaService) {}

  async readSourcesForParticipants(
    request: ReadParticipantSourcesRequest,
  ): Promise<Map<string, ParticipantSourceRef[]>> {
    const participantIds = normalizeParticipantIds(request.participantIds);
    if (participantIds.length === 0) return new Map();

    return runTenantTransaction<any, Map<string, ParticipantSourceRef[]>>(
      this.prisma as any,
      request.tenantId,
      async (tx: Prisma.TransactionClient) => {
        const sources = await tx.travelPackageParticipantContractSource.findMany({
          where: {
            tenantId: request.tenantId,
            travelPackageId: request.travelPackageId,
            travelPackageParticipantId: { in: participantIds },
          },
          select: {
            travelPackageParticipantId: true,
            contractId: true,
            sourceRole: true,
            createdAt: true,
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        const grouped = emptyGroups<ParticipantSourceRef>(participantIds);
        for (const source of sources) {
          grouped.get(source.travelPackageParticipantId)!.push({
            travelPackageParticipantId: source.travelPackageParticipantId,
            sourceType: "CONTRACT",
            sourceId: source.contractId,
            sourceRole: source.sourceRole,
            linkedAt: source.createdAt,
          });
        }
        return grouped;
      },
    );
  }

  async readNotesForParticipants(
    request: ReadOperationalPassengerNotesRequest,
  ): Promise<Map<string, OperationalPassengerNote[]>> {
    const participantIds = normalizeParticipantIds(request.participantIds);
    if (participantIds.length === 0) return new Map();

    return runTenantTransaction<any, Map<string, OperationalPassengerNote[]>>(
      this.prisma as any,
      request.tenantId,
      async (tx: Prisma.TransactionClient) => {
        const participants = await tx.travelPackageParticipant.findMany({
          where: {
            tenantId: request.tenantId,
            travelPackageId: request.travelPackageId,
            id: { in: participantIds },
          },
          select: { id: true, clientId: true },
        });
        const grouped = emptyGroups<OperationalPassengerNote>(participantIds);
        if (participants.length === 0) return grouped;

        const participantIdByClientId = new Map(
          participants.map((participant) => [participant.clientId, participant.id]),
        );
        const notes = await tx.contractNote.findMany({
          where: {
            tenantId: request.tenantId,
            travelPackageId: request.travelPackageId,
            clientId: { in: [...participantIdByClientId.keys()] },
            status: "ACTIVE",
          },
          select: {
            id: true,
            clientId: true,
            contractId: true,
            note: true,
            status: true,
            createdAt: true,
            archivedAt: true,
            createdByName: true,
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        for (const note of notes) {
          if (note.status !== "ACTIVE" || !note.clientId) continue;
          const travelPackageParticipantId = participantIdByClientId.get(note.clientId);
          if (!travelPackageParticipantId) continue;
          grouped.get(travelPackageParticipantId)!.push({
            id: note.id,
            travelPackageParticipantId,
            text: note.note,
            status: "ACTIVE",
            createdAt: note.createdAt,
            archivedAt: note.archivedAt,
            sourceType: "CONTRACT",
            authorName: note.createdByName,
            source: { type: "CONTRACT_NOTE", sourceId: note.contractId },
          });
        }
        return grouped;
      },
    );
  }

  async readContractContextsForParticipants(
    request: ReadOperationalPassengerContractContextsRequest,
  ): Promise<Map<string, OperationalPassengerContractContext[]>> {
    const participantIds = normalizeParticipantIds(request.participantIds);
    if (participantIds.length === 0) return new Map();
    return runTenantTransaction<any, Map<string, OperationalPassengerContractContext[]>>(
      this.prisma as any,
      request.tenantId,
      async (tx: Prisma.TransactionClient) => {
        const sources = await tx.travelPackageParticipantContractSource.findMany({
          where: {
            tenantId: request.tenantId,
            travelPackageId: request.travelPackageId,
            travelPackageParticipantId: { in: participantIds },
          },
          select: {
            travelPackageParticipantId: true,
            sourceRole: true,
            travelPackageParticipant: { select: { clientId: true } },
            contract: {
              select: {
                id: true,
                contractNumber: true,
                commercialTotal: true,
                commercialCurrency: true,
                commercialSnapshot: {
                  select: {
                    perPersonSellingPrice: true,
                    commercialTotal: true,
                    currency: true,
                    frozenAt: true,
                  },
                },
              },
            },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        const grouped = emptyGroups<OperationalPassengerContractContext>(participantIds);
        for (const source of sources) {
          const snapshot = source.contract.commercialSnapshot;
          grouped.get(source.travelPackageParticipantId)!.push({
            travelPackageParticipantId: source.travelPackageParticipantId,
            clientId: source.travelPackageParticipant.clientId,
            contractId: source.contract.id,
            contractNumber: source.contract.contractNumber,
            sourceRole: source.sourceRole,
            commercial: snapshot
              ? {
                snapshotAvailable: true,
                perPersonSellingPrice: decimalString(snapshot.perPersonSellingPrice),
                commercialTotal: decimalString(snapshot.commercialTotal),
                currency: snapshot.currency,
                frozenAt: snapshot.frozenAt,
              }
              : {
                snapshotAvailable: false,
                perPersonSellingPrice: null,
                commercialTotal: decimalStringOrNull(source.contract.commercialTotal),
                currency: source.contract.commercialCurrency,
                frozenAt: null,
              },
            responsibleAdult: null,
          });
        }
        return grouped;
      },
    );
  }
}

function normalizeParticipantIds(participantIds: readonly string[]): string[] {
  if (!Array.isArray(participantIds)) {
    throw new BadRequestException("PARTICIPANT_READ_BATCH_INVALID");
  }
  const ids = participantIds.map((participantId) => String(participantId || "").trim());
  if (ids.some((participantId) => !participantId)) {
    throw new BadRequestException("PARTICIPANT_READ_BATCH_INVALID");
  }
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length > MAX_PARTICIPANT_BATCH_SIZE) {
    throw new BadRequestException("PARTICIPANT_READ_BATCH_TOO_LARGE");
  }
  return uniqueIds;
}

function emptyGroups<T>(participantIds: readonly string[]): Map<string, T[]> {
  return new Map(participantIds.map((participantId) => [participantId, []]));
}

function decimalString(value: { toString(): string }): string {
  return value.toString();
}

function decimalStringOrNull(value: { toString(): string } | null): string | null {
  return value ? decimalString(value) : null;
}
