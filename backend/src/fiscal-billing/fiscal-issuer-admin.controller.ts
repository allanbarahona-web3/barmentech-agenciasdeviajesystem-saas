import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import {
  CreateFiscalIssuerDto,
  UpdateFiscalIssuerDto,
  UpdateFiscalIssuerStatusDto,
  AssignFiscalIssuerEconomicActivityDto,
} from "./dto/fiscal-issuer-admin.dto";
import { FiscalIssuerAdminService } from "./fiscal-issuer-admin.service";

type FiscalIssuerAdminRequest = {
  user: { tenantId: string; role: UserRole };
};

@Controller("admin/fiscal-billing/issuers")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class FiscalIssuerAdminController {
  constructor(private readonly service: FiscalIssuerAdminService) {}

  @Get()
  list(@Req() request: FiscalIssuerAdminRequest) {
    return this.service.list(request.user.tenantId);
  }

  @Get(":issuerId")
  find(
    @Req() request: FiscalIssuerAdminRequest,
    @Param("issuerId") issuerId: string,
  ) {
    return this.service.find(request.user.tenantId, issuerId);
  }

  @Get(":issuerId/economic-activities/available")
  availableEconomicActivities(
    @Req() request: FiscalIssuerAdminRequest,
    @Param("issuerId") issuerId: string,
  ) {
    return this.service.availableEconomicActivities(
      request.user.tenantId,
      issuerId,
    );
  }

  @Get(":issuerId/economic-activities")
  listEconomicActivities(@Req() request: FiscalIssuerAdminRequest, @Param("issuerId") issuerId: string) {
    return this.service.listEconomicActivities(request.user.tenantId, issuerId);
  }

  @Post(":issuerId/economic-activities")
  assignEconomicActivity(@Req() request: FiscalIssuerAdminRequest, @Param("issuerId") issuerId: string, @Body() body: AssignFiscalIssuerEconomicActivityDto) {
    return this.service.assignEconomicActivity(request.user.tenantId, issuerId, body.code);
  }

  @Patch(":issuerId/economic-activities/:activityAssignmentId/primary")
  selectPrimaryEconomicActivity(@Req() request: FiscalIssuerAdminRequest, @Param("issuerId") issuerId: string, @Param("activityAssignmentId") assignmentId: string) {
    return this.service.selectPrimaryEconomicActivity(request.user.tenantId, issuerId, assignmentId);
  }

  @Delete(":issuerId/economic-activities/:activityAssignmentId")
  @HttpCode(204)
  deleteEconomicActivity(@Req() request: FiscalIssuerAdminRequest, @Param("issuerId") issuerId: string, @Param("activityAssignmentId") assignmentId: string) {
    return this.service.deleteEconomicActivity(request.user.tenantId, issuerId, assignmentId);
  }

  @Post()
  create(
    @Req() request: FiscalIssuerAdminRequest,
    @Body() body: CreateFiscalIssuerDto,
  ) {
    return this.service.create(request.user.tenantId, body);
  }

  @Patch(":issuerId")
  update(
    @Req() request: FiscalIssuerAdminRequest,
    @Param("issuerId") issuerId: string,
    @Body() body: UpdateFiscalIssuerDto,
  ) {
    return this.service.update(request.user.tenantId, issuerId, body);
  }

  @Patch(":issuerId/status")
  setStatus(
    @Req() request: FiscalIssuerAdminRequest,
    @Param("issuerId") issuerId: string,
    @Body() body: UpdateFiscalIssuerStatusDto,
  ) {
    return this.service.setStatus(
      request.user.tenantId,
      issuerId,
      body.isActive,
    );
  }
}
