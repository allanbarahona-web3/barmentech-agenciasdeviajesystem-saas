import { Body, Controller, Get, Logger, Param, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
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
import { JobDispatcherService } from "../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../infrastructure/queue";
import { AIRFARE_PRICING_JOB_NAME, airfarePricingJobId } from "../airfare-pricing/airfare-pricing-job.constants";

type AirfareRequest = { user: { id: string; fullName: string; tenantId: string } };

@Controller("travel-costing/airfare")
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class AirfareDailyAuthorityController {
  private readonly logger = new Logger(AirfareDailyAuthorityController.name);
  constructor(private readonly service: AirfareDailyAuthorityService, private readonly evidence: CostEvidenceService, private readonly jobs: JobDispatcherService) {}

  @Post("components/:costComponentId/daily-authority")
  @Roles(UserRole.AGENT)
  @UseInterceptors(FileInterceptor("file"))
  async registerAgentInitial(@Req() req: AirfareRequest, @Param("costComponentId") costComponentId: string, @Body() dto: RegisterAirfareDailyAuthorityDto, @UploadedFile() file: CostEvidenceFile | undefined) {
    const preparedEvidence = await this.evidence.prepare(file);
    const registration = await this.service.registerAgentInitial(req.user.tenantId, costComponentId, dto, actor(req));
    await this.dispatchReprice(req.user.tenantId, registration.repriceRequestId);
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
  async override(@Req() req: AirfareRequest, @Param("airfareDailyAuthorityId") airfareDailyAuthorityId: string, @Body() dto: OverrideAirfareDailyAuthorityDto) {
    const result = await this.service.override(req.user.tenantId, airfareDailyAuthorityId, dto, actor(req));
    await this.dispatchReprice(req.user.tenantId, result.repriceRequestId);
    return result;
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

  private async dispatchReprice(tenantId: string, requestId: string) {
    try {
      await this.jobs.dispatch({ queueKey: PLATFORM_QUEUE_KEYS.AIRFARE_PRICING, jobName: AIRFARE_PRICING_JOB_NAME, payload: { tenantId, requestId, eventVersion: 1 }, metadata: { tenantId }, options: { jobId: airfarePricingJobId(requestId), attempts: 3, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: true, removeOnFail: false } });
    } catch (error) {
      this.logger.error(`AIRFARE_PRICING_DISPATCH_FAILED tenantId=${tenantId} requestId=${requestId} error=${error instanceof Error ? error.name : "UnknownError"}`);
    }
  }
}

function actor(req: AirfareRequest) {
  return { userId: req.user.id, name: req.user.fullName };
}
