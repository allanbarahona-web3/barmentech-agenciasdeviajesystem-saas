import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { CreateOperationalPurchaseDto, ListOperationalPurchasesDto, UpdateOperationalPurchaseDto } from "./dto/operational-purchases.dto";
import { OperationalPurchasesService } from "./operational-purchases.service";

type OperationsRequest = { user: { id: string; fullName: string; tenantId: string } };

@Controller("operations/standalone/requirements/:requirementId/fulfillments/:fulfillmentId/purchases")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERACIONES, UserRole.AGENT)
export class OperationalStandalonePurchasesController {
  constructor(private readonly service: OperationalPurchasesService) {}
  @Get()
  list(@Req() request: OperationsRequest, @Param("requirementId") requirementId: string, @Param("fulfillmentId") fulfillmentId: string, @Query() query: ListOperationalPurchasesDto) { return this.service.listStandalone(request.user.tenantId, requirementId, fulfillmentId, query); }
  @Get(":purchaseId")
  find(@Req() request: OperationsRequest, @Param("requirementId") requirementId: string, @Param("fulfillmentId") fulfillmentId: string, @Param("purchaseId") purchaseId: string) { return this.service.findStandalone(request.user.tenantId, requirementId, fulfillmentId, purchaseId); }
  @Post()
  @Roles(UserRole.ADMIN, UserRole.OPERACIONES)
  create(@Req() request: OperationsRequest, @Param("requirementId") requirementId: string, @Param("fulfillmentId") fulfillmentId: string, @Body() body: CreateOperationalPurchaseDto) { return this.service.createStandalone(request.user.tenantId, requirementId, fulfillmentId, body, actor(request)); }
  @Patch(":purchaseId")
  @Roles(UserRole.ADMIN, UserRole.OPERACIONES)
  update(@Req() request: OperationsRequest, @Param("requirementId") requirementId: string, @Param("fulfillmentId") fulfillmentId: string, @Param("purchaseId") purchaseId: string, @Body() body: UpdateOperationalPurchaseDto) { return this.service.updateStandalone(request.user.tenantId, requirementId, fulfillmentId, purchaseId, body, actor(request)); }
}

function actor(request: OperationsRequest) { return { userId: request.user.id, name: request.user.fullName }; }
