import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { CostEvidenceService, type CostEvidenceFile } from "../cost-engine/cost-evidence.service";
import { CostEngineService } from "../cost-engine/cost-engine.service";
import {
  CreateCostCategoryDto,
  CreateCostComponentDto,
  CreateCostSupplierDto,
  UpdateCostComponentCostDto,
  UpdateCostComponentDto,
} from "../cost-engine/dto/cost-engine.dto";
import { PrismaService } from "../prisma/prisma.service";
import { runTenantTransaction } from "../tenant/tenant-transaction";
import type { CustomQuotationActor } from "./custom-quotations.service";

type ScopedCostTransaction = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  customQuotation: Record<string, (...args: any[]) => Promise<any>>;
  customQuotationCostingProjectLink: Record<string, (...args: any[]) => Promise<any>>;
  costComponent: Record<string, (...args: any[]) => Promise<any>>;
  costSnapshot: Record<string, (...args: any[]) => Promise<any>>;
};

type ScopedCostDatabase = {
  $transaction<T>(work: (transaction: ScopedCostTransaction) => Promise<T>): Promise<T>;
};

type QuotationCostScope = { costingProjectId: string };

/**
 * Custom Quotation adapter for the generic Cost Engine. It owns quotation
 * scope and lifecycle authorization only; Cost Engine remains the authority
 * for component, supplier, category, decimal, and evidence behavior.
 */
@Injectable()
export class CustomQuotationCostEngineService {
  private readonly database: ScopedCostDatabase;

  constructor(
    prisma: PrismaService,
    private readonly costs: CostEngineService,
    private readonly evidence: CostEvidenceService,
  ) {
    this.database = prisma as unknown as ScopedCostDatabase;
  }

  composition(tenantId: string, quotationId: string, page = 1, pageSize = 20) {
    return this.withScope(tenantId, quotationId, false, (scope) =>
      this.costs.getComposition(tenantId, scope.costingProjectId, page, pageSize));
  }

  listCategories(tenantId: string, quotationId: string, page = 1, pageSize = 20) {
    return this.withScope(tenantId, quotationId, false, () => this.costs.listCategories(tenantId, page, pageSize));
  }

  createCategory(tenantId: string, quotationId: string, dto: CreateCostCategoryDto) {
    return this.withScope(tenantId, quotationId, true, () => this.costs.createCategory(tenantId, dto));
  }

  listSuppliers(tenantId: string, quotationId: string, page = 1, pageSize = 20) {
    return this.withScope(tenantId, quotationId, false, () => this.costs.listSuppliers(tenantId, page, pageSize));
  }

  createSupplier(tenantId: string, quotationId: string, dto: CreateCostSupplierDto) {
    return this.withScope(tenantId, quotationId, true, () => this.costs.createSupplier(tenantId, dto));
  }

  createComponent(tenantId: string, quotationId: string, dto: CreateCostComponentDto, actor: CustomQuotationActor) {
    return this.withScope(tenantId, quotationId, true, (scope) =>
      this.costs.createComponent(tenantId, scope.costingProjectId, dto, actor));
  }

  updateComponent(tenantId: string, quotationId: string, componentId: string, dto: UpdateCostComponentDto, actor: CustomQuotationActor) {
    return this.withComponentScope(tenantId, quotationId, componentId, true, () =>
      this.costs.updateComponent(tenantId, componentId, dto, actor));
  }

  updateComponentCost(tenantId: string, quotationId: string, componentId: string, dto: UpdateCostComponentCostDto, actor: CustomQuotationActor) {
    return this.withComponentScope(tenantId, quotationId, componentId, true, () =>
      this.costs.updateComponentCost(tenantId, componentId, dto, actor));
  }

  archiveComponent(tenantId: string, quotationId: string, componentId: string, actor: CustomQuotationActor) {
    return this.withComponentScope(tenantId, quotationId, componentId, true, () =>
      this.costs.archiveComponent(tenantId, componentId, actor));
  }

  listEvidence(tenantId: string, quotationId: string, snapshotId: string, page = 1, pageSize = 20) {
    return this.withSnapshotScope(tenantId, quotationId, snapshotId, false, () =>
      this.evidence.list(tenantId, snapshotId, page, pageSize));
  }

  evidenceAccess(tenantId: string, quotationId: string, snapshotId: string, evidenceId: string) {
    return this.withSnapshotScope(tenantId, quotationId, snapshotId, false, () =>
      this.evidence.getAccess(tenantId, snapshotId, evidenceId));
  }

  uploadEvidence(tenantId: string, quotationId: string, snapshotId: string, file: CostEvidenceFile | undefined, actor: CustomQuotationActor) {
    return this.withSnapshotScope(tenantId, quotationId, snapshotId, true, () =>
      this.evidence.upload(tenantId, snapshotId, file, actor));
  }

  private withComponentScope<T>(tenantId: string, quotationId: string, componentId: string, editable: boolean, work: () => Promise<T>) {
    return this.withScope(tenantId, quotationId, editable, async (scope, tx) => {
      const component = await tx.costComponent.findFirst({
        where: { id: componentId, tenantId, costingProjectId: scope.costingProjectId },
        select: { id: true },
      });
      if (!component) throw new NotFoundException("CUSTOM_QUOTATION_COST_COMPONENT_NOT_FOUND");
      return work();
    });
  }

  private withSnapshotScope<T>(tenantId: string, quotationId: string, snapshotId: string, editable: boolean, work: () => Promise<T>) {
    return this.withScope(tenantId, quotationId, editable, async (scope, tx) => {
      const snapshot = await tx.costSnapshot.findFirst({
        where: { id: snapshotId, tenantId, costingProjectId: scope.costingProjectId },
        select: { id: true },
      });
      if (!snapshot) throw new NotFoundException("CUSTOM_QUOTATION_COST_SNAPSHOT_NOT_FOUND");
      return work();
    });
  }

  private withScope<T>(tenantId: string, quotationId: string, editable: boolean, work: (scope: QuotationCostScope, tx: ScopedCostTransaction) => Promise<T>) {
    return runTenantTransaction(this.database, tenantId, async (tx) => {
      if (editable) {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "custom_quotations"
          WHERE "id" = ${quotationId} AND "tenantId" = ${tenantId}
          FOR UPDATE
        `;
        if (locked.length !== 1) throw new NotFoundException("CUSTOM_QUOTATION_NOT_FOUND");
      }

      const quotation = await tx.customQuotation.findFirst({
        where: { id: quotationId, tenantId },
        select: { id: true, status: true },
      });
      if (!quotation) throw new NotFoundException("CUSTOM_QUOTATION_NOT_FOUND");
      if (editable && quotation.status !== "DRAFT") throw new ConflictException("CUSTOM_QUOTATION_NOT_DRAFT");

      const link = await tx.customQuotationCostingProjectLink.findFirst({
        where: { tenantId, customQuotationId: quotation.id },
        select: { costingProject: { select: { id: true, tenantId: true } } },
      });
      if (!link || link.costingProject.tenantId !== tenantId) {
        throw new NotFoundException("CUSTOM_QUOTATION_COSTING_PROJECT_NOT_FOUND");
      }
      return work({ costingProjectId: link.costingProject.id }, tx);
    });
  }
}
