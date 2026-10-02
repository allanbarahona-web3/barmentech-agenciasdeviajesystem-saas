import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { ListOperationalPassengerOverviewDto } from "./dto/list-operational-passenger-overview.dto";
import { OperationalPassengerOverviewService } from "./operational-passenger-overview.service";

@Controller("operations/travel-packages/:travelPackageId")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERACIONES)
export class OperationalPassengerOverviewController {
  constructor(private readonly service: OperationalPassengerOverviewService) {}
  @Get("passenger-overview")
  list(@Req() req: { user: { tenantId: string } }, @Param("travelPackageId") travelPackageId: string, @Query() query: ListOperationalPassengerOverviewDto) { return this.service.list(req.user.tenantId, travelPackageId, query); }
}
