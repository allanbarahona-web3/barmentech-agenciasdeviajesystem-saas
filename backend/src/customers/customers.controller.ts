import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { CustomersService } from "./customers.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ListCustomersDto } from "./dto/list-customers.dto";
import { CustomerListResponseDto } from "./dto/customer-list-response.dto";
import { CustomerProfileDto } from "./dto/customer-profile.dto";
import { CUSTOMER_ACCESS_ROLES } from "./constants/customer-roles.constant";

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
}
