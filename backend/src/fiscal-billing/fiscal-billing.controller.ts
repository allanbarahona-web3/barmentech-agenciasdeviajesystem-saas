import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from 'express';
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import {
  CreateBillingDraftDto,
  ListEligibleSalesOrdersDto,
  ManualInvoiceEmailResendDto,
} from "./dto/fiscal-billing.dto";
import { BillingDocumentService } from "./billing-document.service";
import { SalesOrderFiscalBillingService } from "./fiscal-billing.service";
import { FiscalArtifactReadService } from './fiscal-artifact-read.service';
import { FiscalInvoicePdfService } from "./fiscal-invoice-pdf.service";
import { FiscalInvoiceAutoDeliveryService } from "./fiscal-invoice-auto-delivery.service";

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
    private readonly artifactReadService: FiscalArtifactReadService,
    private readonly fiscalInvoicePdfService: FiscalInvoicePdfService,
    private readonly fiscalInvoiceAutoDeliveryService: FiscalInvoiceAutoDeliveryService,
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

  @Post("invoices/:billingDocumentId/pdf")
  generateInvoicePdf(
    @Req() request: FiscalBillingRequest,
    @Param("billingDocumentId") billingDocumentId: string,
  ) {
    return this.fiscalInvoicePdfService.generateAndPersist(
      request.user.tenantId,
      billingDocumentId,
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

  @Get("invoices/:billingDocumentId")
  invoice(
    @Req() request: FiscalBillingRequest,
    @Param("billingDocumentId") billingDocumentId: string,
  ) {
    return this.billingDocumentService.getAcceptedInvoice(
      request.user.tenantId,
      billingDocumentId,
    );
  }

  @Post("invoices/:billingDocumentId/email")
  resendInvoiceEmail(
    @Req() request: FiscalBillingRequest,
    @Param("billingDocumentId") billingDocumentId: string,
    @Body() body: ManualInvoiceEmailResendDto,
  ) {
    return this.fiscalInvoiceAutoDeliveryService.requestManualResend({
      tenantId: request.user.tenantId,
      billingDocumentId,
      requestedByUserId: request.user.id,
      to: body.to,
      cc: body.cc,
    });
  }

  @Get('documents/:billingDocumentId/artifacts')
  listArtifacts(
    @Req() request: FiscalBillingRequest,
    @Param('billingDocumentId') billingDocumentId: string,
  ) {
    return this.artifactReadService.list(request.user.tenantId, billingDocumentId);
  }

  @Get('documents/:billingDocumentId/artifacts/:artifactType/versions/:version/download')
  async downloadArtifact(
    @Req() request: FiscalBillingRequest,
    @Param('billingDocumentId') billingDocumentId: string,
    @Param('artifactType') artifactType: string,
    @Param('version') version: string,
    @Res() response: Response,
  ): Promise<void> {
    const artifact = await this.artifactReadService.download(request.user.tenantId, billingDocumentId, artifactType, version);
    response.set({
      'Content-Type': artifact.mimeType,
      'Content-Length': artifact.bytes.length.toString(),
      'Content-Disposition': `attachment; filename="${artifact.filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.send(artifact.bytes);
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
