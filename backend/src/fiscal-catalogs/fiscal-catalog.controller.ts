import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CabysCodeParamDto, CabysSearchQueryDto, ConfirmCabysDto, TaxCodeParamDto } from "./fiscal-catalog.dto";
import { FiscalCatalogService } from "./fiscal-catalog.service";

type AdminRequest = { user: { tenantId?: string } };

@Controller("fiscal-catalogs")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class FiscalCatalogController {
  constructor(private readonly service: FiscalCatalogService) {}

  @Get("cabys/search")
  searchCabys(@Req() request: AdminRequest, @Query() query: CabysSearchQueryDto) {
    return this.service.searchCabys(request.user.tenantId, query.q, query.top);
  }

  @Get("cabys/:code")
  findCabys(@Req() request: AdminRequest, @Param() params: CabysCodeParamDto) {
    return this.service.findCabys(request.user.tenantId, params.code);
  }

  @Post("cabys/confirm")
  confirmCabys(@Req() request: AdminRequest, @Body() body: ConfirmCabysDto) {
    return this.service.confirmCabys(request.user.tenantId, body.code);
  }

  @Get("units")
  units(@Req() request: AdminRequest) { return this.service.units(request.user.tenantId); }

  @Get("taxes")
  taxes(@Req() request: AdminRequest) { return this.service.taxes(request.user.tenantId); }

  @Get("taxes/:taxCode/rates")
  taxRates(@Req() request: AdminRequest, @Param() params: TaxCodeParamDto) {
    return this.service.taxRates(request.user.tenantId, params.taxCode);
  }
}
