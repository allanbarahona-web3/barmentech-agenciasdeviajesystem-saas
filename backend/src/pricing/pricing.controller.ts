import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { TenantGuard } from "../tenant/tenant.guard";
import { ListPricingCalculationVersionsDto, UpdatePricingConfigurationDto } from "./dto/pricing.dto";
import { PricingService } from "./pricing.service";

type PricingRequest = { user: { id: string; fullName: string; tenantId: string } };

@Controller("pricing")
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class PricingController {
  constructor(private readonly service: PricingService) {}

  @Get("projects/:costingProjectId/configuration")
  resolveConfiguration(@Req() req: PricingRequest, @Param("costingProjectId") costingProjectId: string) {
    return this.service.resolveConfiguration(req.user.tenantId, costingProjectId, actor(req));
  }

  @Patch("projects/:costingProjectId/configuration")
  updateConfiguration(@Req() req: PricingRequest, @Param("costingProjectId") costingProjectId: string, @Body() dto: UpdatePricingConfigurationDto) {
    return this.service.updateConfiguration(req.user.tenantId, costingProjectId, dto, actor(req));
  }

  @Post("projects/:costingProjectId/calculations")
  calculate(@Req() req: PricingRequest, @Param("costingProjectId") costingProjectId: string) {
    return this.service.calculate(req.user.tenantId, costingProjectId, actor(req));
  }

  @Get("projects/:costingProjectId/calculations/latest")
  getLatest(@Req() req: PricingRequest, @Param("costingProjectId") costingProjectId: string) {
    return this.service.getLatestCalculation(req.user.tenantId, costingProjectId);
  }

  @Get("projects/:costingProjectId/calculations/approved")
  getLatestApproved(@Req() req: PricingRequest, @Param("costingProjectId") costingProjectId: string) {
    return this.service.getLatestApprovedCalculation(req.user.tenantId, costingProjectId);
  }

  @Get("projects/:costingProjectId/calculations")
  list(@Req() req: PricingRequest, @Param("costingProjectId") costingProjectId: string, @Query() query: ListPricingCalculationVersionsDto) {
    return this.service.listCalculations(req.user.tenantId, costingProjectId, query.page ?? 1, query.pageSize ?? 20);
  }

  @Get("calculations/:pricingCalculationVersionId")
  getOne(@Req() req: PricingRequest, @Param("pricingCalculationVersionId") pricingCalculationVersionId: string) {
    return this.service.getCalculation(req.user.tenantId, pricingCalculationVersionId);
  }

  @Post("calculations/:pricingCalculationVersionId/approve")
  approve(@Req() req: PricingRequest, @Param("pricingCalculationVersionId") pricingCalculationVersionId: string) {
    return this.service.approveCalculation(req.user.tenantId, pricingCalculationVersionId, actor(req));
  }
}

function actor(req: PricingRequest) {
  return { userId: req.user.id, name: req.user.fullName };
}
