import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { TerritorialCountryParamDto, TerritorialSubdivisionQueryDto } from "./territorial-catalog.dto";
import { TerritorialCatalogService } from "./territorial-catalog.service";

@Controller("territorial-catalogs")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class TerritorialCatalogController {
  constructor(private readonly service: TerritorialCatalogService) {}

  @Get(":countryCode/subdivisions")
  subdivisions(@Param() params: TerritorialCountryParamDto, @Query() query: TerritorialSubdivisionQueryDto) {
    return this.service.subdivisions(params.countryCode, query.parentFullCode);
  }
}
