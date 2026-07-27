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
import { ResolveMinorCustomerDto } from "./dto/resolve-minor-customer.dto";
import { CustomerIdentityValidationResultDto } from "./dto/customer-identity-validation-result.dto";
import { CustomerDocumentsService } from "./documents/customer-documents.service";
import { CustomerNotesService } from "./notes/customer-notes.service";
import { normalizeIdentification, validateIdentification } from "./utils/normalize-identification";
import { resolveContractParticipation } from "../contracts/contract-participation";

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
    private readonly customerNotesService: CustomerNotesService,
  ) {}

  /**
   * Creates or updates a customer based on [tenantId, idType, idNumber]
   * 
   * Responsibilities:
   * 1. Normalize ALL fields (trim, toLowerCase, null conversion)
   * 2. Ensure multi-tenant isolation
   * 3. Validate identity before updating existing records
   * 4. Execute create or update with identity protection
   * 5. Return created/updated customer
   * 
   * Business Rules:
   * - A Client is uniquely identified by [tenantId, idType, idNumber]
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

    // Step 1.5: Validate normalized idNumber
    const validationResult = validateIdentification(normalized.idType, normalized.idNumber);
    if (!validationResult.isValid) {
      throw new ConflictException(validationResult.errorMessage || "Número de identificación inválido");
    }

    // Step 2: Check if client already exists
    const existingClient = await this.prisma.client.findFirst({
      where: {
        tenantId: normalized.tenantId,
        idType: normalized.idType,
        idNumber: normalized.idNumber,
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

      const updateData: Prisma.ClientUpdateInput = {
        email: normalized.email,
        phone: normalized.phone,
        emergencyContactName: normalized.emergencyContactName,
        emergencyContactPhone: normalized.emergencyContactPhone,
      };

      if (dto.nationality !== undefined) {
        updateData.nationality = normalized.nationality;
      }
      if (dto.occupation !== undefined) {
        updateData.occupation = normalized.occupation;
      }
      if (dto.maritalStatus !== undefined) {
        updateData.maritalStatus = normalized.maritalStatus;
      }
      if (dto.address !== undefined) {
        updateData.address = normalized.address;
      }

      // Identity matches - update only mutable fields
      const updatedClient = await this.prisma.client.update({
        where: {
          id: existingClient.id,
        },
        data: updateData,
      });

      return updatedClient;
    }

    // Step 4: No existing client - create new record
    const client = await this.prisma.client.create({
      data: {
        fullName: normalized.fullName,
        idNumber: normalized.idNumber,
        idType: normalized.idType,
        email: normalized.email,
        phone: normalized.phone,
        emergencyContactName: normalized.emergencyContactName,
        emergencyContactPhone: normalized.emergencyContactPhone,
        nationality: normalized.nationality,
        occupation: normalized.occupation,
        maritalStatus: normalized.maritalStatus,
        address: normalized.address,
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

  async resolveMinorCustomer(
    tenantId: string,
    dto: ResolveMinorCustomerDto,
  ): Promise<{ id: string }> {
    const normalizedIdNumber = normalizeIdentification(
      dto.idType,
      dto.idNumber,
    );
    const validationResult = validateIdentification(
      dto.idType,
      normalizedIdNumber,
    );
    if (!validationResult.isValid) {
      throw new ConflictException(
        validationResult.errorMessage || "Número de identificación inválido",
      );
    }

    const normalizedFullName = String(dto.fullName || "").trim();
    const normalizedIdType = String(dto.idType || "").trim();
    const identityWhere = {
      tenantId,
      idType: normalizedIdType,
      idNumber: normalizedIdNumber,
    };
    const existingCustomer = await this.prisma.client.findFirst({
      where: identityWhere,
      select: {
        id: true,
        fullName: true,
      },
    });

    if (existingCustomer) {
      if (
        this.normalizeNameForComparison(existingCustomer.fullName) !==
        this.normalizeNameForComparison(normalizedFullName)
      ) {
        throw new ConflictException(
          `Ya existe un cliente con esta identificación pero el nombre no coincide. Cliente existente: "${existingCustomer.fullName}".`,
        );
      }
      return { id: existingCustomer.id };
    }

    try {
      const createdCustomer = await this.prisma.client.create({
        data: {
          fullName: normalizedFullName,
          idType: normalizedIdType,
          idNumber: normalizedIdNumber,
          email: null,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          tenantId,
        },
        select: {
          id: true,
        },
      });
      return createdCustomer;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const concurrentCustomer = await this.prisma.client.findFirst({
          where: identityWhere,
          select: {
            id: true,
            fullName: true,
          },
        });
        if (
          concurrentCustomer &&
          this.normalizeNameForComparison(concurrentCustomer.fullName) ===
            this.normalizeNameForComparison(normalizedFullName)
        ) {
          return { id: concurrentCustomer.id };
        }
      }
      throw error;
    }
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
        idType: companion.idType || null,
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
   * Registers minors as Client records.
   *
   * The contract payload remains the compatibility source for minor-specific
   * legal and tutor information. This method only establishes the relational
   * Client identity required by future operational modules.
   *
   * Business Rules:
   * - Only registers minors with a name and identification number
   * - Uses the tutor email when available, otherwise the holder contact email
   * - Reuses upsertClient() for normalization, identity validation and tenant
   *   isolation
   */
  async registerMinorsAsClients(
    minors: any[],
    tenantId: string,
    holderEmail: string,
  ): Promise<Client[]> {
    const validMinors = minors.filter(
      (minor) =>
        minor &&
        String(minor.minorName || minor.name || "").trim() &&
        String(minor.minorId || minor.idNumber || "").trim(),
    );

    const registeredClients: Client[] = [];
    for (const minor of validMinors) {
      const client = await this.upsertClient({
        fullName: minor.minorName || minor.name,
        idNumber: minor.minorId || minor.idNumber,
        idType: minor.minorIdType || minor.idType || null,
        email: String(minor.tutorEmail || "").trim() || holderEmail,
        emergencyContactName:
          minor.tutorName || minor.travelingWith || null,
        tenantId,
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
      
      // Build OR conditions for searching
      const orConditions: Prisma.ClientWhereInput[] = [
        {
          fullName: {
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

      // If search term contains digits, try normalizing as different ID types
      if (/\d/.test(searchTerm)) {
        // Try as Cedula (10 digits)
        const normalizedAsCedula = normalizeIdentification("Cedula", searchTerm);
        if (normalizedAsCedula) {
          orConditions.push({
            idNumber: {
              contains: normalizedAsCedula,
              mode: "insensitive",
            },
          });
        }

        // Try as DIMEX (12 digits)
        const normalizedAsDimex = normalizeIdentification("DIMEX", searchTerm);
        if (normalizedAsDimex && normalizedAsDimex !== normalizedAsCedula) {
          orConditions.push({
            idNumber: {
              contains: normalizedAsDimex,
              mode: "insensitive",
            },
          });
        }

        // Also search for the raw term (for passport or partial matches)
        orConditions.push({
          idNumber: {
            contains: searchTerm,
            mode: "insensitive",
          },
        });
      } else {
        // Non-numeric search: could be passport or name/email
        orConditions.push({
          idNumber: {
            contains: searchTerm,
            mode: "insensitive",
          },
        });
      }

      where.OR = orConditions;
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
        idType: true,
        email: true,
        phone: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        createdAt: true,
        updatedAt: true,
        dateOfBirth: true,
        nationality: true,
        occupation: true,
        maritalStatus: true,
        address: true,
        city: true,
        country: true,
        postalCode: true,
        secondaryEmail: true,
        secondaryPhone: true,
        emergencyContactRelationship: true,
        emergencyContactEmail: true,
        leadSource: true,
        customerStatus: true,
        assignedToUserId: true,
        lastContactDate: true,
        nextFollowUpDate: true,
        preferredLanguage: true,
        tags: true,
        bloodType: true,
        allergies: true,
        medicalConditions: true,
        medications: true,
      },
    });

    if (!customer) {
      throw new NotFoundException(
        `Customer not found or does not belong to the current tenant.`
      );
    }

    // Fetch contracts with payload to extract totalAmount
    // Fetch contracts where customer is the holder
    const holderContracts = await this.prisma.contract.findMany({
      where: {
        clientId: customerId,
        tenantId: tenantId,
      },
      select: {
        id: true,
        clientId: true,
        contractNumber: true,
        destination: true,
        status: true,
        source: true,
        participantCount: true,
        createdAt: true,
        payload: true,
        startDate: true,
        endDate: true,
        travelPackage: {
          select: {
            id: true,
            name: true,
          },
        },
        client: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Fetch contracts where customer is a companion
    // Look for contracts in same tenant where payload.companions contains selectedCustomerId
    const allTenantContracts = await this.prisma.contract.findMany({
      where: {
        tenantId: tenantId,
        clientId: { not: customerId }, // Exclude holder contracts already fetched
      },
      select: {
        id: true,
        clientId: true,
        contractNumber: true,
        destination: true,
        status: true,
        source: true,
        participantCount: true,
        createdAt: true,
        payload: true,
        startDate: true,
        endDate: true,
        travelPackage: {
          select: {
            id: true,
            name: true,
          },
        },
        client: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Filter contracts where customer appears as a companion or Minor passenger.
    const passengerContracts = allTenantContracts.filter(
      (contract) =>
        resolveContractParticipation(contract, customerId) !== null,
    );

    // Merge both lists
    const contracts = [...holderContracts, ...passengerContracts].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );

    // Get contract IDs for financial queries
    const contractIds = contracts.map((c) => c.id);

    // Fetch financial data, documents, and notes in parallel
    const [
      invoices,
      verifiedPayments,
      lastPayment,
      clientBalance,
      totalInvoicesCount,
      totalReceiptsCount,
      totalPaymentsCount,
      customerDocuments,
      customerNotes,
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
      // Get customer notes via CustomerNotesService
      this.customerNotesService.listCustomerNotes(tenantId, customerId),
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

    // Determine primary currency from invoices (most common currency)
    // Default to USD if no invoices or no currency info
    const currencyCount: Record<string, number> = {};
    invoices.forEach((invoice: any) => {
      const curr = String(invoice.currency || 'USD').toUpperCase();
      currencyCount[curr] = (currencyCount[curr] || 0) + 1;
    });
    
    let primaryCurrency = 'USD';
    let maxCount = 0;
    for (const [curr, count] of Object.entries(currencyCount)) {
      if (count > maxCount) {
        maxCount = count;
        primaryCurrency = curr;
      }
    }

    // Map to DTOs
    const customerInfo: CustomerInfoDto = {
      id: customer.id,
      fullName: customer.fullName,
      idNumber: customer.idNumber,
      idType: customer.idType,
      email: customer.email,
      phone: customer.phone,
      emergencyContactName: customer.emergencyContactName,
      emergencyContactPhone: customer.emergencyContactPhone,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      dateOfBirth: customer.dateOfBirth,
      nationality: customer.nationality,
      occupation: customer.occupation,
      maritalStatus: customer.maritalStatus,
      address: customer.address,
      city: customer.city,
      country: customer.country,
      postalCode: customer.postalCode,
      secondaryEmail: customer.secondaryEmail,
      secondaryPhone: customer.secondaryPhone,
      emergencyContactRelationship: customer.emergencyContactRelationship,
      emergencyContactEmail: customer.emergencyContactEmail,
      leadSource: customer.leadSource,
      customerStatus: customer.customerStatus,
      assignedToUserId: customer.assignedToUserId,
      lastContactDate: customer.lastContactDate,
      nextFollowUpDate: customer.nextFollowUpDate,
      preferredLanguage: customer.preferredLanguage,
      tags: customer.tags,
      bloodType: customer.bloodType,
      allergies: customer.allergies,
      medicalConditions: customer.medicalConditions,
      medications: customer.medications,
    };

    const contractDtos: CustomerContractItemDto[] = contracts.map((c) => {
      const participation = resolveContractParticipation(c, customerId);
      const role = participation?.role || "HOLDER";
      const responsibleMinors =
        role === "MINOR"
          ? []
          : this.resolveResponsibleMinors(
              c,
              customerId,
              customer.fullName,
              role,
            );
      const participants = this.resolveContractParticipants(c);

      return {
        id: c.id,
        contractNumber: c.contractNumber,
        destination: c.destination,
        travelName: c.travelPackage?.name || c.destination,
        status: c.status,
        source: c.source,
        participantCount: c.participantCount,
        createdAt: c.createdAt,
        startDate: c.startDate,
        endDate: c.endDate,
        role,
        ...(responsibleMinors.length > 0 ? { responsibleMinors } : {}),
        participants,
      };
    });

    const currentMinorContractIndex =
      contractDtos[0]?.role === "MINOR" ? 0 : -1;
    const currentMinorContract =
      currentMinorContractIndex >= 0
        ? contracts[currentMinorContractIndex]
        : null;
    const currentMinorParticipation = currentMinorContract
      ? resolveContractParticipation(currentMinorContract, customerId)
      : null;

    let minorProfileFields: Partial<CustomerProfileDto> = {};
    if (
      currentMinorContract &&
      currentMinorParticipation?.role === "MINOR"
    ) {
      const responsibleReference = this.resolveResponsibleAdultReference(
        currentMinorContract,
        currentMinorParticipation.minor,
      );
      const responsibleCustomer = responsibleReference
        ? await this.prisma.client.findFirst({
            where: {
              id: responsibleReference.clientId,
              tenantId,
            },
            select: {
              id: true,
              fullName: true,
            },
          })
        : null;

      minorProfileFields = {
        participationRole: "MINOR",
        currentTrip: {
          id: currentMinorContract.travelPackage?.id || null,
          name:
            currentMinorContract.travelPackage?.name ||
            currentMinorContract.destination,
          destination: currentMinorContract.destination,
          startDate: currentMinorContract.startDate,
          endDate: currentMinorContract.endDate,
        },
        currentContract: contractDtos[currentMinorContractIndex],
        responsibleAdult:
          responsibleReference && responsibleCustomer
            ? {
                clientId: responsibleCustomer.id,
                fullName: responsibleCustomer.fullName,
                participationRole: responsibleReference.participationRole,
              }
            : null,
      };
    }

    const financialSummary: CustomerFinancialSummaryDto = {
      totalContractedAmount,
      totalInvoicedAmount,
      totalPaidAmount,
      outstandingBalance,
      availableCredit,
      currency: primaryCurrency,
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
      totalNotes: customerNotes.length,
    };

    return {
      customer: customerInfo,
      contracts: contractDtos,
      financialSummary,
      statistics,
      documents: customerDocuments,
      notes: customerNotes,
      ...minorProfileFields,
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

    if (dto.idType !== undefined) {
      updateData.idType = String(dto.idType || "").trim() || null;
    }

    if (dto.email !== undefined) {
      updateData.email = String(dto.email || "").trim().toLowerCase();
    }

    if (dto.phone !== undefined) {
      updateData.phone = String(dto.phone || "").trim() || null;
    }

    if (dto.maritalStatus !== undefined) {
      updateData.maritalStatus = String(dto.maritalStatus || "").trim() || null;
    }

    if (dto.nationality !== undefined) {
      updateData.nationality = String(dto.nationality || "").trim() || null;
    }

    if (dto.occupation !== undefined) {
      updateData.occupation = String(dto.occupation || "").trim() || null;
    }

    if (dto.address !== undefined) {
      updateData.address = String(dto.address || "").trim() || null;
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
    const normalizedIdNumber = normalizeIdentification(dto.idType, dto.idNumber);
    const normalizedFullName = String(dto.fullName || "").trim();

    if (!normalizedIdNumber || !normalizedFullName) {
      return {
        valid: false,
        message: "El número de identificación y el nombre completo son requeridos",
      };
    }

    // Validate normalized idNumber
    const validationResult = validateIdentification(dto.idType, normalizedIdNumber);
    if (!validationResult.isValid) {
      return {
        valid: false,
        message: validationResult.errorMessage || "Número de identificación inválido",
      };
    }

    // Check if customer exists with this idNumber
    const existingCustomer = await this.prisma.client.findFirst({
      where: {
        tenantId,
        idType: String(dto.idType || "").trim() || null,
        idNumber: normalizedIdNumber,
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

  private resolveResponsibleAdultReference(
    contract: {
      clientId: string;
      client?: { fullName?: string | null } | null;
      payload: unknown;
    },
    minor: any,
  ): {
    clientId: string;
    participationRole: "HOLDER" | "COMPANION";
  } | null {
    const responsibleName = this.normalizeNameForComparison(
      minor?.travelingWith,
    );
    if (!responsibleName) {
      return null;
    }

    const payload =
      contract.payload &&
      typeof contract.payload === "object" &&
      !Array.isArray(contract.payload)
        ? (contract.payload as Record<string, any>)
        : {};
    const holderName =
      contract.client?.fullName ||
      payload.clientFullName ||
      payload.fullName ||
      "";
    if (
      this.normalizeNameForComparison(holderName) === responsibleName
    ) {
      return {
        clientId: contract.clientId,
        participationRole: "HOLDER",
      };
    }

    const companions = Array.isArray(payload.companions)
      ? payload.companions
      : [];
    const responsibleCompanion = companions.find(
      (companion: any) =>
        this.normalizeNameForComparison(companion?.fullName) ===
        responsibleName,
    );
    const companionClientId = String(
      responsibleCompanion?.selectedCustomerId || "",
    ).trim();

    return companionClientId
      ? {
          clientId: companionClientId,
          participationRole: "COMPANION",
        }
      : null;
  }

  private resolveResponsibleMinors(
    contract: {
      clientId: string;
      client?: { fullName?: string | null } | null;
      payload: unknown;
    },
    customerId: string,
    customerFullName: string,
    role: "HOLDER" | "COMPANION",
  ): Array<{ clientId: string; fullName: string }> {
    const payload =
      contract.payload &&
      typeof contract.payload === "object" &&
      !Array.isArray(contract.payload)
        ? (contract.payload as Record<string, any>)
        : {};
    const responsibleNames = new Set<string>([
      this.normalizeNameForComparison(customerFullName),
    ]);

    if (role === "HOLDER") {
      responsibleNames.add(
        this.normalizeNameForComparison(contract.client?.fullName || ""),
      );
      responsibleNames.add(
        this.normalizeNameForComparison(payload.clientFullName || ""),
      );
    } else {
      const companions = Array.isArray(payload.companions)
        ? payload.companions
        : [];
      const currentCompanion = companions.find(
        (companion: any) =>
          String(companion?.selectedCustomerId || "").trim() === customerId,
      );
      responsibleNames.add(
        this.normalizeNameForComparison(currentCompanion?.fullName || ""),
      );
    }
    responsibleNames.delete("");

    const minors = Array.isArray(payload.minors) ? payload.minors : [];
    const uniqueMinors = new Map<
      string,
      { clientId: string; fullName: string }
    >();
    minors.forEach((minor: any) => {
      const clientId = String(minor?.selectedCustomerId || "").trim();
      const fullName = String(
        minor?.minorName || minor?.name || minor?.fullName || "",
      ).trim();
      const responsibleName = this.normalizeNameForComparison(
        minor?.travelingWith,
      );
      if (
        clientId &&
        fullName &&
        responsibleNames.has(responsibleName)
      ) {
        uniqueMinors.set(clientId, { clientId, fullName });
      }
    });

    return Array.from(uniqueMinors.values());
  }

  private resolveContractParticipants(contract: {
    clientId: string;
    client?: { fullName?: string | null } | null;
    payload: unknown;
  }): Array<{
    clientId: string;
    fullName: string;
    participationRole: "HOLDER" | "COMPANION" | "MINOR";
  }> {
    const payload =
      contract.payload &&
      typeof contract.payload === "object" &&
      !Array.isArray(contract.payload)
        ? (contract.payload as Record<string, any>)
        : {};
    const participants: Array<{
      clientId: string;
      fullName: string;
      participationRole: "HOLDER" | "COMPANION" | "MINOR";
    }> = [];
    const holderName = String(
      contract.client?.fullName || payload.clientFullName || "",
    ).trim();

    if (contract.clientId && holderName) {
      participants.push({
        clientId: contract.clientId,
        fullName: holderName,
        participationRole: "HOLDER",
      });
    }

    const companions = Array.isArray(payload.companions)
      ? payload.companions
      : [];
    companions.forEach((companion: any) => {
      const clientId = String(companion?.selectedCustomerId || "").trim();
      const fullName = String(companion?.fullName || "").trim();
      if (clientId && fullName) {
        participants.push({
          clientId,
          fullName,
          participationRole: "COMPANION",
        });
      }
    });

    const minors = Array.isArray(payload.minors) ? payload.minors : [];
    minors.forEach((minor: any) => {
      const clientId = String(minor?.selectedCustomerId || "").trim();
      const fullName = String(
        minor?.minorName || minor?.name || minor?.fullName || "",
      ).trim();
      if (clientId && fullName) {
        participants.push({
          clientId,
          fullName,
          participationRole: "MINOR",
        });
      }
    });

    return participants;
  }

  private normalizeClientData(
    dto: CreateOrUpdateClientDto
  ): CreateOrUpdateClientDto {
    // Normalize idNumber based on idType
    const normalizedIdNumber = normalizeIdentification(dto.idType, dto.idNumber);
    
    return {
      fullName: String(dto.fullName || "").trim(),
      idNumber: normalizedIdNumber,
      idType: String(dto.idType || "").trim() || null,
      email: String(dto.email || "").trim().toLowerCase(),
      phone: String(dto.phone || "").trim() || null,
      emergencyContactName: String(dto.emergencyContactName || "").trim() || null,
      emergencyContactPhone: String(dto.emergencyContactPhone || "").trim() || null,
      nationality: String(dto.nationality || "").trim() || null,
      occupation: String(dto.occupation || "").trim() || null,
      maritalStatus: String(dto.maritalStatus || "").trim() || null,
      address: String(dto.address || "").trim() || null,
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
