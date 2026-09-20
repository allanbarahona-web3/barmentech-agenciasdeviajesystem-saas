import { Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { TenantGuard } from "../tenant/tenant.guard";
import { TravelPricingService } from "./travel-pricing.service";

type TravelPricingRequest = { user: { id: string; fullName: string; tenantId: string } };

@Controller("travel-pricing")
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class TravelPricingController {
  constructor(private readonly service: TravelPricingService) {}

  @Get("projects/:costingProjectId/publication")
  getPublicationContext(@Req() req: TravelPricingRequest, @Param("costingProjectId") costingProjectId: string) {
    return this.service.getPublicationContext(req.user.tenantId, costingProjectId);
  }

  @Post("calculations/:pricingCalculationVersionId/publish")
  publish(@Req() req: TravelPricingRequest, @Param("pricingCalculationVersionId") pricingCalculationVersionId: string) {
    return this.service.publish(req.user.tenantId, pricingCalculationVersionId, { userId: req.user.id, name: req.user.fullName });
  }
}
