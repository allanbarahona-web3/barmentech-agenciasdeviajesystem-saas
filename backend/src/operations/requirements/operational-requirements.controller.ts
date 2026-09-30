import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import {
  CreateOperationalRequirementDto,
  ListOperationalRequirementsDto,
  OperationalRequirementPassengersDto,
  TransitionOperationalRequirementDto,
  UpdateOperationalRequirementDto,
} from "./dto/operational-requirements.dto";
import { OperationalRequirementsService } from "./operational-requirements.service";

type OperationsRequest = { user: { id: string; fullName: string; tenantId: string } };

@Controller("operations/travel-packages/:travelPackageId/requirements")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERACIONES, UserRole.AGENT)
export class OperationalRequirementsController {
  constructor(private readonly service: OperationalRequirementsService) {}

  @Get()
  list(
    @Req() request: OperationsRequest,
    @Param("travelPackageId") travelPackageId: string,
    @Query() query: ListOperationalRequirementsDto,
  ) {
    return this.service.list(request.user.tenantId, travelPackageId, query);
  }

  @Get(":requirementId")
  find(
    @Req() request: OperationsRequest,
    @Param("travelPackageId") travelPackageId: string,
    @Param("requirementId") requirementId: string,
  ) {
    return this.service.find(request.user.tenantId, travelPackageId, requirementId);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OPERACIONES)
  create(
    @Req() request: OperationsRequest,
    @Param("travelPackageId") travelPackageId: string,
    @Body() body: CreateOperationalRequirementDto,
  ) {
    return this.service.create(request.user.tenantId, travelPackageId, body, actor(request));
  }

  @Patch(":requirementId")
  @Roles(UserRole.ADMIN, UserRole.OPERACIONES)
  update(
    @Req() request: OperationsRequest,
    @Param("travelPackageId") travelPackageId: string,
    @Param("requirementId") requirementId: string,
    @Body() body: UpdateOperationalRequirementDto,
  ) {
    return this.service.update(request.user.tenantId, travelPackageId, requirementId, body, actor(request));
  }

  @Post(":requirementId/passengers")
  @Roles(UserRole.ADMIN, UserRole.OPERACIONES)
  addPassengers(
    @Req() request: OperationsRequest,
    @Param("travelPackageId") travelPackageId: string,
    @Param("requirementId") requirementId: string,
    @Body() body: OperationalRequirementPassengersDto,
  ) {
    return this.service.addPassengers(request.user.tenantId, travelPackageId, requirementId, body, actor(request));
  }

  @Delete(":requirementId/passengers")
  @Roles(UserRole.ADMIN, UserRole.OPERACIONES)
  removePassengers(
    @Req() request: OperationsRequest,
    @Param("travelPackageId") travelPackageId: string,
    @Param("requirementId") requirementId: string,
    @Body() body: OperationalRequirementPassengersDto,
  ) {
    return this.service.removePassengers(request.user.tenantId, travelPackageId, requirementId, body);
  }

  @Post(":requirementId/status")
  @Roles(UserRole.ADMIN, UserRole.OPERACIONES)
  transitionStatus(
    @Req() request: OperationsRequest,
    @Param("travelPackageId") travelPackageId: string,
    @Param("requirementId") requirementId: string,
    @Body() body: TransitionOperationalRequirementDto,
  ) {
    return this.service.transitionStatus(request.user.tenantId, travelPackageId, requirementId, body, actor(request));
  }
}

function actor(request: OperationsRequest) {
  return { userId: request.user.id, name: request.user.fullName };
}
