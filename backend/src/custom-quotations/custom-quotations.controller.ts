import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import {
  CreateCustomQuotationDto,
  CreateCustomQuotationLineDto,
  ListLeadCustomQuotationSummariesDto,
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
import { CustomQuotationLeadCustomerConversionService } from "./custom-quotation-lead-customer-conversion.service";
import { CreateCustomerDto } from "../customers/dto/create-customer.dto";
import { type CostEvidenceFile } from "../cost-engine/cost-evidence.service";
import {
  CreateCostCategoryDto,
  CreateCostComponentDto,
  CreateCostSupplierDto,
  ListCostComponentsDto,
  UpdateCostComponentCostDto,
  UpdateCostComponentDto,
} from "../cost-engine/dto/cost-engine.dto";
import { CustomQuotationCostEngineService } from "./custom-quotation-cost-engine.service";
import { CustomQuotationCommercialLinesService } from "./custom-quotation-commercial-lines.service";

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
    private readonly leadConversion: CustomQuotationLeadCustomerConversionService,
    private readonly scopedCosts: CustomQuotationCostEngineService,
    private readonly commercialLines: CustomQuotationCommercialLinesService,
  ) {}

  @Post()
  create(@Req() request: CommercialRequest, @Body() body: CreateCustomQuotationDto) {
    return this.service.create(request.user.tenantId, body, actor(request));
  }

  @Get()
  list(@Req() request: CommercialRequest, @Query() query: ListCustomQuotationsDto) {
    return this.service.list(request.user.tenantId, query);
  }

  @Get("lead/:leadId")
  listForLead(
    @Req() request: CommercialRequest,
    @Param("leadId") leadId: string,
    @Query() query: ListLeadCustomQuotationSummariesDto,
  ) {
    return this.service.listForLead(request.user.tenantId, leadId, query);
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

  @Get(":quotationId/commercial-lines")
  getCommercialLines(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string) {
    return this.commercialLines.list(request.user.tenantId, quotationId);
  }

  @Get(":quotationId/cost-engine/composition")
  getScopedCostComposition(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string, @Query() query: ListCostComponentsDto) {
    return this.scopedCosts.composition(request.user.tenantId, quotationId, query.page ?? 1, query.pageSize ?? 20);
  }

  @Get(":quotationId/cost-engine/categories")
  listScopedCostCategories(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string, @Query() query: ListCostComponentsDto) {
    return this.scopedCosts.listCategories(request.user.tenantId, quotationId, query.page ?? 1, query.pageSize ?? 20);
  }

  @Post(":quotationId/cost-engine/categories")
  createScopedCostCategory(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string, @Body() body: CreateCostCategoryDto) {
    return this.scopedCosts.createCategory(request.user.tenantId, quotationId, body);
  }

  @Get(":quotationId/cost-engine/suppliers")
  listScopedCostSuppliers(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string, @Query() query: ListCostComponentsDto) {
    return this.scopedCosts.listSuppliers(request.user.tenantId, quotationId, query.page ?? 1, query.pageSize ?? 20);
  }

  @Post(":quotationId/cost-engine/suppliers")
  createScopedCostSupplier(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string, @Body() body: CreateCostSupplierDto) {
    return this.scopedCosts.createSupplier(request.user.tenantId, quotationId, body);
  }

  @Post(":quotationId/cost-engine/components")
  createScopedCostComponent(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string, @Body() body: CreateCostComponentDto) {
    return this.scopedCosts.createComponent(request.user.tenantId, quotationId, body, actor(request));
  }

  @Patch(":quotationId/cost-engine/components/:costComponentId/cost")
  updateScopedCostComponentCost(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string, @Param("costComponentId") costComponentId: string, @Body() body: UpdateCostComponentCostDto) {
    return this.scopedCosts.updateComponentCost(request.user.tenantId, quotationId, costComponentId, body, actor(request));
  }

  @Patch(":quotationId/cost-engine/components/:costComponentId/archive")
  archiveScopedCostComponent(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string, @Param("costComponentId") costComponentId: string) {
    return this.scopedCosts.archiveComponent(request.user.tenantId, quotationId, costComponentId, actor(request));
  }

  @Patch(":quotationId/cost-engine/components/:costComponentId")
  updateScopedCostComponent(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string, @Param("costComponentId") costComponentId: string, @Body() body: UpdateCostComponentDto) {
    return this.scopedCosts.updateComponent(request.user.tenantId, quotationId, costComponentId, body, actor(request));
  }

  @Get(":quotationId/cost-engine/snapshots/:costSnapshotId/evidence")
  listScopedCostEvidence(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string, @Param("costSnapshotId") costSnapshotId: string, @Query() query: ListCostComponentsDto) {
    return this.scopedCosts.listEvidence(request.user.tenantId, quotationId, costSnapshotId, query.page ?? 1, query.pageSize ?? 20);
  }

  @Get(":quotationId/cost-engine/snapshots/:costSnapshotId/evidence/:costEvidenceId/access")
  getScopedCostEvidenceAccess(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string, @Param("costSnapshotId") costSnapshotId: string, @Param("costEvidenceId") costEvidenceId: string) {
    return this.scopedCosts.evidenceAccess(request.user.tenantId, quotationId, costSnapshotId, costEvidenceId);
  }

  @Post(":quotationId/cost-engine/snapshots/:costSnapshotId/evidence")
  @UseInterceptors(FileInterceptor("file"))
  uploadScopedCostEvidence(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string, @Param("costSnapshotId") costSnapshotId: string, @UploadedFile() file: CostEvidenceFile | undefined) {
    return this.scopedCosts.uploadEvidence(request.user.tenantId, quotationId, costSnapshotId, file, actor(request));
  }

  @Post(":quotationId/pricing/calculate")
  calculatePricing(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string) {
    return this.pricing.calculate(request.user.tenantId, quotationId, actor(request));
  }

  @Get(":quotationId/pricing")
  getLatestPricing(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string) {
    return this.pricing.getLatestCommercialState(request.user.tenantId, quotationId);
  }

  @Post(":quotationId/issue")
  issue(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string) {
    return this.versions.issue(request.user.tenantId, quotationId, actor(request));
  }

  @Get(":quotationId/versions/latest")
  getLatestVersion(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string) {
    return this.versions.findLatest(request.user.tenantId, quotationId);
  }

  @Get(":quotationId/versions/:versionId")
  getVersion(@Req() request: CommercialRequest, @Param("quotationId") quotationId: string, @Param("versionId") versionId: string) {
    return this.versions.find(request.user.tenantId, quotationId, versionId);
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

  @Post(":quotationId/convert-lead-to-customer")
  convertLeadToCustomer(
    @Req() request: CommercialRequest,
    @Param("quotationId") quotationId: string,
    @Body() body: CreateCustomerDto,
  ) {
    return this.leadConversion.convert(request.user.tenantId, quotationId, body, actor(request));
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
