import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { CustomersService } from "./customers.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ListCustomersDto } from "./dto/list-customers.dto";
import { CustomerListResponseDto } from "./dto/customer-list-response.dto";
import { CustomerProfileDto } from "./dto/customer-profile.dto";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { ValidateCustomerIdentityDto } from "./dto/validate-customer-identity.dto";
import { CustomerIdentityValidationResultDto } from "./dto/customer-identity-validation-result.dto";
import { CUSTOMER_ACCESS_ROLES } from "./constants/customer-roles.constant";
import { Client } from "@prisma/client";

/**
 * CustomersController
 * 
 * Purpose:
 * - Expose customer operations via REST
 * - Enforce authentication and authorization
 * - Delegate business logic to CustomersService
 */
@Controller("customers")
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  /**
   * GET /customers
   * 
   * List customers with pagination and search.
   * Protected endpoint - requires customer access roles (ADMIN, AGENT, FACTURACION_COBROS).
   * Enforces tenant isolation automatically via user's tenantId.
   * 
   * Query parameters:
   * - page: Page number (default: 1)
   * - pageSize: Items per page (default: 20, max: 100)
   * - search: Search term (searches fullName, idNumber, email)
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...CUSTOMER_ACCESS_ROLES)
  @Get()
  listCustomers(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string; tenantId: string };
    },
    @Query() query: ListCustomersDto
  ): Promise<CustomerListResponseDto> {
    return this.customersService.listCustomers(req.user.tenantId, query);
  }

  /**
   * GET /customers/:id
   * 
   * Get complete customer profile with aggregated data.
   * Protected endpoint - requires customer access roles (ADMIN, AGENT, FACTURACION_COBROS).
   * Enforces tenant isolation automatically via user's tenantId.
   * Returns 404 if customer not found in tenant.
   * 
   * Includes:
   * - Customer basic information
   * - Customer contracts (lightweight)
   * - Financial summary (counts only)
   * - Statistics
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...CUSTOMER_ACCESS_ROLES)
  @Get(":id")
  getCustomerProfile(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string; tenantId: string };
    },
    @Param("id") customerId: string
  ): Promise<CustomerProfileDto> {
    return this.customersService.getCustomerProfile(req.user.tenantId, customerId);
  }

  /**
   * POST /customers
   * 
   * Create a new customer.
   * Protected endpoint - requires customer access roles (ADMIN, AGENT, FACTURACION_COBROS).
   * Enforces tenant isolation automatically via user's tenantId.
   * 
   * Business Rules:
   * - Reuses existing identity validation logic from upsertClient
   * - If customer with same idNumber exists and identity matches, updates mutable fields
   * - If customer with same idNumber exists but identity conflicts, returns 409 Conflict
   * - Creates new customer if idNumber doesn't exist
   * 
   * Required fields:
   * - fullName
   * - idNumber
   * - email
   * 
   * Optional fields:
   * - phone
   * - emergencyContactName
   * - emergencyContactPhone
   * 
   * Returns the created or updated customer record.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...CUSTOMER_ACCESS_ROLES)
  @Post()
  createCustomer(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string; tenantId: string };
    },
    @Body() dto: CreateCustomerDto
  ): Promise<Client> {
    return this.customersService.createCustomer(req.user.tenantId, dto);
  }

  /**
   * PATCH /customers/:id
   * 
   * Update customer information.
   * Protected endpoint - requires customer access roles (ADMIN, AGENT, FACTURACION_COBROS).
   * Enforces tenant isolation automatically via user's tenantId.
   * Returns 404 if customer not found in tenant.
   * Supports partial updates - only provided fields are updated.
   * 
   * Editable fields:
   * - fullName
   * - email
   * - phone
   * - emergencyContactName
   * - emergencyContactPhone
   * 
   * Returns complete customer profile after update.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...CUSTOMER_ACCESS_ROLES)
  @Patch(":id")
  updateCustomer(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string; tenantId: string };
    },
    @Param("id") customerId: string,
    @Body() dto: UpdateCustomerDto
  ): Promise<CustomerProfileDto> {
    return this.customersService.updateCustomer(req.user.tenantId, customerId, dto);
  }

  /**
   * POST /customers/validate-identity
   * 
   * Validate customer identity before contract creation.
   * Protected endpoint - requires customer access roles (ADMIN, AGENT, FACTURACION_COBROS).
   * Enforces tenant isolation automatically via user's tenantId.
   * 
   * Purpose:
   * - Early validation to prevent identity conflicts in contract form
   * - Checks if idNumber exists and whether fullName matches
   * - Provides immediate UX feedback without completing entire form
   * 
   * Returns:
   * - valid: true - Identity is valid (no conflict or matches existing)
   * - valid: false - Identity conflict detected
   * - message: User-friendly Spanish message
   * - existingCustomer: Optional data about existing customer
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...CUSTOMER_ACCESS_ROLES)
  @Post("validate-identity")
  validateCustomerIdentity(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string; tenantId: string };
    },
    @Body() dto: ValidateCustomerIdentityDto
  ): Promise<CustomerIdentityValidationResultDto> {
    return this.customersService.validateCustomerIdentity(req.user.tenantId, dto);
  }
}

