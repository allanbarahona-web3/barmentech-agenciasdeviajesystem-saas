import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import {
  ListSalesOrdersDto,
  SalesOrderDetailDto,
  SalesOrderListResponseDto,
} from "./dto";
import { SalesOrdersReadService } from "./sales-orders-read.service";

type SalesOrderRequest = {
  user: { tenantId: string };
};

@Controller("sales-orders")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "AGENT", "OPERACIONES")
export class SalesOrdersController {
  constructor(private readonly readService: SalesOrdersReadService) {}

  @Get()
  list(
    @Req() req: SalesOrderRequest,
    @Query() query: ListSalesOrdersDto,
  ): Promise<SalesOrderListResponseDto> {
    return this.readService.list(req.user.tenantId, query);
  }

  @Get(":id")
  getById(
    @Req() req: SalesOrderRequest,
    @Param("id") id: string,
  ): Promise<SalesOrderDetailDto> {
    return this.readService.getById(req.user.tenantId, id);
  }
}
