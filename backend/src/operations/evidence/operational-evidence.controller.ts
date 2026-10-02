import { Body, Controller, Delete, Get, Param, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { CreateOperationalEvidenceDto, ListOperationalEvidenceDto } from "./dto/operational-evidence.dto";
import { MAX_OPERATIONAL_EVIDENCE_BYTES, OperationalEvidenceFile, OperationalEvidenceService } from "./operational-evidence.service";

type OperationsRequest = { user: { id: string; fullName: string; tenantId: string } };

@Controller("operations/travel-packages/:travelPackageId/requirements/:requirementId/fulfillments/:fulfillmentId/evidence")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERACIONES, UserRole.AGENT)
export class OperationalEvidenceController {
  constructor(private readonly service: OperationalEvidenceService) {}

  @Get()
  list(@Req() request: OperationsRequest, @Param("travelPackageId") travelPackageId: string, @Param("requirementId") requirementId: string, @Param("fulfillmentId") fulfillmentId: string, @Query() query: ListOperationalEvidenceDto) {
    return this.service.list(request.user.tenantId, travelPackageId, requirementId, fulfillmentId, query);
  }

  @Get(":evidenceId")
  find(@Req() request: OperationsRequest, @Param("travelPackageId") travelPackageId: string, @Param("requirementId") requirementId: string, @Param("fulfillmentId") fulfillmentId: string, @Param("evidenceId") evidenceId: string) {
    return this.service.find(request.user.tenantId, travelPackageId, requirementId, fulfillmentId, evidenceId);
  }

  @Get(":evidenceId/access")
  getAccess(@Req() request: OperationsRequest, @Param("travelPackageId") travelPackageId: string, @Param("requirementId") requirementId: string, @Param("fulfillmentId") fulfillmentId: string, @Param("evidenceId") evidenceId: string) {
    return this.service.getAccess(request.user.tenantId, travelPackageId, requirementId, fulfillmentId, evidenceId);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OPERACIONES)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_OPERATIONAL_EVIDENCE_BYTES } }))
  upload(@Req() request: OperationsRequest, @Param("travelPackageId") travelPackageId: string, @Param("requirementId") requirementId: string, @Param("fulfillmentId") fulfillmentId: string, @Body() body: CreateOperationalEvidenceDto, @UploadedFile() file: OperationalEvidenceFile | undefined) {
    return this.service.upload(request.user.tenantId, travelPackageId, requirementId, fulfillmentId, body, file, { userId: request.user.id, name: request.user.fullName });
  }

  @Delete(":evidenceId")
  @Roles(UserRole.ADMIN, UserRole.OPERACIONES)
  remove(@Req() request: OperationsRequest, @Param("travelPackageId") travelPackageId: string, @Param("requirementId") requirementId: string, @Param("fulfillmentId") fulfillmentId: string, @Param("evidenceId") evidenceId: string) {
    return this.service.remove(request.user.tenantId, travelPackageId, requirementId, fulfillmentId, evidenceId);
  }
}
