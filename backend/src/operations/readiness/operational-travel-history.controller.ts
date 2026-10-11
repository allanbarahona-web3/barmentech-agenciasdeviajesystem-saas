import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { ListOperationalTravelHistoryDto } from "./dto/list-operational-travel-history.dto";
import { OperationalTravelHistoryService } from "./operational-travel-history.service";

type OperationsRequest = { user: { tenantId: string } };

@Controller("operations/travel-packages")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERACIONES)
export class OperationalTravelHistoryController {
  constructor(private readonly service: OperationalTravelHistoryService) {}

  @Get("history")
  list(@Req() request: OperationsRequest, @Query() query: ListOperationalTravelHistoryDto) {
    return this.service.list(request.user.tenantId, query);
  }

  @Get("history/:fulfillmentId")
  find(@Req() request: OperationsRequest, @Param("fulfillmentId") fulfillmentId: string) {
    return this.service.find(request.user.tenantId, fulfillmentId);
  }
}
