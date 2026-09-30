import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { PassengerMatrixQueryDto } from "./dto/operational-readiness.dto";
import { OperationalReadinessService } from "./operational-readiness.service";

type OperationsRequest = { user: { tenantId: string } };

@Controller("operations/travel-packages/:travelPackageId")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERACIONES, UserRole.AGENT)
export class OperationalReadinessController {
  constructor(private readonly service: OperationalReadinessService) {}

  @Get("readiness")
  readiness(@Req() request: OperationsRequest, @Param("travelPackageId") travelPackageId: string) {
    return this.service.readiness(request.user.tenantId, travelPackageId);
  }

  @Get("passenger-matrix")
  passengerMatrix(@Req() request: OperationsRequest, @Param("travelPackageId") travelPackageId: string, @Query() query: PassengerMatrixQueryDto) {
    return this.service.passengerMatrix(request.user.tenantId, travelPackageId, query);
  }
}
