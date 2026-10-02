import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { ListOperationalWorkItemsDto } from "./dto/list-operational-work-items.dto";
import { OperationalWorkItemsService } from "./operational-work-items.service";
@Controller("operations/travel-packages/:travelPackageId/work-items") @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN, UserRole.OPERACIONES)
export class OperationalWorkItemsController { constructor(private readonly service: OperationalWorkItemsService) {} @Get() list(@Req() req: { user: { tenantId: string } }, @Param("travelPackageId") id: string, @Query() query: ListOperationalWorkItemsDto) { return this.service.list(req.user.tenantId, id, query); } }
