import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  CreateCostComponentDto,
  CreateCostApplicabilityDto,
  CreateCostCategoryDto,
  CreateCostSupplierDto,
  DuplicateCostComponentDto,
  UpdateCostApplicabilityDto,
  UpdateCostCategoryDto,
  UpdateCostComponentCostDto,
  UpdateCostComponentDto,
  UpdateCostSupplierDto,
} from "./dto/cost-engine.dto";
import { addExactDecimals } from "./exact-decimal";
import { ApplicabilityInput, CostActor, CostComponentInput, CostEngineRepository, CostSnapshotInput } from "./cost-engine.repository";

@Injectable()
export class CostEngineService {
  constructor(private readonly repository: CostEngineRepository) {}

  async getComposition(tenantId: string, costingProjectId: string, page = 1, pageSize = 20) {
    const result = await this.repository.getComposition(tenantId, costingProjectId, page, pageSize);
    if (!result) throw new NotFoundException("Costing project not found.");

    const categorySubtotals = result.categoryTotals.map((category) => ({
      category: {
        id: category.categoryId,
        code: category.categoryCode,
        displayName: category.categoryDisplayName,
      },
      amount: category.amount,
    }));
    const authoritativeTotalCost = categorySubtotals.reduce(
      (total, category) => addExactDecimals(total, category.amount),
      "0",
    );

    return {
      project: result.project,
      components: result.components.map(serializeComponent),
      categorySubtotals,
      authoritativeTotalCost,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / result.pageSize),
    };
  }

  async getComponent(tenantId: string, costComponentId: string) {
    const component = await this.repository.getComponentDetail(tenantId, costComponentId);
    if (!component) throw new NotFoundException("Cost component not found.");
    return serializeComponent(component);
  }

  async getComponentHistory(tenantId: string, costComponentId: string, page = 1, pageSize = 20) {
    const result = await this.repository.getComponentHistory(tenantId, costComponentId, page, pageSize);
    if (!result) throw new NotFoundException("Cost component not found.");
    return {
      snapshots: result.snapshots.map((snapshot: any) => ({ ...snapshot, amount: decimalString(snapshot.amount) })),
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / result.pageSize),
    };
  }

  async getComponentMonetaryTimeline(tenantId: string, costComponentId: string, page = 1, pageSize = 20) {
    const result = await this.repository.getComponentMonetaryTimeline(tenantId, costComponentId, page, pageSize);
    if (!result) throw new NotFoundException("Cost component not found.");
    return monetaryTimelineResponse(result);
  }

  async getProjectMonetaryTimeline(tenantId: string, costingProjectId: string, page = 1, pageSize = 20, categoryCode?: string) {
    const result = await this.repository.getProjectMonetaryTimeline(tenantId, costingProjectId, page, pageSize, categoryCode);
    if (!result) throw new NotFoundException("Costing project not found.");
    return monetaryTimelineResponse(result);
  }

  async getProjectTotalEvolution(tenantId: string, costingProjectId: string, page = 1, pageSize = 20) {
    const result = await this.repository.getProjectTotalEvolution(tenantId, costingProjectId, page, pageSize);
    if (!result) throw new NotFoundException("Costing project not found.");
    return {
      ...result,
      totalPages: Math.ceil(result.total / result.pageSize),
    };
  }

  async createComponent(tenantId: string, costingProjectId: string, dto: CreateCostComponentDto, actor: CostActor) {
    const componentId = await this.repository.createComponent(
      tenantId,
      costingProjectId,
      componentInput(dto),
      snapshotInput(dto),
      actor,
    );
    return this.getComponent(tenantId, componentId);
  }

  async updateComponent(tenantId: string, costComponentId: string, dto: UpdateCostComponentDto, actor: CostActor) {
    const input = structuralUpdateInput(dto);
    if (!Object.keys(input).length) throw new BadRequestException("At least one structural field is required.");
    await this.repository.updateComponent(tenantId, costComponentId, input, actor);
    return this.getComponent(tenantId, costComponentId);
  }

  async archiveComponent(tenantId: string, costComponentId: string, actor: CostActor) {
    await this.repository.archiveComponent(tenantId, costComponentId, actor);
    return this.getComponent(tenantId, costComponentId);
  }

  async reactivateComponent(tenantId: string, costComponentId: string, actor: CostActor) {
    await this.repository.reactivateComponent(tenantId, costComponentId, actor);
    return this.getComponent(tenantId, costComponentId);
  }

  async duplicateComponent(tenantId: string, costComponentId: string, dto: DuplicateCostComponentDto, actor: CostActor) {
    const componentId = await this.repository.duplicateComponent(tenantId, costComponentId, dto.title?.trim(), actor);
    return this.getComponent(tenantId, componentId);
  }

  async updateComponentCost(tenantId: string, costComponentId: string, dto: UpdateCostComponentCostDto, actor: CostActor) {
    await this.repository.updateComponentCost(tenantId, costComponentId, snapshotInput(dto), actor);
    return this.getComponent(tenantId, costComponentId);
  }

  async listCategories(tenantId: string, page = 1, pageSize = 20) {
    const result = await this.repository.listCategories(tenantId, page, pageSize);
    return pageResult("categories", result.categories, result);
  }

  createCategory(tenantId: string, dto: CreateCostCategoryDto) {
    return this.repository.createCategory(tenantId, dto.code.trim(), dto.displayName.trim());
  }

  updateCategory(tenantId: string, costCategoryId: string, dto: UpdateCostCategoryDto) {
    const input: { displayName?: string; isActive?: boolean } = {};
    if (dto.displayName !== undefined) input.displayName = dto.displayName.trim();
    if (dto.isActive !== undefined) input.isActive = dto.isActive;
    return this.repository.updateCategory(tenantId, costCategoryId, input);
  }

  async listSuppliers(tenantId: string, page = 1, pageSize = 20) {
    const result = await this.repository.listSuppliers(tenantId, page, pageSize);
    return pageResult("suppliers", result.suppliers, result);
  }

  createSupplier(tenantId: string, dto: CreateCostSupplierDto) {
    return this.repository.createSupplier(tenantId, {
      name: dto.name.trim(), website: dto.website?.trim() || null, notes: dto.notes?.trim() || null,
    });
  }

  updateSupplier(tenantId: string, costSupplierId: string, dto: UpdateCostSupplierDto) {
    const input: { name?: string; website?: string | null; notes?: string | null; isActive?: boolean } = {};
    if (dto.name !== undefined) input.name = dto.name.trim();
    if (dto.website !== undefined) input.website = dto.website?.trim() || null;
    if (dto.notes !== undefined) input.notes = dto.notes?.trim() || null;
    if (dto.isActive !== undefined) input.isActive = dto.isActive;
    return this.repository.updateSupplier(tenantId, costSupplierId, input);
  }

  archiveSupplier(tenantId: string, costSupplierId: string) {
    return this.repository.archiveSupplier(tenantId, costSupplierId);
  }

  async listApplicabilities(tenantId: string, costComponentId: string, page = 1, pageSize = 20) {
    const result = await this.repository.listApplicabilities(tenantId, costComponentId, page, pageSize);
    return pageResult("applicabilities", result.applicabilities, result);
  }

  createApplicability(tenantId: string, costComponentId: string, dto: CreateCostApplicabilityDto) {
    return this.repository.createApplicability(tenantId, costComponentId, applicabilityInput(dto));
  }

  updateApplicability(tenantId: string, costApplicabilityId: string, dto: UpdateCostApplicabilityDto) {
    const input: Partial<ApplicabilityInput> = {};
    if (dto.scopeType !== undefined) input.scopeType = dto.scopeType.trim();
    if (dto.scopeKey !== undefined) input.scopeKey = dto.scopeKey?.trim() || null;
    if (dto.label !== undefined) input.label = dto.label?.trim() || null;
    if (dto.startDate !== undefined) input.startDate = dto.startDate ? dateOnly(dto.startDate) : null;
    if (dto.endDate !== undefined) input.endDate = dto.endDate ? dateOnly(dto.endDate) : null;
    return this.repository.updateApplicability(tenantId, costApplicabilityId, input);
  }

  deleteApplicability(tenantId: string, costApplicabilityId: string) {
    return this.repository.deleteApplicability(tenantId, costApplicabilityId);
  }
}

function pageResult<T>(key: string, values: T[], result: { total: number; page: number; pageSize: number }) {
  return { [key]: values, total: result.total, page: result.page, pageSize: result.pageSize, totalPages: Math.ceil(result.total / result.pageSize) };
}

function applicabilityInput(dto: CreateCostApplicabilityDto) {
  return {
    scopeType: dto.scopeType.trim(), scopeKey: dto.scopeKey?.trim() || null, label: dto.label?.trim() || null,
    startDate: dto.startDate ? dateOnly(dto.startDate) : null, endDate: dto.endDate ? dateOnly(dto.endDate) : null,
  };
}

function dateOnly(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) throw new BadRequestException("Invalid applicability date.");
  return date;
}

function componentInput(dto: CreateCostComponentDto): CostComponentInput {
  return {
    costCategoryId: dto.costCategoryId.trim(),
    costSupplierId: dto.costSupplierId?.trim() || null,
    title: dto.title.trim(),
    description: dto.description?.trim() || null,
    detailPayload: dto.detailPayload ?? null,
    detailSchemaVersion: dto.detailSchemaVersion ?? null,
    quantity: dto.quantity?.trim() || null,
    unit: dto.unit?.trim() || null,
    sortPosition: dto.sortPosition ?? 0,
  };
}

function structuralUpdateInput(dto: UpdateCostComponentDto): Partial<CostComponentInput> {
  const input: Partial<CostComponentInput> = {};
  if (dto.costCategoryId !== undefined) input.costCategoryId = dto.costCategoryId.trim();
  if (dto.costSupplierId !== undefined) input.costSupplierId = dto.costSupplierId?.trim() || null;
  if (dto.title !== undefined) input.title = dto.title.trim();
  if (dto.description !== undefined) input.description = dto.description?.trim() || null;
  if (dto.detailPayload !== undefined) input.detailPayload = dto.detailPayload;
  if (dto.detailSchemaVersion !== undefined) input.detailSchemaVersion = dto.detailSchemaVersion;
  if (dto.quantity !== undefined) input.quantity = dto.quantity?.trim() || null;
  if (dto.unit !== undefined) input.unit = dto.unit?.trim() || null;
  if (dto.sortPosition !== undefined) input.sortPosition = dto.sortPosition;
  return input;
}

function snapshotInput(dto: Pick<CreateCostComponentDto, "amount" | "currency" | "sourceReference" | "sourceUrl" | "reason">): CostSnapshotInput {
  const amount = dto.amount.trim();
  if (!/^\d+(?:\.\d{1,5})?$/.test(amount)) throw new BadRequestException("Amount must be an exact decimal with at most five fractional digits.");
  const currency = dto.currency.trim();
  if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException("Currency must be a three-letter uppercase code.");
  return {
    amount,
    currency,
    sourceReference: dto.sourceReference?.trim() || null,
    sourceUrl: dto.sourceUrl?.trim() || null,
    reason: dto.reason?.trim() || null,
  };
}

function serializeComponent(component: any) {
  return {
    ...component,
    quantity: component.quantity === null || component.quantity === undefined ? null : decimalString(component.quantity),
    currentSnapshot: component.currentSnapshot
      ? { ...component.currentSnapshot, amount: decimalString(component.currentSnapshot.amount) }
      : null,
  };
}

function decimalString(value: unknown): string {
  if (value && typeof value === "object" && "toFixed" in value && typeof (value as { toFixed?: unknown }).toFixed === "function") {
    return (value as { toFixed: () => string }).toFixed();
  }
  return String(value);
}

function monetaryTimelineResponse(result: { events: Array<any>; total: number; page: number; pageSize: number }) {
  return {
    events: result.events.map((event) => ({
      eventId: event.eventId,
      eventType: event.eventType,
      costingProjectId: event.costingProjectId,
      costComponentId: event.costComponentId,
      costCategoryCode: event.costCategoryCode,
      costCategoryDisplayName: event.costCategoryDisplayName,
      category: { code: event.costCategoryCode, displayName: event.costCategoryDisplayName },
      componentTitle: event.componentTitle,
      effectiveAt: event.effectiveAt,
      businessDate: dateString(event.businessDate),
      appliedAmount: event.appliedAmount === null ? null : decimalString(event.appliedAmount),
      observedAmount: event.observedAmount === null ? null : decimalString(event.observedAmount),
      currency: event.currency,
      actor: { userId: event.actorUserId, name: event.actorName },
      sourceReference: event.sourceReference,
      sourceUrl: event.sourceUrl,
      snapshotId: event.snapshotId,
      appliedSnapshotId: event.appliedSnapshotId,
      airfareDailyAuthorityId: event.airfareDailyAuthorityId,
      overrideReason: event.overrideReason,
      componentStatus: event.componentStatus,
      resultingComponentStatus: event.resultingComponentStatus,
      evidenceCount: event.evidenceCount,
      hasEvidence: event.evidenceCount > 0,
    })),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: Math.ceil(result.total / result.pageSize),
  };
}

function dateString(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
