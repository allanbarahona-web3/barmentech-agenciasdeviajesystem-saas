import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { ListOperationalRequirementsDto, TransitionOperationalRequirementDto, UpdateOperationalRequirementDto } from "./dto/operational-requirements.dto";
import { OperationalRequirementsService } from "./operational-requirements.service";

type OperationsRequest = { user: { id: string; fullName: string; tenantId: string } };

@Controller("operations/standalone/requirements")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERACIONES, UserRole.AGENT)
export class OperationalStandaloneRequirementsController {
  constructor(private readonly service: OperationalRequirementsService) {}

  @Get()
  list(@Req() request: OperationsRequest, @Query() query: ListOperationalRequirementsDto) {
    return this.service.listStandalone(request.user.tenantId, query);
  }

  @Get(":requirementId")
  find(@Req() request: OperationsRequest, @Param("requirementId") requirementId: string) {
    return this.service.findStandalone(request.user.tenantId, requirementId);
  }

  @Patch(":requirementId")
  @Roles(UserRole.ADMIN, UserRole.OPERACIONES)
  update(@Req() request: OperationsRequest, @Param("requirementId") requirementId: string, @Body() body: UpdateOperationalRequirementDto) {
    return this.service.updateStandalone(request.user.tenantId, requirementId, body, actor(request));
  }

  @Post(":requirementId/status")
  @Roles(UserRole.ADMIN, UserRole.OPERACIONES)
  transition(@Req() request: OperationsRequest, @Param("requirementId") requirementId: string, @Body() body: TransitionOperationalRequirementDto) {
    return this.service.transitionStandaloneStatus(request.user.tenantId, requirementId, body, actor(request));
  }
}

function actor(request: OperationsRequest) { return { userId: request.user.id, name: request.user.fullName }; }
