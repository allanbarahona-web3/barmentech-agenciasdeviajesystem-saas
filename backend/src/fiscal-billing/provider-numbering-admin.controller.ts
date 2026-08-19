import { Controller, Param, Post, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ProviderNumberingAdminService } from "./provider-numbering-admin.service";

type ProviderNumberingAdminRequest = {
  user: { tenantId: string; role: UserRole };
};

@Controller("admin/fiscal-billing/issuers")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ProviderNumberingAdminController {
  constructor(private readonly service: ProviderNumberingAdminService) {}

  @Post(":issuerId/provider-numbering/integrator")
  configureIntegratorMode(
    @Req() request: ProviderNumberingAdminRequest,
    @Param("issuerId") issuerId: string,
  ) {
    return this.service.configureAndVerify(request.user.tenantId, issuerId);
  }
}
