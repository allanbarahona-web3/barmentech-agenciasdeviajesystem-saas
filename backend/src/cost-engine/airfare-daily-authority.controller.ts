import { Body, Controller, Get, Param, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { TenantGuard } from "../tenant/tenant.guard";
import { AirfareDailyAuthorityService } from "./airfare-daily-authority.service";
import { CostEvidenceService, type CostEvidenceFile } from "./cost-evidence.service";
import { OverrideAirfareDailyAuthorityDto, RegisterAirfareDailyAuthorityDto } from "./dto/airfare-daily-authority.dto";
import { ListCostComponentsDto } from "./dto/cost-engine.dto";

type AirfareRequest = { user: { id: string; fullName: string; tenantId: string } };

@Controller("travel-costing/airfare")
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class AirfareDailyAuthorityController {
  constructor(private readonly service: AirfareDailyAuthorityService, private readonly evidence: CostEvidenceService) {}

  @Post("components/:costComponentId/daily-authority")
  @Roles(UserRole.AGENT)
  @UseInterceptors(FileInterceptor("file"))
  async registerAgentInitial(@Req() req: AirfareRequest, @Param("costComponentId") costComponentId: string, @Body() dto: RegisterAirfareDailyAuthorityDto, @UploadedFile() file: CostEvidenceFile | undefined) {
    const preparedEvidence = await this.evidence.prepare(file);
    const registration = await this.service.registerAgentInitial(req.user.tenantId, costComponentId, dto, actor(req));
    try {
      await this.evidence.uploadPreparedAgentInitial(req.user.tenantId, registration.snapshotId, preparedEvidence, actor(req));
      return { ...registration, evidenceAttached: true };
    } catch {
      return {
        ...registration,
        evidenceAttached: false,
        evidenceUploadError: "La tarifa fue registrada, pero no se pudo adjuntar el comprobante. Reinténtalo antes de continuar.",
      };
    }
  }

  @Post("snapshots/:costSnapshotId/evidence")
  @Roles(UserRole.AGENT)
  @UseInterceptors(FileInterceptor("file"))
  uploadAgentInitialEvidence(@Req() req: AirfareRequest, @Param("costSnapshotId") costSnapshotId: string, @UploadedFile() file: CostEvidenceFile | undefined) {
    return this.evidence.uploadAgentInitial(req.user.tenantId, costSnapshotId, file, actor(req));
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
