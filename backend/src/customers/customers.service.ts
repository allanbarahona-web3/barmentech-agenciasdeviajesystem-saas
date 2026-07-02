import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Client } from "@prisma/client";
import { CreateOrUpdateClientDto } from "./dto/create-or-update-client.dto";

/**
 * CustomersService
 * 
 * Single owner of all customer-related business logic:
 * - Customer normalization
 * - Customer validation
 * - Customer creation
 * - Customer update (upsert)
 * 
 * ContractsService delegates all customer management to this service.
 */
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates or updates a customer based on compound key [idNumber, tenantId]
   * 
   * Responsibilities:
   * 1. Normalize ALL fields (trim, toLowerCase, null conversion)
   * 2. Ensure multi-tenant isolation
   * 3. Execute upsert using compound unique key
   * 4. Return created/updated customer
   * 
   * @param dto Customer data (possibly not normalized)
   * @returns Created or updated customer (Client type from Prisma)
   */
  async upsertClient(dto: CreateOrUpdateClientDto): Promise<Client> {
    // Step 1: Normalize all fields
    const normalized = this.normalizeClientData(dto);

    // Step 2: Execute upsert (fully typed, no 'any')
    const client = await this.prisma.client.upsert({
      where: {
        idNumber_tenantId: {
          idNumber: normalized.idNumber,
          tenantId: normalized.tenantId,
        },
      },
      update: {
        fullName: normalized.fullName,
        email: normalized.email,
        phone: normalized.phone,
        emergencyContactName: normalized.emergencyContactName,
        emergencyContactPhone: normalized.emergencyContactPhone,
      },
      create: {
        fullName: normalized.fullName,
        idNumber: normalized.idNumber,
        email: normalized.email,
        phone: normalized.phone,
        emergencyContactName: normalized.emergencyContactName,
        emergencyContactPhone: normalized.emergencyContactPhone,
        tenantId: normalized.tenantId,
      },
    });

    return client;
  }

  /**
   * Normalizes all customer fields
   * 
   * Normalization rules (CENTRALIZED HERE):
   * - fullName: trim()
   * - idNumber: trim()
   * - email: trim() + toLowerCase()
   * - phone: trim() → null if empty
   * - emergencyContactName: trim() → null if empty
   * - emergencyContactPhone: trim() → null if empty
   * - tenantId: trim()
   * 
   * @param dto DTO possibly not normalized
   * @returns Fully normalized DTO
   */
  private normalizeClientData(
    dto: CreateOrUpdateClientDto
  ): CreateOrUpdateClientDto {
    return {
      fullName: String(dto.fullName || "").trim(),
      idNumber: String(dto.idNumber || "").trim(),
      email: String(dto.email || "").trim().toLowerCase(),
      phone: String(dto.phone || "").trim() || null,
      emergencyContactName: String(dto.emergencyContactName || "").trim() || null,
      emergencyContactPhone: String(dto.emergencyContactPhone || "").trim() || null,
      tenantId: String(dto.tenantId || "").trim(),
    };
  }
}
