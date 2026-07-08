import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Client, Prisma } from "@prisma/client";
import { CreateOrUpdateClientDto } from "./dto/create-or-update-client.dto";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { ListCustomersDto } from "./dto/list-customers.dto";
import { CustomerListResponseDto } from "./dto/customer-list-response.dto";
import { CustomerListItemDto } from "./dto/customer-list-item.dto";
import { CustomerProfileDto } from "./dto/customer-profile.dto";
import { CustomerInfoDto } from "./dto/customer-info.dto";
import { CustomerContractItemDto } from "./dto/customer-contract-item.dto";
import { CustomerFinancialSummaryDto } from "./dto/customer-financial-summary.dto";
import { CustomerStatisticsDto } from "./dto/customer-statistics.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { ValidateCustomerIdentityDto } from "./dto/validate-customer-identity.dto";
import { CustomerIdentityValidationResultDto } from "./dto/customer-identity-validation-result.dto";
import { CustomerDocumentsService } from "./documents/customer-documents.service";

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerDocumentsService: CustomerDocumentsService,
  ) {}

  /**
   * Creates or updates a customer based on compound key [idNumber, tenantId]
   * 
   * Responsibilities:
   * 1. Normalize ALL fields (trim, toLowerCase, null conversion)
   * 2. Ensure multi-tenant isolation
   * 3. Validate identity before updating existing records
   * 4. Execute create or update with identity protection
   * 5. Return created/updated customer
   * 
   * Business Rules:
   * - A Client is uniquely identified by [tenantId, idNumber]
   * - Identity fields (fullName, idNumber) cannot be silently overwritten
   * - If idNumber exists but fullName doesn't match, reject the operation
   * - Only mutable fields (email, phone, emergency contacts) can be updated
   * 
   * @param dto Customer data (possibly not normalized)
   * @returns Created or updated customer (Client type from Prisma)
   * @throws ConflictException if identity mismatch is detected
   */
  async upsertClient(dto: CreateOrUpdateClientDto): Promise<Client> {
    // Step 1: Normalize all fields
    const normalized = this.normalizeClientData(dto);

    // Step 2: Check if client already exists
    const existingClient = await this.prisma.client.findUnique({
      where: {
        idNumber_tenantId: {
          idNumber: normalized.idNumber,
          tenantId: normalized.tenantId,
        },
      },
    });

    // Step 3: If client exists, validate identity
    if (existingClient) {
      const existingNameNormalized = this.normalizeNameForComparison(
        existingClient.fullName
      );
      const newNameNormalized = this.normalizeNameForComparison(
        normalized.fullName
      );

      // Identity conflict: same idNumber but different person
      if (existingNameNormalized !== newNameNormalized) {
        throw new ConflictException(
          `Ya existe un cliente con este número de identificación pero la información de identidad no coincide. Cliente existente: "${existingClient.fullName}". Información proporcionada: "${normalized.fullName}".`
        );
      }

      // Identity matches - update only mutable fields
      const updatedClient = await this.prisma.client.update({
        where: {
          id: existingClient.id,
        },
        data: {
          email: normalized.email,
          phone: normalized.phone,
          emergencyContactName: normalized.emergencyContactName,
          emergencyContactPhone: normalized.emergencyContactPhone,
        },
      });

      return updatedClient;
    }

    // Step 4: No existing client - create new record
    const client = await this.prisma.client.create({
      data: {
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
   * Creates a new customer with identity validation
   * 
   * Responsibilities:
   * 1. Normalize all fields using existing normalization logic
   * 2. Validate that idNumber doesn't exist in tenant
   * 3. If exists, validate identity match and update mutable fields
   * 4. If identity conflict, reject with ConflictException
   * 5. Return created or updated customer
   * 
   * Business Rules:
   * - Reuses upsertClient() logic for consistency
   * - Same identity validation and conflict handling
   * - Enforces tenant isolation
   * 
   * @param tenantId Tenant ID from authenticated user
   * @param dto Customer data
   * @returns Created or updated customer (Client type from Prisma)
   * @throws ConflictException if identity mismatch is detected
   */
  async createCustomer(
    tenantId: string,
    dto: CreateCustomerDto
  ): Promise<Client> {
    // Reuse upsertClient with tenant injection
    const clientDto: CreateOrUpdateClientDto = {
      ...dto,
      tenantId: tenantId,
    };

    return this.upsertClient(clientDto);
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

    // Fetch contracts with payload to extract totalAmount
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
        payload: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Get contract IDs for financial queries
    const contractIds = contracts.map((c) => c.id);

    // Fetch financial data and documents in parallel
    const [
      invoices,
      verifiedPayments,
      lastPayment,
      clientBalance,
      totalInvoicesCount,
      totalReceiptsCount,
      totalPaymentsCount,
      customerDocuments,
    ] = await Promise.all([
      // Get all invoices for this client
      this.prisma.billingInvoice.findMany({
        where: {
          clientId: customerId,
          tenantId: tenantId,
        },
        select: {
          totalAmount: true,
          balanceAmount: true,
        },
      }),
      // Get all verified payments for this client's contracts
      contractIds.length > 0
        ? this.prisma.billingPayment.findMany({
            where: {
              contractId: { in: contractIds },
              tenantId: tenantId,
              status: "ABONO_VERIFICADO",
            },
            select: {
              amount: true,
            },
          })
        : [],
      // Get last payment
      contractIds.length > 0
        ? this.prisma.billingPayment.findFirst({
            where: {
              contractId: { in: contractIds },
              tenantId: tenantId,
              status: "ABONO_VERIFICADO",
            },
            select: {
              amount: true,
              verifiedAt: true,
            },
            orderBy: {
              verifiedAt: "desc",
            },
          })
        : null,
      // Get client balance for available credit
      this.prisma.billingClientBalance.findUnique({
        where: {
          clientId: customerId,
        },
        select: {
          availableCreditAmount: true,
        },
      }),
      // Counts for backward compatibility
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
      // Get customer documents via CustomerDocumentsService
      this.customerDocumentsService.listCustomerDocuments(tenantId, customerId),
    ]);

    // Calculate financial summary from aggregated data
    const totalContractedAmount = contracts.reduce((sum, contract) => {
      const payload = contract.payload as any;
      const amount = payload?.totalAmount
        ? parseFloat(String(payload.totalAmount))
        : 0;
      return sum + amount;
    }, 0);

    const totalInvoicedAmount = invoices.reduce((sum: number, invoice: any) => {
      return sum + parseFloat(String(invoice.totalAmount));
    }, 0);

    const totalPaidAmount = verifiedPayments.reduce((sum: number, payment: any) => {
      return sum + parseFloat(String(payment.amount));
    }, 0);

    const outstandingBalance = invoices.reduce((sum: number, invoice: any) => {
      return sum + parseFloat(String(invoice.balanceAmount));
    }, 0);

    const availableCredit = clientBalance
      ? parseFloat(String(clientBalance.availableCreditAmount))
      : 0;

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
      totalContractedAmount,
      totalInvoicedAmount,
      totalPaidAmount,
      outstandingBalance,
      availableCredit,
      lastPaymentDate: lastPayment?.verifiedAt?.toISOString() || null,
      lastPaymentAmount: lastPayment
        ? parseFloat(String(lastPayment.amount))
        : null,
      lastContractDate:
        contracts.length > 0 ? contracts[0].createdAt.toISOString() : null,
      lastContractNumber:
        contracts.length > 0 ? contracts[0].contractNumber : null,
      totalInvoices: totalInvoicesCount,
      totalReceipts: totalReceiptsCount,
      totalPayments: totalPaymentsCount,
    };

    const statistics: CustomerStatisticsDto = {
      totalContracts: contracts.length,
      totalTravels: contracts.length, // At this stage, calculated from contracts
      totalDocuments: customerDocuments.length,
    };

    return {
      customer: customerInfo,
      contracts: contractDtos,
      financialSummary,
      statistics,
    };
  }

  /**
   * Update customer information
   * 
   * Business Rules:
   * - Enforces tenant isolation
   * - Only updates provided fields (partial update)
   * - Returns 404 if customer not found in tenant
   * - Normalizes all data before saving
   * - Returns complete profile after update
   * 
   * @param tenantId Tenant ID for isolation
   * @param customerId Customer ID
   * @param dto Update data (partial)
   * @returns Complete customer profile after update
   */
  async updateCustomer(
    tenantId: string,
    customerId: string,
    dto: UpdateCustomerDto
  ): Promise<CustomerProfileDto> {
    // Verify customer exists with tenant isolation
    const existingCustomer = await this.prisma.client.findFirst({
      where: {
        id: customerId,
        tenantId: tenantId,
      },
    });

    if (!existingCustomer) {
      throw new NotFoundException(
        `Customer not found or does not belong to the current tenant.`
      );
    }

    // Build update data with normalization (only for provided fields)
    const updateData: Prisma.ClientUpdateInput = {};

    if (dto.fullName !== undefined) {
      updateData.fullName = String(dto.fullName || "").trim();
    }

    if (dto.email !== undefined) {
      updateData.email = String(dto.email || "").trim().toLowerCase();
    }

    if (dto.phone !== undefined) {
      updateData.phone = String(dto.phone || "").trim() || null;
    }

    if (dto.emergencyContactName !== undefined) {
      updateData.emergencyContactName =
        String(dto.emergencyContactName || "").trim() || null;
    }

    if (dto.emergencyContactPhone !== undefined) {
      updateData.emergencyContactPhone =
        String(dto.emergencyContactPhone || "").trim() || null;
    }

    // Update customer
    await this.prisma.client.update({
      where: {
        id: customerId,
      },
      data: updateData,
    });

    // Return complete profile using existing aggregation method
    return this.getCustomerProfile(tenantId, customerId);
  }

  /**
   * Validate customer identity before contract creation
   * 
   * Purpose:
   * - Early validation to prevent identity conflicts
   * - Provides immediate feedback in the contract form
   * - Prevents users from completing entire form only to discover conflict
   * 
   * Business Rules:
   * - If idNumber doesn't exist: valid (new customer)
   * - If idNumber exists AND name matches: valid (existing customer, can reuse)
   * - If idNumber exists BUT name doesn't match: invalid (identity conflict)
   * 
   * @param tenantId Tenant identifier for isolation
   * @param dto Validation request with idNumber and fullName
   * @returns Validation result with status and message
   */
  async validateCustomerIdentity(
    tenantId: string,
    dto: ValidateCustomerIdentityDto
  ): Promise<CustomerIdentityValidationResultDto> {
    // Normalize inputs
    const normalizedIdNumber = String(dto.idNumber || "").trim();
    const normalizedFullName = String(dto.fullName || "").trim();

    if (!normalizedIdNumber || !normalizedFullName) {
      return {
        valid: false,
        message: "El número de identificación y el nombre completo son requeridos",
      };
    }

    // Check if customer exists with this idNumber
    const existingCustomer = await this.prisma.client.findUnique({
      where: {
        idNumber_tenantId: {
          idNumber: normalizedIdNumber,
          tenantId: tenantId,
        },
      },
      select: {
        id: true,
        fullName: true,
        idNumber: true,
        email: true,
      },
    });

    // Case 1: No existing customer - valid
    if (!existingCustomer) {
      return {
        valid: true,
        message: "Número de identificación disponible",
      };
    }

    // Case 2 & 3: Customer exists - compare names
    const existingNameNormalized = this.normalizeNameForComparison(
      existingCustomer.fullName
    );
    const providedNameNormalized = this.normalizeNameForComparison(
      normalizedFullName
    );

    if (existingNameNormalized === providedNameNormalized) {
      // Case 2: Names match - valid (will reuse existing customer)
      return {
        valid: true,
        message: "Cliente existente - la información coincide",
        existingCustomer: {
          id: existingCustomer.id,
          fullName: existingCustomer.fullName,
          idNumber: existingCustomer.idNumber,
          email: existingCustomer.email,
        },
      };
    }

    // Case 3: Names don't match - invalid (identity conflict)
    return {
      valid: false,
      message: `Ya existe un cliente registrado con ese número de identificación pero con un nombre diferente. Cliente existente: "${existingCustomer.fullName}". Nombre ingresado: "${dto.fullName}". Por favor, verifique la información antes de continuar.`,
      existingCustomer: {
        id: existingCustomer.id,
        fullName: existingCustomer.fullName,
        idNumber: existingCustomer.idNumber,
        email: existingCustomer.email,
      },
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
  /**
   * Normalizes a name for identity comparison
   * 
   * Normalization includes:
   * - Trim whitespace
   * - Convert to lowercase
   * - Collapse multiple spaces into single space
   * 
   * Examples:
   * - "  Juan   Perez  " -> "juan perez"
   * - "MARIA LOPEZ" -> "maria lopez"
   * - "John  Smith" -> "john smith"
   * 
   * @param name The name to normalize
   * @returns Normalized name for comparison
   */
  private normalizeNameForComparison(name: string): string {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

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

  /**
   * Get customer documents
   * Delegates to CustomerDocumentsService
   */
  async getCustomerDocuments(tenantId: string, customerId: string) {
    return this.customerDocumentsService.listCustomerDocuments(tenantId, customerId);
  }

  /**
   * Get customer documents count
   * Delegates to CustomerDocumentsService
   */
  async getCustomerDocumentsCount(tenantId: string, customerId: string): Promise<number> {
    const documents = await this.customerDocumentsService.listCustomerDocuments(tenantId, customerId);
    return documents.length;
  }
}
