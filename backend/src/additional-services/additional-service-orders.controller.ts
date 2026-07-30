import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import {
  AdditionalServiceOrderDashboardResponseDto,
  CreateAdditionalServiceOrderDto,
  ListAdditionalServiceOrdersDto,
} from "./dto";
import { AdditionalServicesService } from "./additional-services.service";
import { PricingEngineBusinessErrorFilter } from "./infrastructure/pricing-engine-business-error.filter";

type OrderRequest = {
  user: {
    id: string;
    fullName: string;
    tenantId: string;
  };
};

@Controller("additional-services/orders")
@UseGuards(JwtAuthGuard, RolesGuard)
@UseFilters(PricingEngineBusinessErrorFilter)
@Roles("ADMIN", "AGENT", "OPERACIONES")
export class AdditionalServiceOrdersController {
  constructor(
    private readonly additionalServicesService: AdditionalServicesService,
  ) {}

  @Post()
  async create(
    @Req() req: OrderRequest,
    @Body() input: CreateAdditionalServiceOrderDto,
  ) {
    const order = await this.additionalServicesService.createOrder(
      req.user.tenantId,
      {
        id: req.user.id,
        fullName: req.user.fullName,
      },
      input,
    );

    return {
      orderId: order.id,
      status: order.status,
    };
  }

  @Get()
  list(
    @Req() req: OrderRequest,
    @Query() query: ListAdditionalServiceOrdersDto,
  ): Promise<AdditionalServiceOrderDashboardResponseDto> {
    return this.additionalServicesService.listOrderDashboard(
      req.user.tenantId,
      query,
    );
  }

  @Get(":orderId")
  getById(
    @Req() req: OrderRequest,
    @Param("orderId") orderId: string,
  ) {
    return this.additionalServicesService.getOrder(
      req.user.tenantId,
      orderId,
    );
  }
}
