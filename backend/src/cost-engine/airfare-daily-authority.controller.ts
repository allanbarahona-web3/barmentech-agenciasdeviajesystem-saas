import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { TenantGuard } from "../tenant/tenant.guard";
import { AirfareDailyAuthorityService } from "./airfare-daily-authority.service";
import { OverrideAirfareDailyAuthorityDto, RegisterAirfareDailyAuthorityDto } from "./dto/airfare-daily-authority.dto";
import { ListCostComponentsDto } from "./dto/cost-engine.dto";

type AirfareRequest = { user: { id: string; fullName: string; tenantId: string } };

@Controller("travel-costing/airfare")
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class AirfareDailyAuthorityController {
  constructor(private readonly service: AirfareDailyAuthorityService) {}

  @Post("components/:costComponentId/daily-authority")
  @Roles(UserRole.AGENT)
  registerAgentInitial(@Req() req: AirfareRequest, @Param("costComponentId") costComponentId: string, @Body() dto: RegisterAirfareDailyAuthorityDto) {
    return this.service.registerAgentInitial(req.user.tenantId, costComponentId, dto, actor(req));
  }

  @Post("daily-authorities/:airfareDailyAuthorityId/overrides")
  @Roles(UserRole.ADMIN)
  override(@Req() req: AirfareRequest, @Param("airfareDailyAuthorityId") airfareDailyAuthorityId: string, @Body() dto: OverrideAirfareDailyAuthorityDto) {
    return this.service.override(req.user.tenantId, airfareDailyAuthorityId, dto, actor(req));
  }

  @Get("daily-tasks")
  @Roles(UserRole.AGENT)
  listDailyTasks(@Req() req: AirfareRequest, @Query() query: ListCostComponentsDto) {
    return this.service.listAgentDailyTasks(req.user.tenantId, query.page ?? 1, query.pageSize ?? 20);
  }

  @Get("daily-status")
  @Roles(UserRole.AGENT)
  getDailyStatus(@Req() req: AirfareRequest) {
    return this.service.getAgentDailyStatus(req.user.tenantId);
  }

  @Get("components/:costComponentId/history")
  @Roles(UserRole.ADMIN)
  listComponentHistory(@Req() req: AirfareRequest, @Param("costComponentId") costComponentId: string, @Query() query: ListCostComponentsDto) {
    return this.service.listComponentHistory(req.user.tenantId, costComponentId, query.page ?? 1, query.pageSize ?? 20);
  }

  @Get("projects/:costingProjectId/history")
  @Roles(UserRole.ADMIN)
  listProjectHistory(@Req() req: AirfareRequest, @Param("costingProjectId") costingProjectId: string, @Query() query: ListCostComponentsDto) {
    return this.service.listProjectHistory(req.user.tenantId, costingProjectId, query.page ?? 1, query.pageSize ?? 20);
  }
}

function actor(req: AirfareRequest) {
  return { userId: req.user.id, name: req.user.fullName };
}
