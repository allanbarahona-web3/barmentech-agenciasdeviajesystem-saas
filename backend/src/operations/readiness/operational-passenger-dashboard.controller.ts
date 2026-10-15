import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { ListOperationalPassengerDashboardDto } from "./dto/list-operational-passenger-dashboard.dto";
import { OperationalPassengerDashboardService } from "./operational-passenger-dashboard.service";

@Controller("operations/travel-packages/:travelPackageId")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERACIONES)
export class OperationalPassengerDashboardController {
  constructor(private readonly service: OperationalPassengerDashboardService) {}

  @Get("passenger-dashboard")
  list(@Req() req: { user: { tenantId: string } }, @Param("travelPackageId") travelPackageId: string, @Query() query: ListOperationalPassengerDashboardDto) {
    return this.service.list(req.user.tenantId, travelPackageId, query);
  }
}
