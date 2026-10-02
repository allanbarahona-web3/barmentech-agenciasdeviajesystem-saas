import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { ListOperationalPassengerRosterDto } from "./dto/list-operational-passenger-roster.dto";
import { OperationalPassengerRosterService } from "./operational-passenger-roster.service";

@Controller("operations/travel-packages/:travelPackageId")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERACIONES)
export class OperationalPassengerRosterController {
  constructor(private readonly service: OperationalPassengerRosterService) {}

  @Get("passenger-roster")
  list(@Req() req: { user: { tenantId: string } }, @Param("travelPackageId") travelPackageId: string, @Query() query: ListOperationalPassengerRosterDto) { return this.service.list(req.user.tenantId, travelPackageId, query); }
}
