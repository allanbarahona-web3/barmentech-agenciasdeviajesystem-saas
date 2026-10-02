import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { ListOperationalTravelPackageSummariesDto } from "./dto/list-operational-travel-package-summaries.dto";
import { OperationalTravelPackageSummariesService } from "./operational-travel-package-summaries.service";

type OperationsRequest = { user: { tenantId: string } };

@Controller("operations/travel-packages")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERACIONES)
export class OperationalTravelPackageSummariesController {
  constructor(private readonly service: OperationalTravelPackageSummariesService) {}

  @Get("summaries")
  list(@Req() request: OperationsRequest, @Query() query: ListOperationalTravelPackageSummariesDto) {
    return this.service.list(request.user.tenantId, query);
  }
}
