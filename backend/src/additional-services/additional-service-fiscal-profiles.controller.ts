import { Body, Controller, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import {
  CreateAdditionalServiceFiscalProfileDto,
  UpdateAdditionalServiceFiscalProfileDto,
  UpdateAdditionalServiceFiscalProfileStatusDto,
} from "./dto";
import { AdditionalServicesService } from "./additional-services.service";

type AdminRequest = { user: { tenantId: string } };

@Controller("additional-services/fiscal-profiles")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class AdditionalServiceFiscalProfilesController {
  constructor(private readonly additionalServicesService: AdditionalServicesService) {}

  @Post()
  create(@Req() req: AdminRequest, @Body() dto: CreateAdditionalServiceFiscalProfileDto) {
    return this.additionalServicesService.createFiscalProfile(req.user.tenantId, dto);
  }

  @Patch(":id")
  update(
    @Req() req: AdminRequest,
    @Param("id") id: string,
    @Body() dto: UpdateAdditionalServiceFiscalProfileDto,
  ) {
    return this.additionalServicesService.updateFiscalProfile(req.user.tenantId, id, dto);
  }

  @Patch(":id/status")
  updateStatus(
    @Req() req: AdminRequest,
    @Param("id") id: string,
    @Body() dto: UpdateAdditionalServiceFiscalProfileStatusDto,
  ) {
    return this.additionalServicesService.updateFiscalProfileStatus(
      req.user.tenantId,
      id,
      dto.isActive,
    );
  }
}
