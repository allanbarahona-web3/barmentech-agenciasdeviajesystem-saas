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
import {
  CreateAdditionalServicePricingConfigurationDto,
  ListAdditionalServicePricingConfigurationsDto,
  UpdateAdditionalServicePricingConfigurationDto,
  UpdateAdditionalServicePricingConfigurationStatusDto,
} from "./dto";
import { AdditionalServicesService } from "./additional-services.service";

type AdminRequest = {
  user: {
    tenantId: string;
  };
};

@Controller("additional-services/pricing-configurations")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class AdditionalServicePricingConfigurationsController {
  constructor(
    private readonly additionalServicesService: AdditionalServicesService,
  ) {}

  @Get()
  list(
    @Req() req: AdminRequest,
    @Query() filters: ListAdditionalServicePricingConfigurationsDto,
  ) {
    return this.additionalServicesService.listPricingConfigurations(
      req.user.tenantId,
      filters,
    );
  }

  @Get(":id")
  getById(@Req() req: AdminRequest, @Param("id") id: string) {
    return this.additionalServicesService.getPricingConfiguration(
      req.user.tenantId,
      id,
    );
  }

  @Post()
  create(
    @Req() req: AdminRequest,
    @Body() dto: CreateAdditionalServicePricingConfigurationDto,
  ) {
    return this.additionalServicesService.createPricingConfiguration(
      req.user.tenantId,
      dto,
    );
  }

  @Patch(":id")
  update(
    @Req() req: AdminRequest,
    @Param("id") id: string,
    @Body() dto: UpdateAdditionalServicePricingConfigurationDto,
  ) {
    return this.additionalServicesService.updatePricingConfiguration(
      req.user.tenantId,
      id,
      dto,
    );
  }

  @Patch(":id/status")
  updateStatus(
    @Req() req: AdminRequest,
    @Param("id") id: string,
    @Body() dto: UpdateAdditionalServicePricingConfigurationStatusDto,
  ) {
    return this.additionalServicesService.updatePricingConfigurationStatus(
      req.user.tenantId,
      id,
      dto.isActive,
    );
  }
}
