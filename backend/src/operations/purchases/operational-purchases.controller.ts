import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { CreateOperationalPurchaseDto, ListOperationalPurchasesDto, UpdateOperationalPurchaseDto } from "./dto/operational-purchases.dto";
import { OperationalPurchasesService } from "./operational-purchases.service";

type OperationsRequest = { user: { id: string; fullName: string; tenantId: string } };

@Controller("operations/travel-packages/:travelPackageId/requirements/:requirementId/fulfillments/:fulfillmentId/purchases")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERACIONES, UserRole.AGENT)
export class OperationalPurchasesController {
  constructor(private readonly service: OperationalPurchasesService) {}

  @Get()
  list(@Req() request: OperationsRequest, @Param("travelPackageId") travelPackageId: string, @Param("requirementId") requirementId: string, @Param("fulfillmentId") fulfillmentId: string, @Query() query: ListOperationalPurchasesDto) {
    return this.service.list(request.user.tenantId, travelPackageId, requirementId, fulfillmentId, query);
  }

  @Get(":purchaseId")
  find(@Req() request: OperationsRequest, @Param("travelPackageId") travelPackageId: string, @Param("requirementId") requirementId: string, @Param("fulfillmentId") fulfillmentId: string, @Param("purchaseId") purchaseId: string) {
    return this.service.find(request.user.tenantId, travelPackageId, requirementId, fulfillmentId, purchaseId);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OPERACIONES)
  create(@Req() request: OperationsRequest, @Param("travelPackageId") travelPackageId: string, @Param("requirementId") requirementId: string, @Param("fulfillmentId") fulfillmentId: string, @Body() body: CreateOperationalPurchaseDto) {
    return this.service.create(request.user.tenantId, travelPackageId, requirementId, fulfillmentId, body, actor(request));
  }

  @Patch(":purchaseId")
  @Roles(UserRole.ADMIN, UserRole.OPERACIONES)
  update(@Req() request: OperationsRequest, @Param("travelPackageId") travelPackageId: string, @Param("requirementId") requirementId: string, @Param("fulfillmentId") fulfillmentId: string, @Param("purchaseId") purchaseId: string, @Body() body: UpdateOperationalPurchaseDto) {
    return this.service.update(request.user.tenantId, travelPackageId, requirementId, fulfillmentId, purchaseId, body, actor(request));
  }
}

function actor(request: OperationsRequest) { return { userId: request.user.id, name: request.user.fullName }; }
