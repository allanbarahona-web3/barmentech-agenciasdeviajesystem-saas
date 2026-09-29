import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  resolveContractParticipation,
  resolveContractParticipationByTuple,
} from '../contract-participation';
import { runTenantTransaction } from '../../tenant/tenant-transaction';
import {
  TravelContextDto,
  TravelContextType,
} from '../../travel-context/dto/travel-context.dto';

type Transaction = Prisma.TransactionClient;

type NoteContract = {
  id: string;
  clientId: string;
  travelPackageId: string | null;
  payload: unknown;
  client: { fullName: string };
};

@Injectable()
export class ContractNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async createContractNote(
    tenantId: string,
    contractId: string,
    passengerType: 'HOLDER' | 'COMPANION' | 'MINOR',
    passengerIndex: number | null,
    _passengerName: string,
    note: string,
    createdByUserId: string,
    createdByName: string,
  ) {
    return this.inTenantTransaction(tenantId, async (tx) => {
      const contract = await this.loadNoteContract(tx, tenantId, contractId);
      const passenger = this.resolveNotePassenger(contract, passengerType, passengerIndex);
      return tx.contractNote.create({
        data: {
          contractId: contract.id,
          tenantId,
          clientId: passenger.clientId,
          travelPackageId: contract.travelPackageId,
          passengerType: passenger.role,
          passengerIndex: passenger.passengerIndex,
          passengerName: passenger.passengerName,
          note,
          status: 'ACTIVE',
          createdByUserId,
          createdByName,
        },
      });
    });
  }

  async createContractNoteForCustomer(
    tenantId: string,
    contractId: string,
    customerId: string,
    note: string,
    createdByUserId: string,
    createdByName: string,
  ) {
    return this.inTenantTransaction(tenantId, async (tx) => {
      const contract = await this.loadNoteContract(tx, tenantId, contractId);
      const participation = resolveContractParticipation(contract, customerId);
      if (!participation) {
        throw new ForbiddenException(
          'El cliente no participa en este contrato. No se puede crear una nota operativa.',
        );
      }
      const passenger = this.resolveNotePassenger(
        contract,
        participation.role,
        participation.passengerIndex,
      );
      return tx.contractNote.create({
        data: {
          contractId: contract.id,
          tenantId,
          clientId: passenger.clientId,
          travelPackageId: contract.travelPackageId,
          passengerType: passenger.role,
          passengerIndex: passenger.passengerIndex,
          passengerName: passenger.passengerName,
          note,
          status: 'ACTIVE',
          createdByUserId,
          createdByName,
        },
      });
    });
  }

  async listContractNotes(tenantId: string, contractId: string, includeArchived = false) {
    return this.inTenantTransaction(tenantId, async (tx) => {
      await this.validateContract(tx, tenantId, contractId);
      const where: Prisma.ContractNoteWhereInput = { tenantId, contractId };
      if (!includeArchived) where.status = 'ACTIVE';
      return tx.contractNote.findMany({ where, orderBy: { createdAt: 'desc' } });
    });
  }

  async listCustomerOperationalNotes(tenantId: string, customerId: string) {
    return this.inTenantTransaction(tenantId, async (tx) => {
      const contracts = await tx.contract.findMany({
        where: { tenantId },
        select: {
          id: true,
          clientId: true,
          contractNumber: true,
          destination: true,
          startDate: true,
          endDate: true,
          payload: true,
        },
      });
      const legacyFilters = contracts.flatMap((contract) => {
        const participation = resolveContractParticipation(contract, customerId);
        return participation
          ? [{
              contractId: contract.id,
              passengerType: participation.role,
              passengerIndex: participation.passengerIndex,
              clientId: null,
            }]
          : [];
      });
      return tx.contractNote.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
          OR: [{ clientId: customerId }, ...legacyFilters],
        },
        include: {
          contract: {
            select: {
              contractNumber: true,
              destination: true,
              startDate: true,
              endDate: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async enrichTravelContext(
    tenantId: string,
    context: TravelContextDto,
    selectedClientId?: string,
  ): Promise<TravelContextDto> {
    return this.inTenantTransaction(tenantId, async (tx) => {
      let internalTripId: string | null = null;
      if (context.travelType === TravelContextType.INTERNAL) {
        const booking = await tx.internalTourBooking.findFirst({
          where: { id: context.travelId, tenantId },
          select: { internalTripId: true },
        });
        internalTripId = booking?.internalTripId ?? null;
      }
      const contracts = await tx.contract.findMany({
        where: { tenantId },
        select: {
          id: true,
          clientId: true,
          contractNumber: true,
          travelPackageId: true,
          internalTripId: true,
          payload: true,
          createdAt: true,
          notes: {
            where: { status: 'ACTIVE' },
            select: {
              clientId: true,
              passengerType: true,
              passengerIndex: true,
              note: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      const travelContracts = contracts.filter((contract) =>
        this.contractMatchesTravel(contract, context.travelType, context.travelId, internalTripId),
      );
      const selectedContract = selectedClientId
        ? travelContracts.find((contract) => resolveContractParticipation(contract, selectedClientId) !== null)
        : undefined;
      return {
        ...context,
        contractNumber: selectedContract?.contractNumber ?? null,
        participants: context.participants.map((participant) => {
          const participantContract = travelContracts.find(
            (contract) => resolveContractParticipation(contract, participant.clientId) !== null,
          );
          if (!participantContract) return { ...participant, operationalNotes: [] };
          const participation = resolveContractParticipation(participantContract, participant.clientId);
          if (!participation) return { ...participant, operationalNotes: [] };
          return {
            ...participant,
            operationalNotes: participantContract.notes
              .filter((note) =>
                note.clientId === participant.clientId ||
                (note.clientId === null &&
                  note.passengerType === participation.role &&
                  (note.passengerIndex ?? null) === participation.passengerIndex),
              )
              .map((note) => note.note),
          };
        }),
      };
    });
  }

  async getContractNote(tenantId: string, contractId: string, noteId: string) {
    return this.inTenantTransaction(tenantId, async (tx) => {
      const note = await tx.contractNote.findFirst({ where: { id: noteId, tenantId, contractId } });
      if (!note) throw new NotFoundException('Nota no encontrada');
      return note;
    });
  }

  async updateContractNote(
    tenantId: string,
    contractId: string,
    noteId: string,
    noteText: string,
  ) {
    return this.inTenantTransaction(tenantId, async (tx) => {
      const existingNote = await tx.contractNote.findFirst({
        where: { id: noteId, tenantId, contractId },
      });
      if (!existingNote) throw new NotFoundException('Nota no encontrada');
      if (existingNote.status === 'ARCHIVED') {
        throw new ForbiddenException('No se pueden editar notas archivadas');
      }
      return tx.contractNote.update({ where: { id: noteId }, data: { note: noteText } });
    });
  }

  async deleteContractNote(tenantId: string, contractId: string, noteId: string) {
    return this.inTenantTransaction(tenantId, async (tx) => {
      const note = await tx.contractNote.findFirst({ where: { id: noteId, tenantId, contractId } });
      if (!note) throw new NotFoundException('Nota no encontrada');
      await tx.contractNote.delete({ where: { id: noteId } });
      return { message: 'Nota eliminada correctamente' };
    });
  }

  async archiveExpiredNotes(tenantId: string) {
    return this.inTenantTransaction(tenantId, async (tx) => {
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      oneDayAgo.setHours(0, 0, 0, 0);
      const expiredContracts = await tx.contract.findMany({
        where: { tenantId, endDate: { lt: oneDayAgo } },
        select: { id: true },
      });
      const contractIds = expiredContracts.map((contract) => contract.id);
      if (contractIds.length === 0) return { archived: 0 };
      const result = await tx.contractNote.updateMany({
        where: { tenantId, contractId: { in: contractIds }, status: 'ACTIVE' },
        data: { status: 'ARCHIVED', archivedAt: new Date() },
      });
      return { archived: result.count };
    });
  }

  private async validateContract(tx: Transaction, tenantId: string, contractId: string) {
    const contract = await tx.contract.findFirst({ where: { id: contractId, tenantId } });
    if (!contract) throw new NotFoundException('Contrato no encontrado');
    return contract;
  }

  private async loadNoteContract(tx: Transaction, tenantId: string, contractId: string): Promise<NoteContract> {
    const contract = await tx.contract.findFirst({
      where: { id: contractId, tenantId },
      select: {
        id: true,
        clientId: true,
        travelPackageId: true,
        payload: true,
        client: { select: { fullName: true } },
      },
    });
    if (!contract) throw new NotFoundException('Contrato no encontrado');
    return contract;
  }

  private resolveNotePassenger(
    contract: NoteContract,
    passengerType: unknown,
    passengerIndex: unknown,
  ): { clientId: string; role: string; passengerIndex: number | null; passengerName: string } {
    const resolved = resolveContractParticipationByTuple(contract, passengerType, passengerIndex);
    if (!resolved) throw new BadRequestException('CONTRACT_NOTE_PARTICIPANT_INVALID');
    const passengerName = resolved.participation.role === 'HOLDER'
      ? String(contract.client.fullName || '').trim()
      : String(
          resolved.participation.passenger?.fullName ??
          resolved.participation.passenger?.minorName ??
          resolved.participation.passenger?.name ??
          '',
        ).trim();
    if (!passengerName) throw new BadRequestException('CONTRACT_NOTE_PARTICIPANT_INVALID');
    return {
      clientId: resolved.clientId,
      role: resolved.participation.role,
      passengerIndex: resolved.participation.passengerIndex,
      passengerName,
    };
  }

  private contractMatchesTravel(
    contract: { travelPackageId: string | null; internalTripId: string | null; payload: unknown },
    travelType: TravelContextType,
    travelId: string,
    internalTripId: string | null,
  ): boolean {
    const payload = contract.payload && typeof contract.payload === 'object' && !Array.isArray(contract.payload)
      ? contract.payload as Record<string, unknown>
      : {};
    if (travelType === TravelContextType.INTERNATIONAL) {
      return contract.travelPackageId === travelId || String(payload.travelPackageId ?? '').trim() === travelId;
    }
    return Boolean(internalTripId) && (
      contract.internalTripId === internalTripId || String(payload.internalTripId ?? '').trim() === internalTripId
    );
  }

  private inTenantTransaction<TResult>(
    tenantId: string,
    work: (tx: Transaction) => Promise<TResult>,
  ): Promise<TResult> {
    return runTenantTransaction<any, TResult>(this.prisma as any, tenantId, work);
  }
}
