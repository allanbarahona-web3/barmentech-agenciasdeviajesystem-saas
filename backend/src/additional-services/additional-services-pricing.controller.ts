import {
  Body,
  Controller,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CalculateAdditionalServicePriceDto } from "./dto";
import { PricingEngineBusinessErrorFilter } from "./infrastructure/pricing-engine-business-error.filter";
import { AdditionalServicesPricingService } from "./additional-services-pricing.service";

type PricingRequest = {
  user: {
    tenantId: string;
  };
};

@Controller("additional-services/pricing")
@UseGuards(JwtAuthGuard, RolesGuard)
@UseFilters(PricingEngineBusinessErrorFilter)
@Roles("ADMIN", "AGENT", "OPERACIONES")
export class AdditionalServicesPricingController {
  constructor(
    private readonly pricingService: AdditionalServicesPricingService,
  ) {}

  @Post("calculate")
  calculate(
    @Req() req: PricingRequest,
    @Body() input: CalculateAdditionalServicePriceDto,
  ) {
    return this.pricingService.calculate(req.user.tenantId, input);
  }
}
