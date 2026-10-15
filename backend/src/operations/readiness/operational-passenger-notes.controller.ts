import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { OperationalPassengerNotesService } from "./operational-passenger-notes.service";

@Controller("operations/travel-packages/:travelPackageId/passengers")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERACIONES)
export class OperationalPassengerNotesController {
  constructor(private readonly service: OperationalPassengerNotesService) {}

  @Get(":participantId/operational-notes")
  list(
    @Req() req: { user: { tenantId: string } },
    @Param("travelPackageId") travelPackageId: string,
    @Param("participantId") participantId: string,
  ) {
    return this.service.list(req.user.tenantId, travelPackageId, participantId);
  }
}
