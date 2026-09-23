import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CreateLeadDto, ListLeadsDto, UpdateLeadDto } from "./dto/lead.dto";
import { LeadsService } from "./leads.service";

type CommercialRequest = {
  user: { id: string; fullName: string; tenantId: string };
};

@Controller("leads")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.AGENT)
export class LeadsController {
  constructor(private readonly service: LeadsService) {}

  @Post()
  create(@Req() request: CommercialRequest, @Body() body: CreateLeadDto) {
    return this.service.create(request.user.tenantId, body, actor(request));
  }

  @Get()
  list(@Req() request: CommercialRequest, @Query() query: ListLeadsDto) {
    return this.service.list(request.user.tenantId, query);
  }

  @Get(":leadId")
  find(@Req() request: CommercialRequest, @Param("leadId") leadId: string) {
    return this.service.find(request.user.tenantId, leadId);
  }

  @Patch(":leadId")
  update(
    @Req() request: CommercialRequest,
    @Param("leadId") leadId: string,
    @Body() body: UpdateLeadDto,
  ) {
    return this.service.update(request.user.tenantId, leadId, body, actor(request));
  }
}

function actor(request: CommercialRequest) {
  return { userId: request.user.id, name: request.user.fullName };
}
