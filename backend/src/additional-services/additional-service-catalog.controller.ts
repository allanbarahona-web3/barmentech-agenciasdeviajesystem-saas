import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AdditionalServicesService } from "./additional-services.service";
import {
  requireTravelFiscalClassificationUsage,
  TravelFiscalClassificationService,
} from "./travel-fiscal-classification.service";
import {
  CreateAdditionalServiceCatalogDto,
  UpdateAdditionalServiceCatalogDto,
} from "./dto";

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

  @Post()
  create(
    @Req() req: AdminRequest,
    @Body() dto: CreateAdditionalServiceCatalogDto,
  ) {
    return this.additionalServicesService.createAdditionalServiceCatalog(
      req.user.tenantId,
      dto,
    );
  }

  @Patch(":catalogId")
  update(
    @Req() req: AdminRequest,
    @Param("catalogId") catalogId: string,
    @Body() dto: UpdateAdditionalServiceCatalogDto,
  ) {
    return this.additionalServicesService.updateAdditionalServiceCatalog(
      req.user.tenantId,
      catalogId,
      dto,
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
  @Roles("ADMIN")
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
