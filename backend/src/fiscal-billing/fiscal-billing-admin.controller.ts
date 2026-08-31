import { Body, Controller, Get, Patch, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UpdateTenantBillingConfigurationDto } from "./dto/update-tenant-billing-configuration.dto";
import { FiscalBillingAdminService } from "./fiscal-billing-admin.service";

type AdminFiscalBillingRequest = {
  user: { tenantId: string; role: UserRole };
};

@Controller("admin/fiscal-billing")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class FiscalBillingAdminController {
  constructor(private readonly service: FiscalBillingAdminService) {}

  @Get("configuration")
  getConfiguration(@Req() request: AdminFiscalBillingRequest) {
    return this.service.getConfiguration(request.user.tenantId);
  }

  @Patch("configuration")
  updateConfiguration(
    @Req() request: AdminFiscalBillingRequest,
    @Body() body: UpdateTenantBillingConfigurationDto,
  ) {
    return this.service.updateConfiguration(request.user.tenantId, body);
  }
}
