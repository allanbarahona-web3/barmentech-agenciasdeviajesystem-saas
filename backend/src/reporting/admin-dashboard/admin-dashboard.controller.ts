import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { AdminDashboardQueryDto, parseAdminDashboardPeriod } from "./admin-dashboard-query.dto";
import { AdminDashboardService } from "./admin-dashboard.service";

type AdminDashboardRequest = { user: { id: string; tenantId: string; role: UserRole } };

@Controller("reporting/admin-dashboard")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get()
  getDashboard(@Req() request: AdminDashboardRequest, @Query() query: AdminDashboardQueryDto) {
    const period = parseAdminDashboardPeriod(query);
    return this.dashboard.execute({
      tenantId: request.user.tenantId,
      actorUserId: request.user.id,
      role: request.user.role,
      period,
    });
  }
}
