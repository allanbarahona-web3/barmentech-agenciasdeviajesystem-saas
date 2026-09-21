import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import {
  CreateTenantPricingPolicyDto,
  ListTenantPricingPoliciesDto,
  UpdateTenantPricingPolicyDefaultDto,
  UpdateTenantPricingPolicyDto,
  UpdateTenantPricingPolicyStatusDto,
} from "./dto/tenant-pricing-policy.dto";
import { TenantPricingPolicyService } from "./tenant-pricing-policy.service";

type AdminRequest = { user: { id: string; fullName: string; tenantId: string } };

@Controller("admin/pricing-policies")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class TenantPricingPolicyController {
  constructor(private readonly service: TenantPricingPolicyService) {}

  @Get()
  list(@Req() request: AdminRequest, @Query() query: ListTenantPricingPoliciesDto) {
    return this.service.list(
      request.user.tenantId,
      query.active === undefined ? undefined : query.active === "true",
      query.page ?? 1,
      query.pageSize ?? 20,
    );
  }

  @Get(":policyId")
  find(@Req() request: AdminRequest, @Param("policyId") policyId: string) {
    return this.service.find(request.user.tenantId, policyId);
  }

  @Post()
  create(@Req() request: AdminRequest, @Body() body: CreateTenantPricingPolicyDto) {
    return this.service.create(request.user.tenantId, body, actor(request));
  }

  @Patch(":policyId")
  update(@Req() request: AdminRequest, @Param("policyId") policyId: string, @Body() body: UpdateTenantPricingPolicyDto) {
    return this.service.update(request.user.tenantId, policyId, body, actor(request));
  }

  @Patch(":policyId/status")
  setStatus(@Req() request: AdminRequest, @Param("policyId") policyId: string, @Body() body: UpdateTenantPricingPolicyStatusDto) {
    return this.service.setStatus(request.user.tenantId, policyId, body.active, actor(request));
  }

  @Patch(":policyId/default")
  setDefault(@Req() request: AdminRequest, @Param("policyId") policyId: string, @Body() body: UpdateTenantPricingPolicyDefaultDto) {
    return this.service.setDefaultForCustomQuotations(
      request.user.tenantId,
      policyId,
      body.isDefaultForCustomQuotations,
      actor(request),
    );
  }
}

function actor(request: AdminRequest) {
  return { userId: request.user.id, name: request.user.fullName };
}
