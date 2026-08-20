import { Body, Controller, Get, Param, Put, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { SetFiscalNumberSequenceDto } from "./dto/fiscal-number-sequence-admin.dto";
import { FiscalNumberSequenceAdminService } from "./fiscal-number-sequence-admin.service";

type FiscalNumberSequenceAdminRequest = {
  user: { tenantId: string; role: UserRole };
};

@Controller("admin/fiscal-billing/issuers")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class FiscalNumberSequenceAdminController {
  constructor(private readonly service: FiscalNumberSequenceAdminService) {}

  @Get(":issuerId/number-sequences")
  list(
    @Req() request: FiscalNumberSequenceAdminRequest,
    @Param("issuerId") issuerId: string,
  ) {
    return this.service.list(request.user.tenantId, issuerId);
  }

  @Put(":issuerId/number-sequences/:documentTypeCode")
  set(
    @Req() request: FiscalNumberSequenceAdminRequest,
    @Param("issuerId") issuerId: string,
    @Param("documentTypeCode") documentTypeCode: string,
    @Body() body: SetFiscalNumberSequenceDto,
  ) {
    return this.service.set(
      request.user.tenantId,
      issuerId,
      documentTypeCode,
      body.nextSequenceNumber,
    );
  }
}
