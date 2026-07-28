import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AdditionalServicesService } from "./additional-services.service";

type AdminRequest = {
  user: {
    tenantId: string;
  };
};

@Controller("additional-services/catalog")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class AdditionalServiceCatalogController {
  constructor(
    private readonly additionalServicesService: AdditionalServicesService,
  ) {}

  @Get()
  list(@Req() req: AdminRequest) {
    return this.additionalServicesService.listAdditionalServiceCatalog(
      req.user.tenantId,
    );
  }
}
