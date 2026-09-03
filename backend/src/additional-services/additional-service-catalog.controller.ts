import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AdditionalServicesService } from "./additional-services.service";
import {
  requireTravelFiscalClassificationUsage,
  TravelFiscalClassificationService,
} from "./travel-fiscal-classification.service";

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
    private readonly travelFiscalClassifications: TravelFiscalClassificationService,
  ) {}

  @Get()
  list(@Req() req: AdminRequest) {
    return this.additionalServicesService.listAdditionalServiceCatalog(
      req.user.tenantId,
    );
  }

  @Get("selectable")
  @Roles("ADMIN", "AGENT", "OPERACIONES")
  listSelectable(@Req() req: AdminRequest) {
    return this.additionalServicesService.listSelectableAdditionalServices(
      req.user.tenantId,
    );
  }

  @Get("travel-fiscal-classifications")
  @Roles("ADMIN", "OPERACIONES")
  listTravelFiscalClassifications(
    @Req() req: AdminRequest,
    @Query("usage") usage: string,
  ) {
    return this.travelFiscalClassifications.list(
      req.user.tenantId,
      requireTravelFiscalClassificationUsage(usage),
    );
  }
}
