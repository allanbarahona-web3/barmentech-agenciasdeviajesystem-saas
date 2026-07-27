import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveContractParticipation } from '../contract-participation';
import {
  TravelContextDto,
  TravelContextType,
} from '../../travel-context/dto/travel-context.dto';

@Injectable()
export class ContractNotesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new note for a contract passenger
   */
  async createContractNote(
    tenantId: string,
    contractId: string,
    passengerType: 'HOLDER' | 'COMPANION' | 'MINOR',
    passengerIndex: number | null,
    passengerName: string,
    note: string,
    createdByUserId: string,
    createdByName: string,
  ) {
    // Verify contract exists and belongs to tenant
    await this.validateContract(tenantId, contractId);

    const contractNote = await this.prisma.contractNote.create({
      data: {
        contractId,
        tenantId,
        passengerType,
        passengerIndex,
        passengerName,
        note,
        status: 'ACTIVE',
        createdByUserId,
        createdByName,
      },
    });

    return contractNote;
  }

  /**
   * Create a note for a customer's participation in a contract
   * Automatically resolves passenger identity from customer-contract participation
   */
  async createContractNoteForCustomer(
    tenantId: string,
    contractId: string,
    customerId: string,
    note: string,
    createdByUserId: string,
    createdByName: string,
  ) {
    // Verify contract exists and belongs to tenant
    await this.validateContract(tenantId, contractId);

    // Fetch the contract to resolve participation
    const contract = await this.prisma.contract.findFirst({
      where: {
        id: contractId,
        tenantId,
      },
      select: {
        clientId: true,
        payload: true,
        client: {
          select: {
            fullName: true,
          },
        },
      },
    });

    if (!contract) {
      throw new NotFoundException('Contrato no encontrado');
    }

    const participation = resolveContractParticipation(contract, customerId);
    if (!participation) {
      throw new ForbiddenException(
        'El cliente no participa en este contrato. No se puede crear una nota operativa.',
      );
    }
    const passenger = participation.passenger;
    const passengerName =
      participation.role === 'HOLDER'
        ? contract.client.fullName
        : String(
            passenger?.fullName ??
              passenger?.minorName ??
              passenger?.name ??
              '',
          ).trim();

    // Create the note with resolved passenger identity
    const contractNote = await this.prisma.contractNote.create({
      data: {
        contractId,
        tenantId,
        passengerType: participation.role,
        passengerIndex: participation.passengerIndex,
        passengerName,
        note,
        status: 'ACTIVE',
        createdByUserId,
        createdByName,
      },
    });

    return contractNote;
  }

  /**
   * List all active notes for a contract
   */
  async listContractNotes(tenantId: string, contractId: string, includeArchived = false) {
    // Verify contract exists and belongs to tenant
    await this.validateContract(tenantId, contractId);

    const where: any = {
      tenantId,
      contractId,
    };

    if (!includeArchived) {
      where.status = 'ACTIVE';
    }

    return this.prisma.contractNote.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * List all active notes for a customer (across all their contracts)
   * 
   * Role-aware filtering:
   * - Returns only notes that belong to this customer's participation
   * - If customer is HOLDER: returns HOLDER notes only
   * - Returns notes matching the resolved role and passenger index
   */
  async listCustomerOperationalNotes(tenantId: string, customerId: string) {
    const contracts = await this.prisma.contract.findMany({
      where: {
        tenantId,
      },
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

    const participations = contracts.flatMap((contract) => {
      const participation = resolveContractParticipation(contract, customerId);
      return participation
        ? [
            {
              contractId: contract.id,
              role: participation.role,
              passengerIndex: participation.passengerIndex,
            },
          ]
        : [];
    });

    if (participations.length === 0) {
      return [];
    }

    const noteFilters = participations.map((participation) => ({
      contractId: participation.contractId,
      passengerType: participation.role,
      passengerIndex: participation.passengerIndex,
    }));

    return this.prisma.contractNote.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        OR: noteFilters,
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
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async enrichTravelContext(
    tenantId: string,
    context: TravelContextDto,
    selectedClientId?: string,
  ): Promise<TravelContextDto> {
    let internalTripId: string | null = null;
    if (context.travelType === TravelContextType.INTERNAL) {
      const booking = await this.prisma.internalTourBooking.findFirst({
        where: {
          id: context.travelId,
          tenantId,
        },
        select: {
          internalTripId: true,
        },
      });
      internalTripId = booking?.internalTripId ?? null;
    }

    const contracts = await this.prisma.contract.findMany({
      where: {
        tenantId,
      },
      select: {
        id: true,
        clientId: true,
        contractNumber: true,
        travelPackageId: true,
        internalTripId: true,
        payload: true,
        createdAt: true,
        notes: {
          where: {
            status: 'ACTIVE',
          },
          select: {
            passengerType: true,
            passengerIndex: true,
            note: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const travelContracts = contracts.filter((contract) =>
      this.contractMatchesTravel(
        contract,
        context.travelType,
        context.travelId,
        internalTripId,
      ),
    );
    const selectedContract = selectedClientId
      ? travelContracts.find(
          (contract) =>
            resolveContractParticipation(contract, selectedClientId) !== null,
        )
      : undefined;

    return {
      ...context,
      contractNumber: selectedContract?.contractNumber ?? null,
      participants: context.participants.map((participant) => {
        const participantContract = travelContracts.find(
          (contract) =>
            resolveContractParticipation(contract, participant.clientId) !==
            null,
        );
        if (!participantContract) {
          return {
            ...participant,
            operationalNotes: [],
          };
        }

        const participation = resolveContractParticipation(
          participantContract,
          participant.clientId,
        );
        if (!participation) {
          return {
            ...participant,
            operationalNotes: [],
          };
        }

        return {
          ...participant,
          operationalNotes: participantContract.notes
            .filter(
              (note) =>
                note.passengerType === participation.role &&
                (note.passengerIndex ?? null) ===
                  participation.passengerIndex,
            )
            .map((note) => note.note),
        };
      }),
    };
  }

  private contractMatchesTravel(
    contract: {
      travelPackageId: string | null;
      internalTripId: string | null;
      payload: unknown;
    },
    travelType: TravelContextType,
    travelId: string,
    internalTripId: string | null,
  ): boolean {
    const payload =
      contract.payload &&
      typeof contract.payload === 'object' &&
      !Array.isArray(contract.payload)
        ? (contract.payload as Record<string, unknown>)
        : {};

    if (travelType === TravelContextType.INTERNATIONAL) {
      return (
        contract.travelPackageId === travelId ||
        String(payload.travelPackageId ?? '').trim() === travelId
      );
    }

    if (!internalTripId) {
      return false;
    }

    return (
      contract.internalTripId === internalTripId ||
      String(payload.internalTripId ?? '').trim() === internalTripId
    );
  }

  /**
   * Get a specific contract note by ID
   */
  async getContractNote(tenantId: string, contractId: string, noteId: string) {
    const note = await this.prisma.contractNote.findFirst({
      where: {
        id: noteId,
        tenantId,
        contractId,
      },
    });

    if (!note) {
      throw new NotFoundException('Nota no encontrada');
    }

    return note;
  }

  /**
   * Update a contract note (only if ACTIVE)
   */
  async updateContractNote(
    tenantId: string,
    contractId: string,
    noteId: string,
    noteText: string,
  ) {
    // Verify note exists and belongs to tenant and contract
    const existingNote = await this.prisma.contractNote.findFirst({
      where: {
        id: noteId,
        tenantId,
        contractId,
      },
    });

    if (!existingNote) {
      throw new NotFoundException('Nota no encontrada');
    }

    if (existingNote.status === 'ARCHIVED') {
      throw new ForbiddenException('No se pueden editar notas archivadas');
    }

    const updatedNote = await this.prisma.contractNote.update({
      where: {
        id: noteId,
      },
      data: {
        note: noteText,
      },
    });

    return updatedNote;
  }

  /**
   * Delete a contract note (admin only, can delete archived notes)
   */
  async deleteContractNote(tenantId: string, contractId: string, noteId: string) {
    // Verify note exists and belongs to tenant and contract
    const note = await this.prisma.contractNote.findFirst({
      where: {
        id: noteId,
        tenantId,
        contractId,
      },
    });

    if (!note) {
      throw new NotFoundException('Nota no encontrada');
    }

    await this.prisma.contractNote.delete({
      where: {
        id: noteId,
      },
    });

    return { message: 'Nota eliminada correctamente' };
  }

  /**
   * Archive notes for contracts that ended more than 1 day ago
   * This should be called by a scheduled job (cron)
   */
  async archiveExpiredNotes() {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    oneDayAgo.setHours(0, 0, 0, 0); // Start of day

    // Find contracts that ended before yesterday (more than 1 day ago)
    const expiredContracts = await this.prisma.contract.findMany({
      where: {
        endDate: {
          lt: oneDayAgo,
        },
      },
      select: {
        id: true,
      },
    });

    const contractIds = expiredContracts.map(c => c.id);

    if (contractIds.length === 0) {
      return { archived: 0 };
    }

    // Archive all active notes for these contracts
    const result = await this.prisma.contractNote.updateMany({
      where: {
        contractId: { in: contractIds },
        status: 'ACTIVE',
      },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date(),
      },
    });

    return { archived: result.count };
  }

  // ========== Private Helper Methods ==========

  /**
   * Validate that contract exists and belongs to tenant
   */
  private async validateContract(tenantId: string, contractId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: {
        id: contractId,
        tenantId,
      },
    });

    if (!contract) {
      throw new NotFoundException('Contrato no encontrado');
    }

    return contract;
  }
}
