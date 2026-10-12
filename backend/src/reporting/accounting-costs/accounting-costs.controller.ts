import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { Roles } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { AccountingCostEvidenceQueryDto, AccountingCostsQueryDto, parseAccountingCostsQuery, parseEvidencePagination } from "./accounting-costs.dto";
import { AccountingCostEvidenceService } from "./accounting-cost-evidence.service";
import { AccountingCostsService } from "./accounting-costs.service";

type RequestIdentity = { user: { id: string; tenantId: string; role: UserRole } };

@Controller("reporting/accounting-costs")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
export class AccountingCostsController {
  constructor(private readonly costs: AccountingCostsService, private readonly evidence: AccountingCostEvidenceService) {}
  @Get()
  list(@Req() request: RequestIdentity, @Query() query: AccountingCostsQueryDto) {
    const parsed = parseAccountingCostsQuery(query);
    return this.costs.execute({ tenantId: request.user.tenantId, actorUserId: request.user.id, role: request.user.role, ...parsed });
  }
  @Get(":sourceId/evidence")
  listEvidence(@Req() request: RequestIdentity, @Param("sourceId") sourceId: string, @Query() query: AccountingCostEvidenceQueryDto) {
    const pagination = parseEvidencePagination(query);
    return this.evidence.list(request.user.tenantId, sourceId, pagination.page, pagination.pageSize);
  }
  @Get(":sourceId/evidence/:evidenceId/access")
  evidenceAccess(@Req() request: RequestIdentity, @Param("sourceId") sourceId: string, @Param("evidenceId") evidenceId: string) {
    return this.evidence.access(request.user.tenantId, sourceId, evidenceId);
  }
}
