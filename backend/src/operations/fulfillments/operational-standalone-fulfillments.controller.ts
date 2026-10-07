import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { CreateStandaloneOperationalFulfillmentDto, ListOperationalFulfillmentsDto, OperationalFulfillmentPassengersDto, TransitionOperationalFulfillmentDto, UpdateOperationalFulfillmentDto } from "./dto/operational-fulfillments.dto";
import { OperationalFulfillmentsService } from "./operational-fulfillments.service";

type OperationsRequest = { user: { id: string; fullName: string; tenantId: string } };

@Controller("operations/standalone/requirements/:requirementId/fulfillments")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERACIONES, UserRole.AGENT)
export class OperationalStandaloneFulfillmentsController {
  constructor(private readonly service: OperationalFulfillmentsService) {}

  @Get()
  list(@Req() request: OperationsRequest, @Param("requirementId") requirementId: string, @Query() query: ListOperationalFulfillmentsDto) { return this.service.listStandalone(request.user.tenantId, requirementId, query); }
  @Get(":fulfillmentId")
  find(@Req() request: OperationsRequest, @Param("requirementId") requirementId: string, @Param("fulfillmentId") fulfillmentId: string) { return this.service.findStandalone(request.user.tenantId, requirementId, fulfillmentId); }
  @Post()
  @Roles(UserRole.ADMIN, UserRole.OPERACIONES)
  create(@Req() request: OperationsRequest, @Param("requirementId") requirementId: string, @Body() body: CreateStandaloneOperationalFulfillmentDto) { return this.service.createStandalone(request.user.tenantId, requirementId, body, actor(request)); }
  @Patch(":fulfillmentId")
  @Roles(UserRole.ADMIN, UserRole.OPERACIONES)
  update(@Req() request: OperationsRequest, @Param("requirementId") requirementId: string, @Param("fulfillmentId") fulfillmentId: string, @Body() body: UpdateOperationalFulfillmentDto) { return this.service.updateStandalone(request.user.tenantId, requirementId, fulfillmentId, body, actor(request)); }
  @Post(":fulfillmentId/status")
  @Roles(UserRole.ADMIN, UserRole.OPERACIONES)
  transition(@Req() request: OperationsRequest, @Param("requirementId") requirementId: string, @Param("fulfillmentId") fulfillmentId: string, @Body() body: TransitionOperationalFulfillmentDto) { return this.service.transitionStandaloneStatus(request.user.tenantId, requirementId, fulfillmentId, body, actor(request)); }
  @Post(":fulfillmentId/passengers")
  @Roles(UserRole.ADMIN, UserRole.OPERACIONES)
  addPassengers(@Req() request: OperationsRequest, @Param("requirementId") requirementId: string, @Param("fulfillmentId") fulfillmentId: string, @Body() _body: OperationalFulfillmentPassengersDto) { return this.service.rejectStandalonePassengerAssignment(request.user.tenantId, requirementId, fulfillmentId); }
  @Delete(":fulfillmentId/passengers")
  @Roles(UserRole.ADMIN, UserRole.OPERACIONES)
  removePassengers(@Req() request: OperationsRequest, @Param("requirementId") requirementId: string, @Param("fulfillmentId") fulfillmentId: string, @Body() _body: OperationalFulfillmentPassengersDto) { return this.service.rejectStandalonePassengerAssignment(request.user.tenantId, requirementId, fulfillmentId); }
}

function actor(request: OperationsRequest) { return { userId: request.user.id, name: request.user.fullName }; }
