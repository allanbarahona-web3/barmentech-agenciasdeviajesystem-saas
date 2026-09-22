import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import {
  CreateCustomQuotationDto,
  CreateCustomQuotationLineDto,
  ListCustomQuotationsDto,
  ReorderCustomQuotationLinesDto,
  UpdateCustomQuotationDto,
  UpdateCustomQuotationLineDto,
} from "./dto/custom-quotation.dto";
import { CustomQuotationsService } from "./custom-quotations.service";
import { CustomQuotationCostingService } from "./custom-quotation-costing.service";
import { CustomQuotationPricingService } from "./custom-quotation-pricing.service";
import { CustomQuotationVersionService } from "./custom-quotation-version.service";
import { CustomQuotationProposalService } from "./custom-quotation-proposal.service";
import { CustomQuotationApprovalService } from "./custom-quotation-approval.service";
import { CustomQuotationDeliveryService } from "./custom-quotation-delivery.service";
import { CustomQuotationSalesOrderService } from "./custom-quotation-sales-order.service";

type CommercialRequest = { user: { id: string; fullName: string; email: string; tenantId: string } };

@Controller("custom-quotations")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.AGENT)
export class CustomQuotationsController {
  constructor(
    private readonly service: CustomQuotationsService,
    private readonly costing: CustomQuotationCostingService,
    private readonly pricing: CustomQuotationPricingService,
    private readonly versions: CustomQuotationVersionService,
    private readonly proposals: CustomQuotationProposalService,
    private readonly approvals: CustomQuotationApprovalService,
    private readonly delivery: CustomQuotationDeliveryService,
    private readonly salesOrders: CustomQuotationSalesOrderService,
  ) {}

  @Post()
  create(@Req() request: CommercialRequest, @Body() body: CreateCustomQuotationDto) {
    return this.service.create(request.user.tenantId, body, actor(request));
  }

  @Get()
  list(@Req() request: CommercialRequest, @Query() query: ListCustomQuotationsDto) {
    return this.service.list(request.user.tenantId, query);
  }

  @Get(":quotationId")
  find(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string) {
    return this.service.find(request.user.tenantId, quotationId);
  }

  @Patch(":quotationId")
  update(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string, @Body() body: UpdateCustomQuotationDto) {
    return this.service.update(request.user.tenantId, quotationId, body, actor(request));
  }

  @Post(":quotationId/costing-project")
  resolveCostingProject(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string) {
    return this.costing.resolveOrCreateCostingProject(request.user.tenantId, quotationId, actor(request));
  }

  @Post(":quotationId/pricing/calculate")
  calculatePricing(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string) {
    return this.pricing.calculate(request.user.tenantId, quotationId, actor(request));
  }

  @Post(":quotationId/issue")
  issue(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string) {
    return this.versions.issue(request.user.tenantId, quotationId, actor(request));
  }

  @Post(":quotationId/versions/:versionId/proposal")
  async generateProposal(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string, @Param("versionId") versionId: string) {
    const document = await this.proposals.persist(request.user.tenantId, quotationId, versionId);
    return { documentId: document.id };
  }

  @Get(":quotationId/versions/:versionId/proposal")
  getProposal(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string, @Param("versionId") versionId: string) {
    return this.proposals.getPersistedPreview(request.user.tenantId, quotationId, versionId);
  }

  @Post(":quotationId/versions/:versionId/accept")
  accept(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string, @Param("versionId") versionId: string) {
    return this.approvals.accept(request.user.tenantId, quotationId, versionId, actor(request));
  }

  @Post(":quotationId/versions/:versionId/reject")
  reject(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string, @Param("versionId") versionId: string) {
    return this.approvals.reject(request.user.tenantId, quotationId, versionId, actor(request));
  }

  @Post(":quotationId/versions/:versionId/send")
  sendProposal(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string, @Param("versionId") versionId: string) {
    return this.delivery.send(request.user.tenantId, quotationId, versionId, emailActor(request));
  }

  @Post(":quotationId/versions/:versionId/sales-order")
  materializeSalesOrder(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string, @Param("versionId") versionId: string) {
    return this.salesOrders.materialize(request.user.tenantId, quotationId, versionId, actor(request));
  }

  @Post(":quotationId/lines")
  addLine(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string, @Body() body: CreateCustomQuotationLineDto) {
    return this.service.addLine(request.user.tenantId, quotationId, body, actor(request));
  }

  @Patch(":quotationId/lines/reorder")
  reorderLines(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string, @Body() body: ReorderCustomQuotationLinesDto) {
    return this.service.reorderLines(request.user.tenantId, quotationId, body.lineIds, actor(request));
  }

  @Patch(":quotationId/lines/:lineId")
  updateLine(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string, @Param("lineId") lineId: string, @Body() body: UpdateCustomQuotationLineDto) {
    return this.service.updateLine(request.user.tenantId, quotationId, lineId, body, actor(request));
  }

  @Delete(":quotationId/lines/:lineId")
  removeLine(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string, @Param("lineId") lineId: string) {
    return this.service.removeLine(request.user.tenantId, quotationId, lineId, actor(request));
  }
}

function actor(request: CommercialRequest) {
  return { userId: request.user.id, name: request.user.fullName };
}

function emailActor(request: CommercialRequest) {
  return { userId: request.user.id, email: request.user.email, name: request.user.fullName };
}
