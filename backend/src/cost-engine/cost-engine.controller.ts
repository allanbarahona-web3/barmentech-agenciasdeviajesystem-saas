import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { TenantGuard } from "../tenant/tenant.guard";
import {
  CreateCostComponentDto,
  CreateCostApplicabilityDto,
  CreateCostCategoryDto,
  CreateCostSupplierDto,
  DuplicateCostComponentDto,
  ListCostComponentsDto,
  UpdateCostApplicabilityDto,
  UpdateCostCategoryDto,
  UpdateCostComponentCostDto,
  UpdateCostComponentDto,
  UpdateCostSupplierDto,
} from "./dto/cost-engine.dto";
import { CostEngineService } from "./cost-engine.service";
import { CostEvidenceService, type CostEvidenceFile } from "./cost-evidence.service";
import { TravelCostingProjectResolverService } from "./travel-costing-project-resolver.service";

type CostEngineRequest = {
  user: { id: string; fullName: string; tenantId: string };
};

@Controller("cost-engine")
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles("ADMIN")
export class CostEngineController {
  constructor(
    private readonly service: CostEngineService,
    private readonly evidence: CostEvidenceService,
    private readonly travelCostingProjects: TravelCostingProjectResolverService,
  ) {}

  @Post("travel-packages/:travelPackageId/costing-project")
  resolveTravelPackageCostingProject(@Req() req: CostEngineRequest, @Param("travelPackageId") travelPackageId: string) {
    return this.travelCostingProjects.resolveTravelPackage(req.user.tenantId, travelPackageId, actor(req));
  }

  @Post("internal-trips/:internalTripId/costing-project")
  resolveInternalTripCostingProject(@Req() req: CostEngineRequest, @Param("internalTripId") internalTripId: string) {
    return this.travelCostingProjects.resolveInternalTrip(req.user.tenantId, internalTripId, actor(req));
  }

  @Get("projects/:costingProjectId")
  getComposition(@Req() req: CostEngineRequest, @Param("costingProjectId") costingProjectId: string, @Query() query: ListCostComponentsDto) {
    return this.service.getComposition(req.user.tenantId, costingProjectId, query.page ?? 1, query.pageSize ?? 20);
  }

  @Get("projects/:costingProjectId/total-evolution")
  getProjectTotalEvolution(@Req() req: CostEngineRequest, @Param("costingProjectId") costingProjectId: string, @Query() query: ListCostComponentsDto) {
    return this.service.getProjectTotalEvolution(req.user.tenantId, costingProjectId, query.page ?? 1, query.pageSize ?? 20);
  }

  @Get("categories")
  listCategories(@Req() req: CostEngineRequest, @Query() query: ListCostComponentsDto) {
    return this.service.listCategories(req.user.tenantId, query.page ?? 1, query.pageSize ?? 20);
  }

  @Post("categories")
  createCategory(@Req() req: CostEngineRequest, @Body() dto: CreateCostCategoryDto) {
    return this.service.createCategory(req.user.tenantId, dto);
  }

  @Patch("categories/:costCategoryId")
  updateCategory(@Req() req: CostEngineRequest, @Param("costCategoryId") costCategoryId: string, @Body() dto: UpdateCostCategoryDto) {
    return this.service.updateCategory(req.user.tenantId, costCategoryId, dto);
  }

  @Get("suppliers")
  listSuppliers(@Req() req: CostEngineRequest, @Query() query: ListCostComponentsDto) {
    return this.service.listSuppliers(req.user.tenantId, query.page ?? 1, query.pageSize ?? 20);
  }

  @Post("suppliers")
  createSupplier(@Req() req: CostEngineRequest, @Body() dto: CreateCostSupplierDto) {
    return this.service.createSupplier(req.user.tenantId, dto);
  }

  @Patch("suppliers/:costSupplierId")
  updateSupplier(@Req() req: CostEngineRequest, @Param("costSupplierId") costSupplierId: string, @Body() dto: UpdateCostSupplierDto) {
    return this.service.updateSupplier(req.user.tenantId, costSupplierId, dto);
  }

  @Patch("suppliers/:costSupplierId/archive")
  archiveSupplier(@Req() req: CostEngineRequest, @Param("costSupplierId") costSupplierId: string) {
    return this.service.archiveSupplier(req.user.tenantId, costSupplierId);
  }

  @Get("components/:costComponentId/history")
  getComponentHistory(@Req() req: CostEngineRequest, @Param("costComponentId") costComponentId: string, @Query() query: ListCostComponentsDto) {
    return this.service.getComponentHistory(req.user.tenantId, costComponentId, query.page ?? 1, query.pageSize ?? 20);
  }

  @Get("snapshots/:costSnapshotId/evidence")
  listEvidence(@Req() req: CostEngineRequest, @Param("costSnapshotId") costSnapshotId: string, @Query() query: ListCostComponentsDto) {
    return this.evidence.list(req.user.tenantId, costSnapshotId, query.page ?? 1, query.pageSize ?? 20);
  }

  @Get("snapshots/:costSnapshotId/evidence/:costEvidenceId/access")
  getEvidenceAccess(@Req() req: CostEngineRequest, @Param("costSnapshotId") costSnapshotId: string, @Param("costEvidenceId") costEvidenceId: string) {
    return this.evidence.getAccess(req.user.tenantId, costSnapshotId, costEvidenceId);
  }

  @Post("snapshots/:costSnapshotId/evidence")
  @UseInterceptors(FileInterceptor("file"))
  uploadEvidence(@Req() req: CostEngineRequest, @Param("costSnapshotId") costSnapshotId: string, @UploadedFile() file: CostEvidenceFile | undefined) {
    return this.evidence.upload(req.user.tenantId, costSnapshotId, file, actor(req));
  }

  @Get("components/:costComponentId")
  getComponent(@Req() req: CostEngineRequest, @Param("costComponentId") costComponentId: string) {
    return this.service.getComponent(req.user.tenantId, costComponentId);
  }

  @Get("components/:costComponentId/applicabilities")
  listApplicabilities(@Req() req: CostEngineRequest, @Param("costComponentId") costComponentId: string, @Query() query: ListCostComponentsDto) {
    return this.service.listApplicabilities(req.user.tenantId, costComponentId, query.page ?? 1, query.pageSize ?? 20);
  }

  @Post("components/:costComponentId/applicabilities")
  createApplicability(@Req() req: CostEngineRequest, @Param("costComponentId") costComponentId: string, @Body() dto: CreateCostApplicabilityDto) {
    return this.service.createApplicability(req.user.tenantId, costComponentId, dto);
  }

  @Patch("applicabilities/:costApplicabilityId")
  updateApplicability(@Req() req: CostEngineRequest, @Param("costApplicabilityId") costApplicabilityId: string, @Body() dto: UpdateCostApplicabilityDto) {
    return this.service.updateApplicability(req.user.tenantId, costApplicabilityId, dto);
  }

  @Delete("applicabilities/:costApplicabilityId")
  deleteApplicability(@Req() req: CostEngineRequest, @Param("costApplicabilityId") costApplicabilityId: string) {
    return this.service.deleteApplicability(req.user.tenantId, costApplicabilityId);
  }

  @Post("projects/:costingProjectId/components")
  createComponent(@Req() req: CostEngineRequest, @Param("costingProjectId") costingProjectId: string, @Body() dto: CreateCostComponentDto) {
    return this.service.createComponent(req.user.tenantId, costingProjectId, dto, actor(req));
  }

  @Patch("components/:costComponentId")
  updateComponent(@Req() req: CostEngineRequest, @Param("costComponentId") costComponentId: string, @Body() dto: UpdateCostComponentDto) {
    return this.service.updateComponent(req.user.tenantId, costComponentId, dto, actor(req));
  }

  @Patch("components/:costComponentId/archive")
  archiveComponent(@Req() req: CostEngineRequest, @Param("costComponentId") costComponentId: string) {
    return this.service.archiveComponent(req.user.tenantId, costComponentId, actor(req));
  }

  @Post("components/:costComponentId/duplicate")
  duplicateComponent(@Req() req: CostEngineRequest, @Param("costComponentId") costComponentId: string, @Body() dto: DuplicateCostComponentDto) {
    return this.service.duplicateComponent(req.user.tenantId, costComponentId, dto, actor(req));
  }

  @Patch("components/:costComponentId/cost")
  updateCost(@Req() req: CostEngineRequest, @Param("costComponentId") costComponentId: string, @Body() dto: UpdateCostComponentCostDto) {
    return this.service.updateComponentCost(req.user.tenantId, costComponentId, dto, actor(req));
  }
}

function actor(req: CostEngineRequest) {
  return { userId: req.user.id, name: req.user.fullName };
}
