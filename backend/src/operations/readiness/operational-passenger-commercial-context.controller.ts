import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { OperationalPassengerCommercialContextService } from "./operational-passenger-commercial-context.service";

@Controller("operations/travel-packages/:travelPackageId/passengers")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERACIONES)
export class OperationalPassengerCommercialContextController {
  constructor(private readonly service: OperationalPassengerCommercialContextService) {}

  @Get(":participantId/commercial-context")
  get(@Req() req: { user: { tenantId: string } }, @Param("travelPackageId") travelPackageId: string, @Param("participantId") participantId: string) { return this.service.get(req.user.tenantId, travelPackageId, participantId); }
}
