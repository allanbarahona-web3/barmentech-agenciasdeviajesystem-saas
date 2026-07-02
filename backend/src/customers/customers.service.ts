import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Client, Prisma } from "@prisma/client";
import { CreateOrUpdateClientDto } from "./dto/create-or-update-client.dto";
import { ListCustomersDto } from "./dto/list-customers.dto";
import { CustomerListResponseDto } from "./dto/customer-list-response.dto";
import { CustomerListItemDto } from "./dto/customer-list-item.dto";
import { CustomerProfileDto } from "./dto/customer-profile.dto";
import { CustomerInfoDto } from "./dto/customer-info.dto";
import { CustomerContractItemDto } from "./dto/customer-contract-item.dto";
import { CustomerFinancialSummaryDto } from "./dto/customer-financial-summary.dto";
import { CustomerStatisticsDto } from "./dto/customer-statistics.dto";

/**
 * CustomersService
 * 
 * Single owner of all customer-related business logic:
 * - Customer normalization
 * - Customer validation
 * - Customer creation
 * - Customer update (upsert)
 * - Customer listing and search
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
   * Registers adult companions as Client records
   * 
   * Business Rules:
   * - Only registers companions with valid fullName and idNumber
   * - Skips companions without required identification
   * - Reuses upsertClient() for each companion
   * 
   * @param companions Array of companion objects from contract payload
   * @param tenantId Tenant ID for multi-tenant isolation
   * @returns Array of registered Client records
   */
  async registerCompanionsAsClients(
    companions: any[],
    tenantId: string
  ): Promise<Client[]> {
    // Filter for companions with valid identification
    const validCompanions = companions.filter(
      (c) =>
        c &&
        String(c.fullName || "").trim() &&
        String(c.idNumber || "").trim()
    );

    // Register each companion using upsertClient
    const registeredClients: Client[] = [];
    for (const companion of validCompanions) {
      const client = await this.upsertClient({
        fullName: companion.fullName,
        idNumber: companion.idNumber,
        email: companion.email,
        phone: companion.phone,
        emergencyContactName: companion.emergencyContactName,
        emergencyContactPhone: companion.emergencyContactPhone,
        tenantId: tenantId,
      });
      registeredClients.push(client);
    }

    return registeredClients;
  }

  /**
   * List customers with pagination and search
   * 
   * Business Rules:
   * - Enforces tenant isolation
   * - Search is case-insensitive across fullName, idNumber, email
   * - Returns paginated results
   * 
   * @param tenantId Tenant ID for isolation
   * @param dto Query parameters (page, pageSize, search)
   * @returns Paginated customer list
   */
  async listCustomers(
    tenantId: string,
    dto: ListCustomersDto
  ): Promise<CustomerListResponseDto> {
    const page = dto.page || 1;
    const pageSize = dto.pageSize || 20;
    const skip = (page - 1) * pageSize;

    // Build where clause with tenant isolation
    const where: Prisma.ClientWhereInput = {
      tenantId: tenantId,
    };

    // Add search filter if provided
    if (dto.search && dto.search.trim()) {
      const searchTerm = dto.search.trim();
      where.OR = [
        {
          fullName: {
            contains: searchTerm,
            mode: "insensitive",
          },
        },
        {
          idNumber: {
            contains: searchTerm,
            mode: "insensitive",
          },
        },
        {
          email: {
            contains: searchTerm,
            mode: "insensitive",
          },
        },
      ];
    }

    // Execute query with pagination
    const [customers, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          idNumber: true,
          email: true,
          phone: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: pageSize,
      }),
      this.prisma.client.count({ where }),
    ]);

    // Map to DTOs
    const customerDtos: CustomerListItemDto[] = customers.map((c) => ({
      id: c.id,
      fullName: c.fullName,
      idNumber: c.idNumber,
      email: c.email,
      phone: c.phone,
      createdAt: c.createdAt,
    }));

    const totalPages = Math.ceil(total / pageSize);

    return {
      customers: customerDtos,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * Get complete customer profile with aggregated data
   * 
   * Business Rules:
   * - Enforces tenant isolation
   * - Returns 404 if customer not found in tenant
   * - Aggregates data from multiple modules
   * 
   * @param tenantId Tenant ID for isolation
   * @param customerId Customer ID
   * @returns Complete customer profile
   */
  async getCustomerProfile(
    tenantId: string,
    customerId: string
  ): Promise<CustomerProfileDto> {
    // Fetch customer with tenant isolation
    const customer = await this.prisma.client.findFirst({
      where: {
        id: customerId,
        tenantId: tenantId,
      },
      select: {
        id: true,
        fullName: true,
        idNumber: true,
        email: true,
        phone: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!customer) {
      throw new NotFoundException(
        `Customer not found or does not belong to the current tenant.`
      );
    }

    // Fetch contracts (lightweight)
    const contracts = await this.prisma.contract.findMany({
      where: {
        clientId: customerId,
        tenantId: tenantId,
      },
      select: {
        id: true,
        contractNumber: true,
        destination: true,
        status: true,
        source: true,
        participantCount: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Get contract IDs for financial queries
    const contractIds = contracts.map((c) => c.id);

    // Fetch financial summary and statistics in parallel
    const [totalInvoices, totalReceipts, totalPayments] = await Promise.all([
      this.prisma.billingInvoice.count({
        where: {
          clientId: customerId,
          tenantId: tenantId,
        },
      }),
      contractIds.length > 0
        ? this.prisma.billingReceipt.count({
            where: {
              contractId: { in: contractIds },
              tenantId: tenantId,
            },
          })
        : 0,
      contractIds.length > 0
        ? this.prisma.billingPayment.count({
            where: {
              contractId: { in: contractIds },
              tenantId: tenantId,
            },
          })
        : 0,
    ]);

    // Map to DTOs
    const customerInfo: CustomerInfoDto = {
      id: customer.id,
      fullName: customer.fullName,
      idNumber: customer.idNumber,
      email: customer.email,
      phone: customer.phone,
      emergencyContactName: customer.emergencyContactName,
      emergencyContactPhone: customer.emergencyContactPhone,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };

    const contractDtos: CustomerContractItemDto[] = contracts.map((c) => ({
      id: c.id,
      contractNumber: c.contractNumber,
      destination: c.destination,
      status: c.status,
      source: c.source,
      participantCount: c.participantCount,
      createdAt: c.createdAt,
    }));

    const financialSummary: CustomerFinancialSummaryDto = {
      totalInvoices,
      totalReceipts,
      totalPayments,
    };

    const statistics: CustomerStatisticsDto = {
      totalContracts: contracts.length,
      totalTravels: contracts.length, // At this stage, calculated from contracts
    };

    return {
      customer: customerInfo,
      contracts: contractDtos,
      financialSummary,
      statistics,
    };
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
