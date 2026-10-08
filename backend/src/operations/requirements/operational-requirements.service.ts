import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { FINANCE_ELIGIBILITY_READER, type CommercialSourceRef, type FinanceEligibilityReader, type FinanceEligibilityResult } from "../../finance/eligibility-read/finance-eligibility-reader.port";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import {
  CreateOperationalRequirementDto,
  ListOperationalRequirementsDto,
  OperationalRequirementPassengersDto,
  OPERATIONAL_REQUIREMENT_STATUSES,
  OPERATIONAL_SOLD_VALUE_SCOPES,
  OPERATIONAL_SOURCE_TYPES,
  TransitionOperationalRequirementDto,
  UpdateOperationalRequirementDto,
} from "./dto/operational-requirements.dto";

export type OperationalRequirementsActor = { userId: string; name: string };

type OperationsTransaction = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  travelPackage: Record<string, (...args: any[]) => Promise<any>>;
  travelPackageParticipant: Record<string, (...args: any[]) => Promise<any>>;
  user: Record<string, (...args: any[]) => Promise<any>>;
  operationalRequirement: Record<string, (...args: any[]) => Promise<any>>;
  operationalRequirementPassenger: Record<string, (...args: any[]) => Promise<any>>;
  operationalFulfillmentPassenger: Record<string, (...args: any[]) => Promise<any>>;
  operationalFulfillment: Record<string, (...args: any[]) => Promise<any>>;
  customQuotationVersion: Record<string, (...args: any[]) => Promise<any>>;
  billingDocument: Record<string, (...args: any[]) => Promise<any>>;
};

type OperationsDatabase = {
  $transaction<T>(work: (transaction: OperationsTransaction) => Promise<T>): Promise<T>;
};

type RequirementStatus = (typeof OPERATIONAL_REQUIREMENT_STATUSES)[number];
type SoldValueScope = (typeof OPERATIONAL_SOLD_VALUE_SCOPES)[number];
type RequirementParticipantRecord = {
  travelPackageParticipantId: string;
  travelPackageParticipant: {
    id: string;
    clientId: string;
    role: string;
    client: { fullName: string };
  };
};
type RequirementRecord = {
  id: string;
  scopeType: "TRAVEL_PACKAGE" | "STANDALONE_CUSTOMER";
  travelPackageId: string | null;
  customerId: string | null;
  servicePurposeCode: string;
  servicePurposeName: string;
  description: string;
  status: RequirementStatus;
  critical: boolean;
  operationalDeadlineAt: Date | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  sourceType: string;
  sourceId: string | null;
  sourceLineId: string | null;
  sourceVersionId: string | null;
  sourceReference: string | null;
  sourceAcceptedAt: Date | null;
  sourcePassengerGroupId: string | null;
  sourcePassengerGroupName: string | null;
  sourcePassengerGroupServiceCode: string | null;
  soldAmount: Prisma.Decimal | null;
  soldCurrency: string | null;
  soldValueScope: SoldValueScope;
  createdAt: Date;
  updatedAt: Date;
  passengers: RequirementParticipantRecord[];
  customer?: { id: string; fullName: string } | null;
};
type RequirementSummaryRecord = Omit<RequirementRecord, "passengers"> & {
  _count: { passengers: number };
};
type CustomQuotationGroupChildRecord = {
  id: string;
  sourceId: string | null;
  sourceLineId: string | null;
  description: string;
  status: RequirementStatus;
  soldAmount: Prisma.Decimal | null;
  soldCurrency: string | null;
  createdAt: Date;
  customer: { id: string; fullName: string; idType: string | null; idNumber: string } | null;
};
type CustomQuotationVersionRecord = {
  id: string;
  customQuotation: { quotationNumber: string };
  salesOrder: { id: string; orderNumber: string } | null;
};
type PrimaryBillingDocumentRecord = {
  id: string;
  sourceId: string | null;
  documentTypeCode: string;
  fiscalNumber: string | null;
  haciendaKey: string | null;
  currencyCode: string;
  total: Prisma.Decimal;
  taxAuthorityStatus: string;
};
type CustomQuotationFinanceEligibilityStatus =
  | "PENDIENTE_FACTURACION"
  | "PENDIENTE_ACEPTACION_FISCAL"
  | "PENDIENTE_REGISTRO_FINANCIERO"
  | "PENDIENTE_PAGO"
  | "LISTO_PARA_PROCESAR";

const REQUIREMENT_DETAIL_SELECT = {
  id: true,
  scopeType: true,
  travelPackageId: true,
  customerId: true,
  servicePurposeCode: true,
  servicePurposeName: true,
  description: true,
  status: true,
  critical: true,
  operationalDeadlineAt: true,
  assignedToUserId: true,
  assignedToName: true,
  sourceType: true,
  sourceId: true,
  sourceLineId: true,
  sourceVersionId: true,
  sourceReference: true,
  sourceAcceptedAt: true,
  sourcePassengerGroupId: true,
  sourcePassengerGroupName: true,
  sourcePassengerGroupServiceCode: true,
  soldAmount: true,
  soldCurrency: true,
  soldValueScope: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { id: true, fullName: true } },
  passengers: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      travelPackageParticipantId: true,
      travelPackageParticipant: {
        select: {
          id: true,
          clientId: true,
          role: true,
          client: { select: { fullName: true } },
        },
      },
    },
  },
} as const;

const REQUIREMENT_SUMMARY_SELECT = {
  id: true,
  scopeType: true,
  travelPackageId: true,
  customerId: true,
  servicePurposeCode: true,
  servicePurposeName: true,
  description: true,
  status: true,
  critical: true,
  operationalDeadlineAt: true,
  assignedToUserId: true,
  assignedToName: true,
  sourceType: true,
  sourceId: true,
  sourceLineId: true,
  sourceVersionId: true,
  sourceReference: true,
  sourceAcceptedAt: true,
  sourcePassengerGroupId: true,
  sourcePassengerGroupName: true,
  sourcePassengerGroupServiceCode: true,
  soldAmount: true,
  soldCurrency: true,
  soldValueScope: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { id: true, fullName: true } },
  _count: { select: { passengers: true } },
} as const;

const CUSTOM_QUOTATION_GROUP_CHILD_SELECT = {
  id: true,
  sourceId: true,
  sourceLineId: true,
  description: true,
  status: true,
  soldAmount: true,
  soldCurrency: true,
  createdAt: true,
  customer: { select: { id: true, fullName: true, idType: true, idNumber: true } },
} as const;

const STATUS_TRANSITIONS: Readonly<Record<RequirementStatus, readonly RequirementStatus[]>> = {
  PENDING: ["IN_PROGRESS", "CANCELLED", "NOT_APPLICABLE"],
  IN_PROGRESS: ["PENDING", "CANCELLED", "NOT_APPLICABLE"],
  FULFILLED: [],
  CANCELLED: [],
  NOT_APPLICABLE: [],
};

@Injectable()
export class OperationalRequirementsService {
  private readonly database: OperationsDatabase;

  constructor(
    prisma: PrismaService,
    @Inject(FINANCE_ELIGIBILITY_READER) private readonly finance: FinanceEligibilityReader,
  ) {
    this.database = prisma as unknown as OperationsDatabase;
  }

  async list(tenantId: string, travelPackageId: string, input: ListOperationalRequirementsDto) {
    const page = normalizePage(input.page);
    const pageSize = normalizePageSize(input.pageSize);
    const where = requirementListWhere(tenantId, travelPackageId, input);

    return this.withTenantTransaction(tenantId, async (tx) => {
      await this.requireTravelPackage(tx, tenantId, travelPackageId);
      const [rows, total] = await Promise.all([
        tx.operationalRequirement.findMany({
          where,
          select: REQUIREMENT_SUMMARY_SELECT,
          orderBy: [
            { operationalDeadlineAt: "asc" },
            { createdAt: "asc" },
            { id: "asc" },
          ],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }) as Promise<RequirementSummaryRecord[]>,
        tx.operationalRequirement.count({ where }) as Promise<number>,
      ]);
      const requirementIds = rows.map((row) => row.id);
      const confirmedCoverage = requirementIds.length === 0 ? [] : await tx.operationalFulfillmentPassenger.findMany({
        where: {
          tenantId,
          travelPackageId,
          operationalFulfillment: { operationalRequirementId: { in: requirementIds }, status: "CONFIRMED" },
        },
        select: {
          travelPackageParticipantId: true,
          operationalFulfillment: { select: { operationalRequirementId: true } },
        },
      }) as Array<{ travelPackageParticipantId: string; operationalFulfillment: { operationalRequirementId: string } }>;
      const passengerPreviewRows = requirementIds.length === 0 ? [] : await tx.operationalRequirementPassenger.findMany({
        where: { tenantId, travelPackageId, operationalRequirementId: { in: requirementIds } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { operationalRequirementId: true, travelPackageParticipant: { select: { client: { select: { fullName: true } } } } },
      }) as Array<{ operationalRequirementId: string; travelPackageParticipant: { client: { fullName: string } } }>;
      const coverageByRequirement = new Map<string, Set<string>>();
      for (const coverage of confirmedCoverage) {
        const covered = coverageByRequirement.get(coverage.operationalFulfillment.operationalRequirementId) ?? new Set<string>();
        covered.add(coverage.travelPackageParticipantId);
        coverageByRequirement.set(coverage.operationalFulfillment.operationalRequirementId, covered);
      }
      const passengerPreviewByRequirement = new Map<string, string[]>();
      for (const passenger of passengerPreviewRows) {
        const names = passengerPreviewByRequirement.get(passenger.operationalRequirementId) ?? [];
        if (names.length < 2) names.push(passenger.travelPackageParticipant.client.fullName);
        passengerPreviewByRequirement.set(passenger.operationalRequirementId, names);
      }
      return {
        items: rows.map((row) => ({
          ...toSummary(row),
          coverage: {
            fulfilledPassengerCount: coverageByRequirement.get(row.id)?.size ?? 0,
            totalPassengerCount: row._count.passengers,
          },
          passengerPreview: passengerPreviewByRequirement.get(row.id) ?? [],
        })),
        total,
        page,
        pageSize,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      };
    });
  }

  find(tenantId: string, travelPackageId: string, requirementId: string) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      const requirement = await this.findRequirement(tx, tenantId, travelPackageId, requirementId);
      if (!requirement) throw new NotFoundException("OPERATIONAL_REQUIREMENT_NOT_FOUND");
      const confirmed = await tx.operationalFulfillmentPassenger.findMany({
        where: { tenantId, travelPackageId, operationalFulfillment: { operationalRequirementId: requirementId, status: "CONFIRMED" } },
        select: { travelPackageParticipantId: true },
      }) as Array<{ travelPackageParticipantId: string }>;
      const confirmedPassengerIds = [...new Set(confirmed.map((row) => row.travelPackageParticipantId))];
      return { ...toDetail(requirement), confirmedPassengerIds, coverage: { fulfilledPassengerCount: confirmedPassengerIds.length, totalPassengerCount: requirement.passengers.length } };
    });
  }

  async create(
    tenantId: string,
    travelPackageId: string,
    input: CreateOperationalRequirementDto,
    actor: OperationalRequirementsActor,
  ) {
    const participantIds = uniqueParticipantIds(input.participantIds);
    const source = normalizeSource(input);
    const sold = normalizeSoldContext(input);

    return this.withTenantTransaction(tenantId, async (tx) => {
      await this.requireTravelPackage(tx, tenantId, travelPackageId);
      await this.requireParticipants(tx, tenantId, travelPackageId, participantIds);
      const assignee = await this.resolveAssignee(tx, tenantId, input.assignedToUserId);
      const created = await tx.operationalRequirement.create({
        data: {
          tenantId,
          scopeType: "TRAVEL_PACKAGE",
          travelPackageId,
          customerId: null,
          servicePurposeCode: requiredText(input.servicePurposeCode, "OPERATIONAL_REQUIREMENT_SERVICE_PURPOSE_CODE_INVALID"),
          servicePurposeName: requiredText(input.servicePurposeName, "OPERATIONAL_REQUIREMENT_SERVICE_PURPOSE_NAME_INVALID"),
          description: requiredText(input.description, "OPERATIONAL_REQUIREMENT_DESCRIPTION_INVALID"),
          status: "PENDING",
          critical: input.critical ?? false,
          operationalDeadlineAt: optionalDate(input.operationalDeadlineAt, "OPERATIONAL_REQUIREMENT_DEADLINE_INVALID"),
          assignedToUserId: assignee?.id ?? null,
          assignedToName: assignee?.fullName ?? null,
          ...source,
          ...sold,
          createdByUserId: actor.userId,
          createdByName: actor.name,
        },
        select: { id: true },
      }) as { id: string };
      await tx.operationalRequirementPassenger.createMany({
        data: participantIds.map((travelPackageParticipantId) => ({
          tenantId,
          travelPackageId,
          operationalRequirementId: created.id,
          travelPackageParticipantId,
          createdByUserId: actor.userId,
          createdByName: actor.name,
        })),
      });
      const requirement = await this.findRequirement(tx, tenantId, travelPackageId, created.id);
      if (!requirement) throw new NotFoundException("OPERATIONAL_REQUIREMENT_NOT_FOUND");
      return toDetail(requirement);
    });
  }

  async update(
    tenantId: string,
    travelPackageId: string,
    requirementId: string,
    input: UpdateOperationalRequirementDto,
    actor: OperationalRequirementsActor,
  ) {
    if (hasCommercialOrAssignmentUpdate(input)) {
      throw new BadRequestException("OPERATIONAL_REQUIREMENT_COMMERCIAL_FIELDS_READ_ONLY");
    }
    if (!hasUpdate(input)) throw new BadRequestException("OPERATIONAL_REQUIREMENT_UPDATE_EMPTY");
    return this.withTenantTransaction(tenantId, async (tx) => {
      await this.requireRequirementState(tx, tenantId, travelPackageId, requirementId);
      const updated = await tx.operationalRequirement.updateMany({
        where: { id: requirementId, tenantId, travelPackageId },
        data: {
          ...(input.critical === undefined ? {} : { critical: input.critical }),
          ...(input.operationalDeadlineAt === undefined ? {} : {
            operationalDeadlineAt: optionalDate(input.operationalDeadlineAt, "OPERATIONAL_REQUIREMENT_DEADLINE_INVALID"),
          }),
          updatedByUserId: actor.userId,
          updatedByName: actor.name,
        },
      });
      if (updated.count !== 1) throw new NotFoundException("OPERATIONAL_REQUIREMENT_NOT_FOUND");
      const requirement = await this.findRequirement(tx, tenantId, travelPackageId, requirementId);
      if (!requirement) throw new NotFoundException("OPERATIONAL_REQUIREMENT_NOT_FOUND");
      return toDetail(requirement);
    });
  }

  async addPassengers(
    tenantId: string,
    travelPackageId: string,
    requirementId: string,
    input: OperationalRequirementPassengersDto,
    actor: OperationalRequirementsActor,
  ) {
    const participantIds = uniqueParticipantIds(input.participantIds);
    return this.withTenantTransaction(tenantId, async (tx) => {
      await this.requireRequirementState(tx, tenantId, travelPackageId, requirementId);
      await this.requireParticipants(tx, tenantId, travelPackageId, participantIds);
      await tx.operationalRequirementPassenger.createMany({
        data: participantIds.map((travelPackageParticipantId) => ({
          tenantId,
          travelPackageId,
          operationalRequirementId: requirementId,
          travelPackageParticipantId,
          createdByUserId: actor.userId,
          createdByName: actor.name,
        })),
        skipDuplicates: true,
      });
      const requirement = await this.findRequirement(tx, tenantId, travelPackageId, requirementId);
      if (!requirement) throw new NotFoundException("OPERATIONAL_REQUIREMENT_NOT_FOUND");
      return toDetail(requirement);
    });
  }

  async removePassengers(
    tenantId: string,
    travelPackageId: string,
    requirementId: string,
    input: OperationalRequirementPassengersDto,
  ) {
    const participantIds = uniqueParticipantIds(input.participantIds);
    return this.withTenantTransaction(tenantId, async (tx) => {
      await this.requireRequirementState(tx, tenantId, travelPackageId, requirementId);
      await this.requireParticipants(tx, tenantId, travelPackageId, participantIds);
      const currentMembers = await tx.operationalRequirementPassenger.findMany({
        where: {
          tenantId,
          travelPackageId,
          operationalRequirementId: requirementId,
        },
        select: { travelPackageParticipantId: true },
      }) as Array<{ travelPackageParticipantId: string }>;
      const memberIds = new Set(currentMembers.map((member) => member.travelPackageParticipantId));
      const existingIds = participantIds.filter((id) => memberIds.has(id));
      if (currentMembers.length - existingIds.length < 1) {
        throw new ConflictException("OPERATIONAL_REQUIREMENT_LAST_PASSENGER_REQUIRED");
      }
      if (existingIds.length > 0) {
        await tx.operationalRequirementPassenger.deleteMany({
          where: {
            tenantId,
            travelPackageId,
            operationalRequirementId: requirementId,
            travelPackageParticipantId: { in: existingIds },
          },
        });
      }
      const requirement = await this.findRequirement(tx, tenantId, travelPackageId, requirementId);
      if (!requirement) throw new NotFoundException("OPERATIONAL_REQUIREMENT_NOT_FOUND");
      return toDetail(requirement);
    });
  }

  async transitionStatus(
    tenantId: string,
    travelPackageId: string,
    requirementId: string,
    input: TransitionOperationalRequirementDto,
    actor: OperationalRequirementsActor,
  ) {
    const target = input.status as RequirementStatus;
    if (target === "FULFILLED") {
      throw new BadRequestException("OPERATIONAL_REQUIREMENT_FULFILLED_PROTECTED");
    }
    return this.withTenantTransaction(tenantId, async (tx) => {
      const current = await this.requireRequirementState(tx, tenantId, travelPackageId, requirementId);
      if (!STATUS_TRANSITIONS[current.status].includes(target)) {
        throw new ConflictException("OPERATIONAL_REQUIREMENT_STATUS_TRANSITION_INVALID");
      }
      const updated = await tx.operationalRequirement.updateMany({
        where: { id: requirementId, tenantId, travelPackageId, status: current.status },
        data: { status: target, updatedByUserId: actor.userId, updatedByName: actor.name },
      });
      if (updated.count !== 1) await this.throwLatestTransitionState(tx, tenantId, travelPackageId, requirementId);
      const requirement = await this.findRequirement(tx, tenantId, travelPackageId, requirementId);
      if (!requirement) throw new NotFoundException("OPERATIONAL_REQUIREMENT_NOT_FOUND");
      return toDetail(requirement);
    });
  }

  async listStandalone(tenantId: string, input: ListOperationalRequirementsDto) {
    const page = normalizePage(input.page);
    const pageSize = normalizePageSize(input.pageSize);
    const where = {
      ...requirementListWhere(tenantId, null, input),
      scopeType: "STANDALONE_CUSTOMER" as const,
      travelPackageId: null,
      customerId: { not: null },
    };
    return this.withTenantTransaction(tenantId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.operationalRequirement.findMany({
          where,
          select: REQUIREMENT_SUMMARY_SELECT,
          orderBy: [{ operationalDeadlineAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }) as Promise<RequirementSummaryRecord[]>,
        tx.operationalRequirement.count({ where }) as Promise<number>,
      ]);
      return {
        items: rows.map((row) => ({ ...toSummary(row), coverage: { fulfilledPassengerCount: 0, totalPassengerCount: 0 }, passengerPreview: [] })),
        total, page, pageSize, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      };
    });
  }

  /**
   * Read-only commercial presentation for Custom Quotation Operations work.
   * The source line remains the requirement identity; this only groups the
   * queue by the accepted immutable quotation-version source.
   */
  async listStandaloneCustomQuotationGroups(tenantId: string, input: ListOperationalRequirementsDto) {
    const page = normalizePage(input.page);
    const pageSize = normalizePageSize(input.pageSize);
    const where = customQuotationGroupWhere(tenantId, input);
    const pageResult = await this.withTenantTransaction(tenantId, async (tx) => {
      const [groups, totalRows] = await Promise.all([
        tx.operationalRequirement.groupBy({
          by: ["sourceId"],
          where,
          _min: { createdAt: true },
          orderBy: [{ _min: { createdAt: "asc" } }, { sourceId: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }) as Promise<Array<{ sourceId: string | null }>>,
        countCustomQuotationGroups(tx, tenantId, optionalText(input.search)),
      ]);
      const sourceIds = groups.map((group) => group.sourceId).filter((value): value is string => Boolean(value));
      if (sourceIds.length === 0) {
        const total = numberValue(totalRows[0]?.total);
        return { items: [], total, page, pageSize, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) };
      }
      const [requirements, versions] = await Promise.all([
        tx.operationalRequirement.findMany({
          where: { ...customQuotationGroupWhere(tenantId, {}), sourceId: { in: sourceIds } },
          select: CUSTOM_QUOTATION_GROUP_CHILD_SELECT,
          orderBy: [{ sourceId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        }) as Promise<CustomQuotationGroupChildRecord[]>,
        tx.customQuotationVersion.findMany({
          where: { tenantId, id: { in: sourceIds } },
          select: {
            id: true,
            customQuotation: { select: { quotationNumber: true } },
            salesOrder: { select: { id: true, orderNumber: true } },
          },
        }) as Promise<CustomQuotationVersionRecord[]>,
      ]);
      const salesOrderIds = versions.flatMap((version) => version.salesOrder ? [version.salesOrder.id] : []);
      const billingDocuments = salesOrderIds.length === 0 ? [] : await (tx.billingDocument.findMany({
        where: {
          tenantId,
          sourceType: "SALES_ORDER",
          sourceId: { in: salesOrderIds },
          sourceRole: "PRIMARY",
        },
        select: {
          id: true,
          sourceId: true,
          documentTypeCode: true,
          fiscalNumber: true,
          haciendaKey: true,
          currencyCode: true,
          total: true,
          taxAuthorityStatus: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }) as Promise<PrimaryBillingDocumentRecord[]>);
      const requirementsBySource = new Map<string, CustomQuotationGroupChildRecord[]>();
      for (const requirement of requirements) {
        if (!requirement.sourceId) continue;
        const items = requirementsBySource.get(requirement.sourceId) ?? [];
        items.push(requirement);
        requirementsBySource.set(requirement.sourceId, items);
      }
      const versionById = new Map(versions.map((version) => [version.id, version]));
      const billingDocumentsBySalesOrderId = new Map<string, PrimaryBillingDocumentRecord[]>();
      for (const document of billingDocuments) {
        if (!document.sourceId) continue;
        const documents = billingDocumentsBySalesOrderId.get(document.sourceId) ?? [];
        documents.push(document);
        billingDocumentsBySalesOrderId.set(document.sourceId, documents);
      }
      const items = sourceIds.map((sourceId) => {
        const version = versionById.get(sourceId);
        return toCustomQuotationGroup(
          sourceId,
          requirementsBySource.get(sourceId) ?? [],
          version,
          version?.salesOrder ? billingDocumentsBySalesOrderId.get(version.salesOrder.id) ?? [] : [],
        );
      });
      const total = numberValue(totalRows[0]?.total);
      return { items, total, page, pageSize, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) };
    });
    const sources = new Map<string, CommercialSourceRef>();
    for (const group of pageResult.items) {
      for (const requirement of group.requirements) {
        if (!requirement.sourceLineId) continue;
        const source = { sourceType: "CUSTOM_QUOTATION_LINE", sourceId: group.sourceId, sourceLineId: requirement.sourceLineId } as CommercialSourceRef;
        sources.set(customQuotationFinanceSourceKey(source), source);
      }
    }
    const financeResults = sources.size === 0
      ? []
      : await this.finance.readMany({ tenantId, sources: [...sources.values()] });
    const financeBySource = new Map(financeResults.map((result) => [customQuotationFinanceSourceKey(result.source), result]));
    return {
      ...pageResult,
      items: pageResult.items.map(({ fiscalDocumentState, ...group }) => ({
        ...group,
        requirements: group.requirements.map((requirement) => {
          const source = requirement.sourceLineId
            ? { sourceType: "CUSTOM_QUOTATION_LINE", sourceId: group.sourceId, sourceLineId: requirement.sourceLineId } as CommercialSourceRef
            : null;
          return {
            ...requirement,
            ...customQuotationEligibilityProjection(
              financeBySource.get(source ? customQuotationFinanceSourceKey(source) : ""),
              fiscalDocumentState,
            ),
          };
        }),
      })),
    };
  }

  async findStandalone(tenantId: string, requirementId: string) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      const requirement = await this.findStandaloneRequirement(tx, tenantId, requirementId);
      if (!requirement) throw new NotFoundException("OPERATIONAL_STANDALONE_REQUIREMENT_NOT_FOUND");
      const fulfillments = await tx.operationalFulfillment.findMany({
        where: { tenantId, travelPackageId: null, operationalRequirementId: requirementId },
        select: { id: true, status: true, _count: { select: { purchases: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }) as Array<{ id: string; status: string; _count: { purchases: number } }>;
      return {
        ...toDetail(requirement),
        confirmedPassengerIds: [], coverage: { fulfilledPassengerCount: 0, totalPassengerCount: 0 },
        workflow: { fulfillmentCount: fulfillments.length, purchaseCount: fulfillments.reduce((total, fulfillment) => total + fulfillment._count.purchases, 0), fulfillmentStatuses: fulfillments.map((fulfillment) => ({ id: fulfillment.id, status: fulfillment.status })) },
      };
    });
  }

  async updateStandalone(tenantId: string, requirementId: string, input: UpdateOperationalRequirementDto, actor: OperationalRequirementsActor) {
    if (hasCommercialOrAssignmentUpdate(input)) throw new BadRequestException("OPERATIONAL_REQUIREMENT_COMMERCIAL_FIELDS_READ_ONLY");
    if (!hasUpdate(input)) throw new BadRequestException("OPERATIONAL_REQUIREMENT_UPDATE_EMPTY");
    return this.withTenantTransaction(tenantId, async (tx) => {
      await this.requireStandaloneRequirementState(tx, tenantId, requirementId);
      const updated = await tx.operationalRequirement.updateMany({
        where: { id: requirementId, tenantId, scopeType: "STANDALONE_CUSTOMER", travelPackageId: null, customerId: { not: null } },
        data: {
          ...(input.critical === undefined ? {} : { critical: input.critical }),
          ...(input.operationalDeadlineAt === undefined ? {} : { operationalDeadlineAt: optionalDate(input.operationalDeadlineAt, "OPERATIONAL_REQUIREMENT_DEADLINE_INVALID") }),
          updatedByUserId: actor.userId, updatedByName: actor.name,
        },
      });
      if (updated.count !== 1) throw new NotFoundException("OPERATIONAL_STANDALONE_REQUIREMENT_NOT_FOUND");
      const requirement = await this.findStandaloneRequirement(tx, tenantId, requirementId);
      if (!requirement) throw new NotFoundException("OPERATIONAL_STANDALONE_REQUIREMENT_NOT_FOUND");
      return toDetail(requirement);
    });
  }

  async transitionStandaloneStatus(tenantId: string, requirementId: string, input: TransitionOperationalRequirementDto, actor: OperationalRequirementsActor) {
    const target = input.status as RequirementStatus;
    if (target === "FULFILLED") throw new BadRequestException("OPERATIONAL_REQUIREMENT_FULFILLED_PROTECTED");
    return this.withTenantTransaction(tenantId, async (tx) => {
      const current = await this.requireStandaloneRequirementState(tx, tenantId, requirementId);
      if (!STATUS_TRANSITIONS[current.status].includes(target)) throw new ConflictException("OPERATIONAL_REQUIREMENT_STATUS_TRANSITION_INVALID");
      const updated = await tx.operationalRequirement.updateMany({
        where: { id: requirementId, tenantId, scopeType: "STANDALONE_CUSTOMER", travelPackageId: null, customerId: { not: null }, status: current.status },
        data: { status: target, updatedByUserId: actor.userId, updatedByName: actor.name },
      });
      if (updated.count !== 1) throw new ConflictException("OPERATIONAL_REQUIREMENT_STATUS_TRANSITION_CONFLICT");
      const requirement = await this.findStandaloneRequirement(tx, tenantId, requirementId);
      if (!requirement) throw new NotFoundException("OPERATIONAL_STANDALONE_REQUIREMENT_NOT_FOUND");
      return toDetail(requirement);
    });
  }

  async rejectStandalonePassengerAssignment(tenantId: string, requirementId: string) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      await this.requireStandaloneRequirementState(tx, tenantId, requirementId);
      throw new BadRequestException("OPERATIONAL_STANDALONE_PASSENGERS_UNSUPPORTED");
    });
  }

  private async requireTravelPackage(tx: OperationsTransaction, tenantId: string, travelPackageId: string) {
    const travelPackage = await tx.travelPackage.findFirst({
      where: { id: travelPackageId, tenantId },
      select: { id: true },
    });
    if (!travelPackage) throw new NotFoundException("OPERATIONAL_REQUIREMENT_TRAVEL_PACKAGE_NOT_FOUND");
  }

  private async requireParticipants(
    tx: OperationsTransaction,
    tenantId: string,
    travelPackageId: string,
    participantIds: string[],
  ) {
    const participants = await tx.travelPackageParticipant.findMany({
      where: { tenantId, travelPackageId, id: { in: participantIds } },
      select: { id: true },
    }) as Array<{ id: string }>;
    if (participants.length !== participantIds.length) {
      throw new NotFoundException("OPERATIONAL_REQUIREMENT_PARTICIPANT_NOT_FOUND_IN_TRAVEL_PACKAGE");
    }
  }

  private async resolveAssignee(
    tx: OperationsTransaction,
    tenantId: string,
    assignedToUserId: string | null | undefined,
  ): Promise<{ id: string; fullName: string } | null | undefined> {
    if (assignedToUserId === undefined) return undefined;
    if (assignedToUserId === null) return null;
    const user = await tx.user.findFirst({
      where: { id: assignedToUserId, tenantId },
      select: { id: true, fullName: true },
    }) as { id: string; fullName: string } | null;
    if (!user) throw new NotFoundException("OPERATIONAL_REQUIREMENT_ASSIGNEE_NOT_FOUND");
    return user;
  }

  private async requireRequirementState(
    tx: OperationsTransaction,
    tenantId: string,
    travelPackageId: string,
    requirementId: string,
  ): Promise<{ id: string; status: RequirementStatus }> {
    const requirement = await tx.operationalRequirement.findFirst({
      where: { id: requirementId, tenantId, travelPackageId },
      select: { id: true, status: true },
    }) as { id: string; status: RequirementStatus } | null;
    if (!requirement) throw new NotFoundException("OPERATIONAL_REQUIREMENT_NOT_FOUND");
    return requirement;
  }

  private findRequirement(
    tx: OperationsTransaction,
    tenantId: string,
    travelPackageId: string,
    requirementId: string,
  ): Promise<RequirementRecord | null> {
    return tx.operationalRequirement.findFirst({
      where: { id: requirementId, tenantId, travelPackageId },
      select: REQUIREMENT_DETAIL_SELECT,
    }) as Promise<RequirementRecord | null>;
  }

  private findStandaloneRequirement(tx: OperationsTransaction, tenantId: string, requirementId: string): Promise<RequirementRecord | null> {
    return tx.operationalRequirement.findFirst({
      where: { id: requirementId, tenantId, scopeType: "STANDALONE_CUSTOMER", travelPackageId: null, customerId: { not: null } },
      select: REQUIREMENT_DETAIL_SELECT,
    }) as Promise<RequirementRecord | null>;
  }

  private async requireStandaloneRequirementState(tx: OperationsTransaction, tenantId: string, requirementId: string): Promise<{ id: string; status: RequirementStatus }> {
    const requirement = await tx.operationalRequirement.findFirst({
      where: { id: requirementId, tenantId, scopeType: "STANDALONE_CUSTOMER", travelPackageId: null, customerId: { not: null } },
      select: { id: true, status: true },
    }) as { id: string; status: RequirementStatus } | null;
    if (!requirement) throw new NotFoundException("OPERATIONAL_STANDALONE_REQUIREMENT_NOT_FOUND");
    return requirement;
  }

  private async throwLatestTransitionState(
    tx: OperationsTransaction,
    tenantId: string,
    travelPackageId: string,
    requirementId: string,
  ): Promise<never> {
    const latest = await this.requireRequirementState(tx, tenantId, travelPackageId, requirementId);
    if (latest.status === "CANCELLED" || latest.status === "NOT_APPLICABLE") {
      throw new ConflictException("OPERATIONAL_REQUIREMENT_TERMINAL_STATUS");
    }
    throw new ConflictException("OPERATIONAL_REQUIREMENT_STATUS_TRANSITION_CONFLICT");
  }

  private withTenantTransaction<T>(
    tenantId: string,
    work: (tx: OperationsTransaction) => Promise<T>,
  ): Promise<T> {
    return runTenantTransaction(this.database, tenantId, work);
  }
}

function normalizeSource(input: CreateOperationalRequirementDto) {
  const sourceType = input.sourceType;
  if (!OPERATIONAL_SOURCE_TYPES.includes(sourceType)) {
    throw new BadRequestException("OPERATIONAL_REQUIREMENT_SOURCE_TYPE_INVALID");
  }
  const sourceId = optionalText(input.sourceId);
  const sourceReference = optionalText(input.sourceReference);
  if (sourceType !== "MANUAL" && !sourceId && !sourceReference) {
    throw new BadRequestException("OPERATIONAL_REQUIREMENT_SOURCE_TRACEABILITY_REQUIRED");
  }
  return {
    sourceType,
    sourceId,
    sourceLineId: optionalText(input.sourceLineId),
    sourceVersionId: optionalText(input.sourceVersionId),
    sourceReference,
    sourceAcceptedAt: optionalDate(input.sourceAcceptedAt, "OPERATIONAL_REQUIREMENT_SOURCE_ACCEPTED_AT_INVALID"),
    sourcePassengerGroupId: optionalText(input.sourcePassengerGroupId),
    sourcePassengerGroupName: optionalText(input.sourcePassengerGroupName),
    sourcePassengerGroupServiceCode: optionalText(input.sourcePassengerGroupServiceCode),
  };
}

function normalizeSoldContext(input: CreateOperationalRequirementDto) {
  const scope = (input.soldValueScope ?? "NONE") as SoldValueScope;
  if (!OPERATIONAL_SOLD_VALUE_SCOPES.includes(scope)) {
    throw new BadRequestException("OPERATIONAL_REQUIREMENT_SOLD_VALUE_SCOPE_INVALID");
  }
  const amountText = optionalText(input.soldAmount);
  const currency = optionalText(input.soldCurrency)?.toUpperCase() ?? null;
  if (scope === "NONE" && (amountText || currency)) {
    throw new BadRequestException("OPERATIONAL_REQUIREMENT_SOLD_VALUE_NONE_MUST_BE_EMPTY");
  }
  if (!amountText && currency) {
    throw new BadRequestException("OPERATIONAL_REQUIREMENT_SOLD_AMOUNT_REQUIRED");
  }
  if (amountText && !currency) {
    throw new BadRequestException("OPERATIONAL_REQUIREMENT_SOLD_CURRENCY_REQUIRED");
  }
  if (currency && !/^[A-Z]{3}$/.test(currency)) {
    throw new BadRequestException("OPERATIONAL_REQUIREMENT_SOLD_CURRENCY_INVALID");
  }
  const soldAmount = amountText ? decimal(amountText, "OPERATIONAL_REQUIREMENT_SOLD_AMOUNT_INVALID") : null;
  return { soldAmount, soldCurrency: currency, soldValueScope: scope };
}

function requirementListWhere(tenantId: string, travelPackageId: string | null, input: ListOperationalRequirementsDto) {
  const deadlineFrom = input.deadlineFrom === undefined ? undefined : optionalDate(input.deadlineFrom, "OPERATIONAL_REQUIREMENT_DEADLINE_INVALID");
  const deadlineTo = input.deadlineTo === undefined ? undefined : optionalDate(input.deadlineTo, "OPERATIONAL_REQUIREMENT_DEADLINE_INVALID");
  const search = optionalText(input.search);
  return {
    tenantId,
    travelPackageId,
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.servicePurposeCode === undefined ? {} : { servicePurposeCode: requiredText(input.servicePurposeCode, "OPERATIONAL_REQUIREMENT_SERVICE_PURPOSE_CODE_INVALID") }),
    ...(input.critical === undefined ? {} : { critical: input.critical === "true" }),
    ...(input.assignedToUserId === undefined ? {} : { assignedToUserId: requiredText(input.assignedToUserId, "OPERATIONAL_REQUIREMENT_ASSIGNEE_INVALID") }),
    ...(input.sourceType === undefined ? {} : { sourceType: requiredText(input.sourceType, "OPERATIONAL_REQUIREMENT_SOURCE_TYPE_INVALID") }),
    ...(deadlineFrom === undefined && deadlineTo === undefined ? {} : {
      operationalDeadlineAt: { ...(deadlineFrom === undefined ? {} : { gte: deadlineFrom }), ...(deadlineTo === undefined ? {} : { lte: deadlineTo }) },
    }),
    ...(search ? { OR: [{ description: { contains: search, mode: "insensitive" } }, { sourceReference: { contains: search, mode: "insensitive" } }, { customer: { is: { fullName: { contains: search, mode: "insensitive" } } } }] } : {}),
  };
}

function customQuotationGroupWhere(tenantId: string, input: Pick<ListOperationalRequirementsDto, "search">) {
  const search = optionalText(input.search);
  return {
    tenantId,
    scopeType: "STANDALONE_CUSTOMER" as const,
    travelPackageId: null,
    customerId: { not: null },
    sourceType: "CUSTOM_QUOTATION_LINE",
    sourceId: { not: null },
    ...(search ? {
      OR: [
        { description: { contains: search, mode: "insensitive" } },
        { customer: { is: { fullName: { contains: search, mode: "insensitive" } } } },
      ],
    } : {}),
  };
}

function countCustomQuotationGroups(tx: OperationsTransaction, tenantId: string, search: string | null) {
  const searchClause = search
    ? Prisma.sql`AND (requirement."description" ILIKE ${`%${search}%`} OR customer."fullName" ILIKE ${`%${search}%`})`
    : Prisma.empty;
  return tx.$queryRaw<Array<{ total: bigint | number }>>`
    SELECT COUNT(DISTINCT requirement."sourceId") AS total
    FROM "operational_requirements" requirement
    INNER JOIN "Client" customer
      ON customer."id" = requirement."customerId" AND customer."tenantId" = requirement."tenantId"
    WHERE requirement."tenantId" = ${tenantId}
      AND requirement."scopeType" = 'STANDALONE_CUSTOMER'
      AND requirement."travelPackageId" IS NULL
      AND requirement."sourceType" = 'CUSTOM_QUOTATION_LINE'
      AND requirement."sourceId" IS NOT NULL
      ${searchClause}
  `;
}

function toCustomQuotationGroup(
  sourceId: string,
  requirements: CustomQuotationGroupChildRecord[],
  version: CustomQuotationVersionRecord | undefined,
  billingDocuments: PrimaryBillingDocumentRecord[],
) {
  const billingDocument = billingDocuments.find((document) => document.taxAuthorityStatus === "ACCEPTED");
  const fiscalDocumentState: "MISSING" | "PENDING" | "ACCEPTED" = billingDocuments.length === 0
    ? "MISSING"
    : billingDocument ? "ACCEPTED" : "PENDING";
  const first = requirements[0];
  const currencies = [...new Set(requirements.map((requirement) => requirement.soldCurrency).filter((value): value is string => Boolean(value)))];
  const currency = currencies.length === 1 ? currencies[0] : null;
  const hasCompleteValues = Boolean(currency) && requirements.every((requirement) => requirement.soldAmount !== null && requirement.soldCurrency === currency);
  const total = hasCompleteValues
    ? requirements.reduce((sum, requirement) => sum.plus(requirement.soldAmount!), new Prisma.Decimal(0)).toFixed()
    : null;
  return {
    sourceType: "CUSTOM_QUOTATION_LINE",
    sourceId,
    quotationVersionId: sourceId,
    customer: first?.customer
      ? { id: first.customer.id, fullName: first.customer.fullName, idType: first.customer.idType, idNumber: first.customer.idNumber }
      : null,
    quotationNumber: version?.customQuotation.quotationNumber ?? null,
    salesOrderNumber: version?.salesOrder?.orderNumber ?? null,
    billingDocumentId: billingDocument?.id ?? null,
    billingDocumentType: billingDocument?.documentTypeCode ?? null,
    fiscalDocumentNumber: billingDocument?.fiscalNumber ?? null,
    fiscalKey: billingDocument?.haciendaKey ?? null,
    fiscalTotal: billingDocument
      ? { amount: billingDocument.total.toFixed(), currency: billingDocument.currencyCode }
      : null,
    fiscalStatus: billingDocument?.taxAuthorityStatus ?? null,
    fiscalDocumentState,
    createdAt: requirements.reduce<Date | null>((earliest, requirement) => !earliest || requirement.createdAt < earliest ? requirement.createdAt : earliest, null),
    status: customQuotationGroupStatus(requirements.map((requirement) => requirement.status)),
    currency,
    commercialValue: { amount: total, currency },
    serviceCount: requirements.length,
    requirements: requirements.map((requirement) => ({
      requirementId: requirement.id,
      sourceLineId: requirement.sourceLineId,
      description: requirement.description,
      commercialValue: { amount: requirement.soldAmount?.toFixed() ?? null, currency: requirement.soldCurrency },
      status: requirement.status,
    })),
  };
}

function customQuotationFinanceSourceKey(source: CommercialSourceRef) {
  return `${source.sourceType}\u0000${source.sourceId}\u0000${source.sourceLineId ?? ""}`;
}

function customQuotationEligibilityProjection(
  finance: FinanceEligibilityResult | undefined,
  fiscalDocumentState: "MISSING" | "PENDING" | "ACCEPTED",
): {
  eligibilityStatus: CustomQuotationFinanceEligibilityStatus;
  eligibilityReason: string | null;
  outstandingAmount: string | null;
  currency: string | null;
} {
  if (finance?.eligibility === "ELIGIBLE") {
    return {
      eligibilityStatus: "LISTO_PARA_PROCESAR",
      eligibilityReason: finance.reason,
      outstandingAmount: finance.financial?.outstandingAmount ?? null,
      currency: finance.financial?.currency ?? null,
    };
  }
  if (fiscalDocumentState === "MISSING") {
    return { eligibilityStatus: "PENDIENTE_FACTURACION", eligibilityReason: finance?.reason ?? null, outstandingAmount: null, currency: null };
  }
  if (fiscalDocumentState === "PENDING") {
    return { eligibilityStatus: "PENDIENTE_ACEPTACION_FISCAL", eligibilityReason: finance?.reason ?? null, outstandingAmount: null, currency: null };
  }
  if (finance?.reason === "OUTSTANDING_BALANCE") {
    return {
      eligibilityStatus: "PENDIENTE_PAGO",
      eligibilityReason: finance.reason,
      outstandingAmount: finance.financial?.outstandingAmount ?? null,
      currency: finance.financial?.currency ?? null,
    };
  }
  return {
    eligibilityStatus: "PENDIENTE_REGISTRO_FINANCIERO",
    eligibilityReason: finance?.reason ?? null,
    outstandingAmount: finance?.financial?.outstandingAmount ?? null,
    currency: finance?.financial?.currency ?? null,
  };
}

function customQuotationGroupStatus(statuses: RequirementStatus[]) {
  if (statuses.every((status) => status === "PENDING")) return "PENDING" as const;
  if (statuses.some((status) => status === "PENDING" || status === "IN_PROGRESS")) return "IN_PROGRESS" as const;
  if (statuses.every((status) => status === "CANCELLED")) return "CANCELLED" as const;
  if (statuses.every((status) => status === "NOT_APPLICABLE")) return "NOT_APPLICABLE" as const;
  return "COMPLETED" as const;
}

function numberValue(value: bigint | number | undefined) {
  return typeof value === "bigint" ? Number(value) : value ?? 0;
}

function hasUpdate(input: UpdateOperationalRequirementDto) {
  return input.critical !== undefined || input.operationalDeadlineAt !== undefined;
}

function hasCommercialOrAssignmentUpdate(input: UpdateOperationalRequirementDto) {
  return input.servicePurposeCode !== undefined
    || input.servicePurposeName !== undefined
    || input.description !== undefined
    || input.assignedToUserId !== undefined
    || input.sourceReference !== undefined
    || input.sourcePassengerGroupId !== undefined
    || input.sourcePassengerGroupName !== undefined
    || input.sourcePassengerGroupServiceCode !== undefined;
}

function uniqueParticipantIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) {
    throw new BadRequestException("OPERATIONAL_REQUIREMENT_PARTICIPANTS_INVALID");
  }
  const ids = value.map((item) => (typeof item === "string" ? item.trim() : ""));
  if (ids.some((id) => !id || id.length > 191)) {
    throw new BadRequestException("OPERATIONAL_REQUIREMENT_PARTICIPANTS_INVALID");
  }
  return [...new Set(ids)];
}

function requiredText(value: unknown, errorCode: string): string {
  const normalized = optionalText(value);
  if (!normalized) throw new BadRequestException(errorCode);
  return normalized;
}

function optionalText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function optionalDate(value: unknown, errorCode: string): Date | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new BadRequestException(errorCode);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException(errorCode);
  return parsed;
}

function decimal(value: string, errorCode: string): Prisma.Decimal {
  try {
    const parsed = new Prisma.Decimal(value);
    const maximum = new Prisma.Decimal("99999999999999.99999");
    if (parsed.isNegative() || parsed.greaterThan(maximum)) throw new Error("out of range");
    return parsed;
  } catch {
    throw new BadRequestException(errorCode);
  }
}

function normalizePage(value: number | undefined) {
  return Number.isInteger(value) && value! > 0 ? value! : 1;
}

function normalizePageSize(value: number | undefined) {
  if (value === undefined) return 20;
  if (!Number.isInteger(value) || value < 1 || value > 25) {
    throw new BadRequestException("OPERATIONAL_REQUIREMENT_PAGE_SIZE_INVALID");
  }
  return value;
}

function toSummary(requirement: RequirementSummaryRecord) {
  return {
    ...commonResponse(requirement),
    passengerCount: requirement._count.passengers,
  };
}

function toDetail(requirement: RequirementRecord) {
  return {
    ...commonResponse(requirement),
    passengers: requirement.passengers.map((passenger) => ({
      travelPackageParticipantId: passenger.travelPackageParticipantId,
      clientId: passenger.travelPackageParticipant.clientId,
      fullName: passenger.travelPackageParticipant.client.fullName,
      role: passenger.travelPackageParticipant.role,
    })),
  };
}

function commonResponse(requirement: Omit<RequirementRecord, "passengers">) {
  return {
    id: requirement.id,
    scopeType: requirement.scopeType,
    travelPackageId: requirement.travelPackageId,
    customer: requirement.customer ? { id: requirement.customer.id, fullName: requirement.customer.fullName } : null,
    servicePurposeCode: requirement.servicePurposeCode,
    servicePurposeName: requirement.servicePurposeName,
    description: requirement.description,
    status: requirement.status,
    critical: requirement.critical,
    operationalDeadlineAt: requirement.operationalDeadlineAt,
    assignedTo: requirement.assignedToUserId
      ? { userId: requirement.assignedToUserId, name: requirement.assignedToName }
      : null,
    source: {
      type: requirement.sourceType,
      id: requirement.sourceId,
      lineId: requirement.sourceLineId,
      versionId: requirement.sourceVersionId,
      reference: requirement.sourceReference,
      acceptedAt: requirement.sourceAcceptedAt,
      passengerGroup: {
        id: requirement.sourcePassengerGroupId,
        name: requirement.sourcePassengerGroupName,
        serviceCode: requirement.sourcePassengerGroupServiceCode,
      },
    },
    soldValue: {
      amount: requirement.soldAmount?.toFixed() ?? null,
      currency: requirement.soldCurrency,
      scope: requirement.soldValueScope,
    },
    createdAt: requirement.createdAt,
    updatedAt: requirement.updatedAt,
  };
}
