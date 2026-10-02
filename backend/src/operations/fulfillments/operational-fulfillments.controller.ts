import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import {
  CreateOperationalFulfillmentDto,
  ListOperationalFulfillmentsDto,
  OperationalFulfillmentPassengersDto,
  TransitionOperationalFulfillmentDto,
  UpdateOperationalFulfillmentDto,
} from "./dto/operational-fulfillments.dto";
import { OperationalFulfillmentsService } from "./operational-fulfillments.service";

type OperationsRequest = { user: { id: string; fullName: string; tenantId: string } };

@Controller("operations/travel-packages/:travelPackageId/requirements/:requirementId/fulfillments")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERACIONES, UserRole.AGENT)
export class OperationalFulfillmentsController {
  constructor(private readonly service: OperationalFulfillmentsService) {}

  @Get()
  list(@Req() request: OperationsRequest, @Param("travelPackageId") travelPackageId: string, @Param("requirementId") requirementId: string, @Query() query: ListOperationalFulfillmentsDto) {
    return this.service.list(request.user.tenantId, travelPackageId, requirementId, query);
  }

  @Get(":fulfillmentId")
  find(@Req() request: OperationsRequest, @Param("travelPackageId") travelPackageId: string, @Param("requirementId") requirementId: string, @Param("fulfillmentId") fulfillmentId: string) {
    return this.service.find(request.user.tenantId, travelPackageId, requirementId, fulfillmentId);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OPERACIONES)
  create(@Req() request: OperationsRequest, @Param("travelPackageId") travelPackageId: string, @Param("requirementId") requirementId: string, @Body() body: CreateOperationalFulfillmentDto) {
    return this.service.create(request.user.tenantId, travelPackageId, requirementId, body, actor(request));
  }

  @Patch(":fulfillmentId")
  @Roles(UserRole.ADMIN, UserRole.OPERACIONES)
  update(@Req() request: OperationsRequest, @Param("travelPackageId") travelPackageId: string, @Param("requirementId") requirementId: string, @Param("fulfillmentId") fulfillmentId: string, @Body() body: UpdateOperationalFulfillmentDto) {
    return this.service.update(request.user.tenantId, travelPackageId, requirementId, fulfillmentId, body, actor(request));
  }

  @Post(":fulfillmentId/passengers")
  @Roles(UserRole.ADMIN, UserRole.OPERACIONES)
  addPassengers(@Req() request: OperationsRequest, @Param("travelPackageId") travelPackageId: string, @Param("requirementId") requirementId: string, @Param("fulfillmentId") fulfillmentId: string, @Body() body: OperationalFulfillmentPassengersDto) {
    return this.service.addPassengers(request.user.tenantId, travelPackageId, requirementId, fulfillmentId, body, actor(request));
  }

  @Delete(":fulfillmentId/passengers")
  @Roles(UserRole.ADMIN, UserRole.OPERACIONES)
  removePassengers(@Req() request: OperationsRequest, @Param("travelPackageId") travelPackageId: string, @Param("requirementId") requirementId: string, @Param("fulfillmentId") fulfillmentId: string, @Body() body: OperationalFulfillmentPassengersDto) {
    return this.service.removePassengers(request.user.tenantId, travelPackageId, requirementId, fulfillmentId, body);
  }

  @Post(":fulfillmentId/status")
  @Roles(UserRole.ADMIN, UserRole.OPERACIONES)
  transitionStatus(@Req() request: OperationsRequest, @Param("travelPackageId") travelPackageId: string, @Param("requirementId") requirementId: string, @Param("fulfillmentId") fulfillmentId: string, @Body() body: TransitionOperationalFulfillmentDto) {
    return this.service.transitionStatus(request.user.tenantId, travelPackageId, requirementId, fulfillmentId, body, actor(request));
  }
}

function actor(request: OperationsRequest) {
  return { userId: request.user.id, name: request.user.fullName };
}
