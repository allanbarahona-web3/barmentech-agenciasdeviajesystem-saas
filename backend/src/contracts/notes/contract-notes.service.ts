import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
   */
  async listCustomerOperationalNotes(tenantId: string, customerId: string) {
    // Get all contracts for this customer
    const contracts = await this.prisma.contract.findMany({
      where: {
        tenantId,
        clientId: customerId,
      },
      select: {
        id: true,
        contractNumber: true,
        destination: true,
        startDate: true,
        endDate: true,
      },
    });

    const contractIds = contracts.map(c => c.id);

    if (contractIds.length === 0) {
      return [];
    }

    // Get all active notes for these contracts
    const notes = await this.prisma.contractNote.findMany({
      where: {
        tenantId,
        contractId: { in: contractIds },
        status: 'ACTIVE',
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

    return notes;
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
