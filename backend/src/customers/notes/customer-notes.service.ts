import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CustomerNotesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new note for a customer
   */
  async createCustomerNote(
    tenantId: string,
    customerId: string,
    note: string,
    createdByUserId: string,
    createdByName: string,
  ) {
    // Verify customer exists and belongs to tenant
    await this.validateCustomer(tenantId, customerId);

    const customerNote = await this.prisma.customerNote.create({
      data: {
        customerId,
        tenantId,
        note,
        createdByUserId,
        createdByName,
      },
    });

    return customerNote;
  }

  /**
   * List all notes for a customer
   */
  async listCustomerNotes(tenantId: string, customerId: string) {
    // Verify customer exists and belongs to tenant
    await this.validateCustomer(tenantId, customerId);

    return this.prisma.customerNote.findMany({
      where: {
        tenantId,
        customerId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Get a specific customer note by ID
   */
  async getCustomerNote(tenantId: string, customerId: string, noteId: string) {
    const note = await this.prisma.customerNote.findFirst({
      where: {
        id: noteId,
        tenantId,
        customerId,
      },
    });

    if (!note) {
      throw new NotFoundException('Nota no encontrada');
    }

    return note;
  }

  /**
   * Update a customer note
   */
  async updateCustomerNote(
    tenantId: string,
    customerId: string,
    noteId: string,
    noteText: string,
  ) {
    // Verify note exists and belongs to tenant and customer
    const existingNote = await this.prisma.customerNote.findFirst({
      where: {
        id: noteId,
        tenantId,
        customerId,
      },
    });

    if (!existingNote) {
      throw new NotFoundException('Nota no encontrada');
    }

    const updatedNote = await this.prisma.customerNote.update({
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
   * Delete a customer note
   */
  async deleteCustomerNote(tenantId: string, customerId: string, noteId: string) {
    // Verify note exists and belongs to tenant and customer
    const note = await this.prisma.customerNote.findFirst({
      where: {
        id: noteId,
        tenantId,
        customerId,
      },
    });

    if (!note) {
      throw new NotFoundException('Nota no encontrada');
    }

    await this.prisma.customerNote.delete({
      where: {
        id: noteId,
      },
    });

    return { message: 'Nota eliminada correctamente' };
  }

  // ========== Private Helper Methods ==========

  /**
   * Validate that customer exists and belongs to tenant
   */
  private async validateCustomer(tenantId: string, customerId: string) {
    const customer = await this.prisma.client.findFirst({
      where: {
        id: customerId,
        tenantId,
      },
    });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return customer;
  }
}
