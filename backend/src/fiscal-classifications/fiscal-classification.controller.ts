import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import {
  CreateFiscalClassificationDto,
  ListFiscalClassificationsDto,
  UpdateFiscalClassificationDefaultDto,
  UpdateFiscalClassificationDto,
  UpdateFiscalClassificationStatusDto,
} from "./fiscal-classification.dto";
import { FiscalClassificationService } from "./fiscal-classification.service";

type AdminRequest = { user: { id: string; fullName: string; tenantId: string } };

@Controller("admin/fiscal-classifications")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class FiscalClassificationController {
  constructor(private readonly service: FiscalClassificationService) {}

  @Get()
  list(@Req() request: AdminRequest, @Query() query: ListFiscalClassificationsDto) {
    return this.service.list(
      request.user.tenantId,
      query.active === undefined ? undefined : query.active === "true",
      query.page ?? 1,
      query.pageSize ?? 20,
    );
  }

  @Get(":classificationId")
  find(@Req() request: AdminRequest, @Param("classificationId") classificationId: string) {
    return this.service.find(request.user.tenantId, classificationId);
  }

  @Post()
  create(@Req() request: AdminRequest, @Body() body: CreateFiscalClassificationDto) {
    return this.service.create(request.user.tenantId, body, actor(request));
  }

  @Patch(":classificationId")
  update(@Req() request: AdminRequest, @Param("classificationId") classificationId: string, @Body() body: UpdateFiscalClassificationDto) {
    return this.service.update(request.user.tenantId, classificationId, body, actor(request));
  }

  @Patch(":classificationId/status")
  setStatus(@Req() request: AdminRequest, @Param("classificationId") classificationId: string, @Body() body: UpdateFiscalClassificationStatusDto) {
    return this.service.setStatus(request.user.tenantId, classificationId, body.isActive, actor(request));
  }

  @Patch(":classificationId/default-for-custom-quotations")
  setDefaultForCustomQuotations(@Req() request: AdminRequest, @Param("classificationId") classificationId: string, @Body() body: UpdateFiscalClassificationDefaultDto) {
    return this.service.setDefaultForCustomQuotations(
      request.user.tenantId,
      classificationId,
      body.isDefaultForCustomQuotations,
      actor(request),
    );
  }
}

function actor(request: AdminRequest) {
  return { userId: request.user.id, name: request.user.fullName };
}
