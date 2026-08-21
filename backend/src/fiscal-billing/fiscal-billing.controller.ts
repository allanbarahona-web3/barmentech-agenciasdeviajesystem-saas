import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import {
  CreateBillingDraftDto,
  ListEligibleSalesOrdersDto,
} from "./dto/fiscal-billing.dto";
import { BillingDocumentService } from "./billing-document.service";
import { SalesOrderFiscalBillingService } from "./fiscal-billing.service";

type FiscalBillingRequest = {
  user: { id: string; tenantId: string; role: UserRole };
};

@Controller("fiscal-billing")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS)
export class FiscalBillingController {
  constructor(
    private readonly salesOrderService: SalesOrderFiscalBillingService,
    private readonly billingDocumentService: BillingDocumentService,
  ) {}

  @Get("sales-orders/eligible")
  listEligible(
    @Req() request: FiscalBillingRequest,
    @Query() query: ListEligibleSalesOrdersDto,
  ) {
    return this.salesOrderService.listEligibleSalesOrders(
      request.user.tenantId,
      query.page,
      query.pageSize,
    );
  }

  @Get("sales-orders/:salesOrderId/preparation")
  prepare(
    @Req() request: FiscalBillingRequest,
    @Param("salesOrderId") salesOrderId: string,
  ) {
    return this.salesOrderService.prepare(request.user.tenantId, salesOrderId);
  }

  @Post("sales-orders/:salesOrderId/draft")
  createOrResumeDraft(
    @Req() request: FiscalBillingRequest,
    @Param("salesOrderId") salesOrderId: string,
    @Body() body: CreateBillingDraftDto,
  ) {
    return this.salesOrderService.createOrResumeDraft(
      request.user.tenantId,
      salesOrderId,
      body,
      request.user.id,
    );
  }

  @Get("documents/:billingDocumentId/workspace")
  workspace(
    @Req() request: FiscalBillingRequest,
    @Param("billingDocumentId") billingDocumentId: string,
  ) {
    return this.billingDocumentService.getWorkspace(
      request.user.tenantId,
      billingDocumentId,
    );
  }

  @Post("documents/:billingDocumentId/request-electronic-issuance")
  requestElectronicIssuance(
    @Req() request: FiscalBillingRequest,
    @Param("billingDocumentId") billingDocumentId: string,
  ) {
    return this.billingDocumentService.requestElectronicIssuance(
      request.user.tenantId,
      billingDocumentId,
      request.user.id,
    );
  }
}
