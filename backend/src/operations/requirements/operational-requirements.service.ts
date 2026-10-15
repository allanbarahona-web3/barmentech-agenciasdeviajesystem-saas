import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { FINANCE_ELIGIBILITY_READER, type CommercialSourceRef, type FinanceEligibilityReader, type FinanceEligibilityResult } from "../../finance/eligibility-read/finance-eligibility-reader.port";
import { PrismaService } from "../../prisma/prisma.service";
import { DEFAULT_FISCAL_TIMEZONE, nextTenantCalendarDate, tenantCalendarDateForInstant, tenantCalendarDateStartAsUtc } from "../../finance/tenant-fiscal-date";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import { passengerOperationalContexts } from "../passenger-operational-context";
import {
  CreateOperationalRequirementDto,
  type ListCustomQuotationOperationsHistoryDto,
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
  operationalPurchase: Record<string, (...args: any[]) => Promise<any>>;
  operationalEvidence: Record<string, (...args: any[]) => Promise<any>>;
  customQuotationVersion: Record<string, (...args: any[]) => Promise<any>>;
  billingDocument: Record<string, (...args: any[]) => Promise<any>>;
  tenantBillingConfiguration: Record<string, (...args: any[]) => Promise<any>>;
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
    dateOfBirth: Date | null;
    client: { fullName: string };
  };
};
type RequirementRecord = {
  id: string;
  scopeType: "TRAVEL_PACKAGE" | "STANDALONE_CUSTOMER";
  travelPackageId: string | null;
  customerId: string | null;
  customerDateOfBirth: Date | null;
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
  travelPackage?: { departureDate: Date } | null;
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
  fulfillments: Array<{ id: string }>;
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
type CustomQuotationHistoryEvidenceRecord = { id: string; originalFilename: string; mimeType: string; byteSize: number; createdAt: Date };
type CustomQuotationHistoryPurchaseRecord = {
  id: string;
  providerName: string;
  supplierReference: string | null;
  amount: Prisma.Decimal;
  currency: string;
  taxAmount: Prisma.Decimal | null;
  purchasedAt: Date;
  supplierInvoiceNumber: string | null;
  notes: string | null;
  evidence: CustomQuotationHistoryEvidenceRecord[];
  _count: { evidence: number };
};
type CustomQuotationHistoryFulfillmentRecord = {
  id: string;
  status: "CONFIRMED" | "CANCELLED";
  confirmationReference: string | null;
  servicePurposeCode: string;
  updatedAt: Date;
  operationalRequirement: {
    id: string;
    status: RequirementStatus;
    description: string;
    sourceId: string | null;
    customer: { id: string; fullName: string; idType: string | null; idNumber: string; email: string | null } | null;
  };
  purchases: CustomQuotationHistoryPurchaseRecord[];
};
type ActiveCustomerPageSource = { customerId: string | null; sourceId: string; groupKey: string };
type HistoryCustomerPageFulfillment = { customerId: string | null; fulfillmentId: string; groupKey: string };

type CustomQuotationHistoryDetailRecord = {
  id: string;
  status: "CONFIRMED" | "CANCELLED";
  updatedAt: Date;
  servicePurposeCode: string;
  servicePurposeName: string;
  providerName: string | null;
  providerReference: string | null;
  reservationCode: string | null;
  confirmationReference: string | null;
  voucherReference: string | null;
  ticketReference: string | null;
  serviceStartAt: Date | null;
  serviceEndAt: Date | null;
  detailPayload: Prisma.JsonValue | null;
  detailVersion: number | null;
  confirmationNotes: string | null;
  operationalRequirement: {
    id: string;
    sourceType: string | null;
    sourceId: string | null;
    sourceLineId: string | null;
    description: string;
    customer: { id: string; fullName: string; idType: string | null; idNumber: string; email: string | null } | null;
  };
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
  customerDateOfBirth: true,
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
  travelPackage: { select: { departureDate: true } },
  passengers: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      travelPackageParticipantId: true,
      travelPackageParticipant: {
        select: {
          id: true,
          clientId: true,
          role: true,
          dateOfBirth: true,
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

const CUSTOM_QUOTATION_HISTORY_FULFILLMENT_SELECT = {
  id: true,
  status: true,
  confirmationReference: true,
  servicePurposeCode: true,
  updatedAt: true,
  operationalRequirement: {
    select: {
      id: true,
      status: true,
      description: true,
      sourceId: true,
      customer: { select: { id: true, fullName: true, idType: true, idNumber: true, email: true } },
    },
  },
  purchases: {
    take: 1,
    orderBy: [{ purchasedAt: "desc" }, { id: "asc" }],
    select: {
      id: true,
      providerName: true,
      supplierReference: true,
      amount: true,
      currency: true,
      taxAmount: true,
      purchasedAt: true,
      supplierInvoiceNumber: true,
      notes: true,
      _count: { select: { evidence: true } },
    },
  },
} as const;

const CUSTOM_QUOTATION_HISTORY_DETAIL_SELECT = {
  id: true,
  status: true,
  updatedAt: true,
  servicePurposeCode: true,
  servicePurposeName: true,
  providerName: true,
  providerReference: true,
  reservationCode: true,
  confirmationReference: true,
  voucherReference: true,
  ticketReference: true,
  serviceStartAt: true,
  serviceEndAt: true,
  detailPayload: true,
  detailVersion: true,
  confirmationNotes: true,
  operationalRequirement: { select: {
    id: true, sourceType: true, sourceId: true, sourceLineId: true, description: true,
    customer: { select: { id: true, fullName: true, idType: true, idNumber: true, email: true } },
  } },
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
      return { ...await this.detail(tx, tenantId, requirement), confirmedPassengerIds, coverage: { fulfilledPassengerCount: confirmedPassengerIds.length, totalPassengerCount: requirement.passengers.length } };
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
    const pageResult = await this.withTenantTransaction(tenantId, async (tx) => {
      const [pageSources, totalRows] = await Promise.all([
        pageActiveCustomQuotationCustomerSources(tx, tenantId, optionalText(input.search), page, pageSize),
        countActiveCustomQuotationCustomers(tx, tenantId, optionalText(input.search)),
      ]);
      const sourceIds = [...new Set(pageSources.map((row) => row.sourceId))];
      if (sourceIds.length === 0) {
        const total = numberValue(totalRows[0]?.total);
        return { items: [], customerGroups: [], total, page, pageSize, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) };
      }
      const [requirements, versions] = await Promise.all([
        tx.operationalRequirement.findMany({
          where: { ...customQuotationActiveWhere(tenantId, {}), sourceId: { in: sourceIds } },
          select: {
            ...CUSTOM_QUOTATION_GROUP_CHILD_SELECT,
            fulfillments: {
              where: { tenantId, travelPackageId: null, status: "CONFIRMED" },
              select: { id: true },
              take: 1,
            },
          },
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
      return {
        items,
        customerGroups: groupActiveCustomQuotationCustomers(items, pageSources),
        total,
        page,
        pageSize,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      };
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
      customerGroups: pageResult.customerGroups.map((customerGroup) => ({
        ...customerGroup,
        groups: customerGroup.groups.map(({ fiscalDocumentState, ...group }) => ({
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
      })),
    };
  }

  /**
   * Read-only terminal history. `finalizedAt` is the fulfillment `updatedAt`
   * written by the terminal CONFIRMED/CANCELLED transition; no client date is
   * used as an authority.
   */
  async listStandaloneCustomQuotationHistory(tenantId: string, input: ListCustomQuotationOperationsHistoryDto) {
    const page = normalizePage(input.page);
    const pageSize = normalizePageSize(input.pageSize);
    return this.withTenantTransaction(tenantId, async (tx) => {
      const configuration = await tx.tenantBillingConfiguration.findUnique({
        where: { tenantId }, select: { fiscalTimezone: true },
      }) as { fiscalTimezone: string } | null;
      const finalizationRange = customQuotationHistoryDateRange(input, configuration?.fiscalTimezone ?? DEFAULT_FISCAL_TIMEZONE);
      const search = optionalText(input.search);
      const fiscalVersionIds = search
        ? await customQuotationFiscalSearchVersionIds(tx, tenantId, search)
        : [];
      const [pageFulfillments, totalRows] = await Promise.all([
        pageCustomQuotationHistoryCustomers(tx, tenantId, finalizationRange, search, fiscalVersionIds, page, pageSize),
        countCustomQuotationHistoryCustomers(tx, tenantId, finalizationRange, search, fiscalVersionIds),
      ]);
      const fulfillmentIds = pageFulfillments.map((row) => row.fulfillmentId);
      if (fulfillmentIds.length === 0) {
        const total = numberValue(totalRows[0]?.total);
        return {
          items: [], customerGroups: [], total, page, pageSize,
          totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
          dateAuthority: "FULFILLMENT_FINALIZED_AT" as const,
        };
      }
      const rows = await (tx.operationalFulfillment.findMany({
        where: { ...customQuotationHistoryWhere(tenantId, finalizationRange, null, []), id: { in: fulfillmentIds } },
        select: CUSTOM_QUOTATION_HISTORY_FULFILLMENT_SELECT,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      }) as Promise<CustomQuotationHistoryFulfillmentRecord[]>);
      const rowsById = new Map(rows.map((row) => [row.id, row]));
      const orderedRows = fulfillmentIds.map((id) => rowsById.get(id)).filter((row): row is CustomQuotationHistoryFulfillmentRecord => Boolean(row));
      const sourceIds = [...new Set(orderedRows.map((row) => row.operationalRequirement.sourceId).filter((value): value is string => Boolean(value)))];
      const versions = sourceIds.length === 0 ? [] : await tx.customQuotationVersion.findMany({
        where: { tenantId, id: { in: sourceIds } },
        select: {
          id: true,
          customQuotation: { select: { quotationNumber: true } },
          salesOrder: { select: { id: true, orderNumber: true } },
        },
      }) as CustomQuotationVersionRecord[];
      const salesOrderIds = versions.flatMap((version) => version.salesOrder ? [version.salesOrder.id] : []);
      const billingDocuments = salesOrderIds.length === 0 ? [] : await tx.billingDocument.findMany({
        where: { tenantId, sourceType: "SALES_ORDER", sourceId: { in: salesOrderIds }, sourceRole: "PRIMARY" },
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
      }) as PrimaryBillingDocumentRecord[];
      const versionById = new Map(versions.map((version) => [version.id, version]));
      const billingDocumentsBySalesOrderId = new Map<string, PrimaryBillingDocumentRecord[]>();
      for (const document of billingDocuments) {
        if (!document.sourceId) continue;
        const items = billingDocumentsBySalesOrderId.get(document.sourceId) ?? [];
        items.push(document);
        billingDocumentsBySalesOrderId.set(document.sourceId, items);
      }
      const items = orderedRows.map((row) => {
        const version = versionById.get(row.operationalRequirement.sourceId ?? "");
        return toCustomQuotationHistoryRow(
          row,
          version,
          version?.salesOrder ? billingDocumentsBySalesOrderId.get(version.salesOrder.id) ?? [] : [],
        );
      });
      const total = numberValue(totalRows[0]?.total);
      return {
        items,
        customerGroups: groupCustomQuotationHistoryCustomers(items, pageFulfillments),
        total,
        page,
        pageSize,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
        dateAuthority: "FULFILLMENT_FINALIZED_AT" as const,
      };
    });
  }

  /** Bounded, read-only terminal-detail projection for the Custom Quotation history. */
  async findStandaloneCustomQuotationHistory(tenantId: string, fulfillmentId: string) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      const fulfillment = await tx.operationalFulfillment.findFirst({
        where: { ...customQuotationHistoryWhere(tenantId, undefined, null, []), id: fulfillmentId },
        select: CUSTOM_QUOTATION_HISTORY_DETAIL_SELECT,
      }) as CustomQuotationHistoryDetailRecord | null;
      if (!fulfillment) throw new NotFoundException("OPERATIONAL_CUSTOM_QUOTATION_HISTORY_FULFILLMENT_NOT_FOUND");

      const [version, purchases, evidence] = await Promise.all([
        fulfillment.operationalRequirement.sourceId ? tx.customQuotationVersion.findFirst({
          where: { tenantId, id: fulfillment.operationalRequirement.sourceId },
          select: { id: true, customQuotation: { select: { quotationNumber: true } }, salesOrder: { select: { id: true, orderNumber: true } } },
        }) : null,
        tx.operationalPurchase.findMany({
          where: { tenantId, operationalFulfillmentId: fulfillment.id },
          select: { id: true, providerName: true, supplierReference: true, amount: true, currency: true, taxAmount: true, purchasedAt: true, supplierInvoiceNumber: true, notes: true },
          orderBy: [{ purchasedAt: "desc" }, { id: "desc" }],
        }),
        tx.operationalEvidence.findMany({
          where: { tenantId, operationalFulfillmentId: fulfillment.id },
          select: { id: true, operationalPurchaseId: true, evidenceType: true, originalFilename: true, mimeType: true, byteSize: true, uploadedByUserId: true, uploadedByName: true, createdAt: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }),
      ]);
      const fiscalDocuments = version?.salesOrder ? await tx.billingDocument.findMany({
        where: { tenantId, sourceType: "SALES_ORDER", sourceId: version.salesOrder.id, sourceRole: "PRIMARY" },
        select: { id: true, documentTypeCode: true, fiscalNumber: true, taxAuthorityStatus: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }) : [];
      const fiscalDocument = fiscalDocuments.find((document: any) => document.taxAuthorityStatus === "ACCEPTED") ?? fiscalDocuments[0] ?? null;
      return {
        fulfillmentId: fulfillment.id,
        requirementId: fulfillment.operationalRequirement.id,
        sourceType: fulfillment.operationalRequirement.sourceType,
        sourceId: fulfillment.operationalRequirement.sourceId,
        sourceLineId: fulfillment.operationalRequirement.sourceLineId,
        servicePurposeCode: fulfillment.servicePurposeCode,
        servicePurposeName: fulfillment.servicePurposeName,
        terminalStatus: fulfillment.status,
        terminalAt: fulfillment.updatedAt,
        customer: fulfillment.operationalRequirement.customer,
        quotationVersionId: fulfillment.operationalRequirement.sourceId,
        quotationNumber: version?.customQuotation.quotationNumber ?? null,
        salesOrderNumber: version?.salesOrder?.orderNumber ?? null,
        fiscalDocument: fiscalDocument ? { id: fiscalDocument.id, type: fiscalDocument.documentTypeCode, number: fiscalDocument.fiscalNumber } : null,
        serviceDescription: fulfillment.operationalRequirement.description,
        fulfillment: {
          providerName: fulfillment.providerName,
          providerReference: fulfillment.providerReference,
          reservationCode: fulfillment.reservationCode,
          confirmationReference: fulfillment.confirmationReference,
          voucherReference: fulfillment.voucherReference,
          ticketReference: fulfillment.ticketReference,
          serviceStartAt: fulfillment.serviceStartAt,
          serviceEndAt: fulfillment.serviceEndAt,
          confirmationNotes: fulfillment.confirmationNotes,
        },
        detailPayload: fulfillment.detailPayload,
        detailVersion: fulfillment.detailVersion,
        purchase: purchases[0] ? toCustomQuotationHistoryPurchase(purchases[0]) : null,
        purchases: purchases.map(toCustomQuotationHistoryPurchase),
        evidence: evidence.map((item: any) => ({
          evidenceId: item.id,
          purchaseId: item.operationalPurchaseId,
          evidenceType: item.evidenceType,
          originalFilename: item.originalFilename,
          mimeType: item.mimeType,
          byteSize: item.byteSize,
          uploadedBy: { userId: item.uploadedByUserId, name: item.uploadedByName },
          createdAt: item.createdAt,
        })),
      };
    });
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
      const displayRequirement = {
        ...requirement,
        status: customQuotationDisplayStatus(
          requirement.status,
          requirement.sourceType,
          fulfillments.some((fulfillment) => fulfillment.status === "CONFIRMED"),
        ),
      };
      return {
        ...await this.detail(tx, tenantId, displayRequirement),
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

  private async detail(tx: OperationsTransaction, tenantId: string, requirement: RequirementRecord) {
    const configuration = await tx.tenantBillingConfiguration.findUnique({
      where: { tenantId },
      select: { fiscalTimezone: true },
    }) as { fiscalTimezone: string } | null;
    const tenantTimezone = configuration?.fiscalTimezone ?? DEFAULT_FISCAL_TIMEZONE;
    return withPassengerContexts(requirement, {
      tenantTimezone,
      tenantCurrentDate: tenantCalendarDateForInstant(new Date(), tenantTimezone),
    });
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

function customQuotationActiveWhere(tenantId: string, input: Pick<ListOperationalRequirementsDto, "search">) {
  const search = optionalText(input.search);
  return {
    tenantId,
    scopeType: "STANDALONE_CUSTOMER" as const,
    travelPackageId: null,
    sourceType: "CUSTOM_QUOTATION_LINE",
    sourceId: { not: null },
    status: { in: ["PENDING", "IN_PROGRESS"] },
    NOT: { fulfillments: { some: { status: { in: ["CONFIRMED", "CANCELLED"] } } } },
    ...(search ? {
      OR: [
        { description: { contains: search, mode: "insensitive" } },
        { customer: { is: { fullName: { contains: search, mode: "insensitive" } } } },
      ],
    } : {}),
  };
}

const DIACRITIC_FROM = "áàäâãåāăąéèëêēĕėęěíìïîīĭįıóòöôõōŏőúùüûūŭůűųñńçćčýÿ";
const DIACRITIC_TO = "aaaaaaaaaeeeeeeeeeiiiiiiiioooooooouuuuuuuuunncccyy";

function normalizeAccentInsensitiveSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function accentInsensitiveContainsClause(search: string | null, columns: string[]) {
  if (!search) return Prisma.empty;
  const pattern = `%${normalizeAccentInsensitiveSearch(search)}%`;
  const expressions = columns.map((column) => Prisma.sql`translate(lower(${Prisma.raw(column)}), ${DIACRITIC_FROM}, ${DIACRITIC_TO}) LIKE ${pattern}`);
  return Prisma.sql`AND (${Prisma.join(expressions, " OR ")})`;
}

function activeCustomQuotationBaseSql(tenantId: string, search: string | null) {
  const searchClause = accentInsensitiveContainsClause(search, ["requirement.\"description\"", "customer.\"fullName\""]);
  return Prisma.sql`
    FROM "operational_requirements" requirement
    LEFT JOIN "Client" customer
      ON customer."id" = requirement."customerId" AND customer."tenantId" = requirement."tenantId"
    WHERE requirement."tenantId" = ${tenantId}
      AND requirement."scopeType" = 'STANDALONE_CUSTOMER'
      AND requirement."travelPackageId" IS NULL
      AND requirement."sourceType" = 'CUSTOM_QUOTATION_LINE'
      AND requirement."sourceId" IS NOT NULL
      AND requirement."status" IN ('PENDING', 'IN_PROGRESS')
      AND NOT EXISTS (
        SELECT 1
        FROM "operational_fulfillments" fulfillment
        WHERE fulfillment."tenantId" = requirement."tenantId"
          AND fulfillment."travelPackageId" IS NULL
          AND fulfillment."operationalRequirementId" = requirement."id"
          AND fulfillment."status" IN ('CONFIRMED', 'CANCELLED')
      )
      ${searchClause}
  `;
}

function pageActiveCustomQuotationCustomerSources(
  tx: OperationsTransaction,
  tenantId: string,
  search: string | null,
  page: number,
  pageSize: number,
) {
  const base = activeCustomQuotationBaseSql(tenantId, search);
  return tx.$queryRaw<ActiveCustomerPageSource[]>`
    WITH filtered_sources AS (
      SELECT requirement."customerId", requirement."sourceId", MIN(requirement."createdAt") AS "sourceCreatedAt"
      ${base}
      GROUP BY requirement."customerId", requirement."sourceId"
    ), customer_groups AS (
      SELECT "customerId",
        CASE WHEN "customerId" IS NULL THEN "sourceId" ELSE NULL END AS "nullSourceId",
        MIN("sourceCreatedAt") AS "groupCreatedAt",
        MIN("sourceId") AS "groupTie"
      FROM filtered_sources
      GROUP BY "customerId", CASE WHEN "customerId" IS NULL THEN "sourceId" ELSE NULL END
    ), paged_groups AS (
      SELECT *
      FROM customer_groups
      ORDER BY "groupCreatedAt" ASC, "groupTie" ASC, "customerId" ASC NULLS LAST
      OFFSET ${(page - 1) * pageSize} LIMIT ${pageSize}
    )
    SELECT source."customerId", source."sourceId",
      CASE WHEN paged."customerId" IS NULL THEN concat('null:', source."sourceId") ELSE concat('customer:', paged."customerId") END AS "groupKey"
    FROM filtered_sources source
    INNER JOIN paged_groups paged
      ON (source."customerId" = paged."customerId" OR (source."customerId" IS NULL AND paged."customerId" IS NULL AND source."sourceId" = paged."nullSourceId"))
    ORDER BY paged."groupCreatedAt" ASC, paged."groupTie" ASC, paged."customerId" ASC NULLS LAST, source."sourceCreatedAt" ASC, source."sourceId" ASC
  `;
}

function countActiveCustomQuotationCustomers(tx: OperationsTransaction, tenantId: string, search: string | null) {
  const base = activeCustomQuotationBaseSql(tenantId, search);
  return tx.$queryRaw<Array<{ total: bigint | number }>>`
    WITH filtered_sources AS (
      SELECT requirement."customerId", requirement."sourceId"
      ${base}
      GROUP BY requirement."customerId", requirement."sourceId"
    )
    SELECT COUNT(*) AS total
    FROM (
      SELECT "customerId", CASE WHEN "customerId" IS NULL THEN "sourceId" ELSE NULL END
      FROM filtered_sources
      GROUP BY "customerId", CASE WHEN "customerId" IS NULL THEN "sourceId" ELSE NULL END
    ) customer_groups
  `;
}

function customQuotationHistoryWhere(
  tenantId: string,
  finalizedAt: { gte: Date; lt: Date } | undefined,
  search: string | null,
  fiscalVersionIds: string[],
) {
  const customerSearch = search ? {
    operationalRequirement: {
      is: {
        customer: {
          is: {
            OR: [
              { fullName: { contains: search, mode: "insensitive" } },
              { idNumber: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      },
    },
  } : null;
  const fiscalSearch = fiscalVersionIds.length > 0 ? {
    operationalRequirement: { is: { sourceId: { in: fiscalVersionIds } } },
  } : null;
  return {
    tenantId,
    travelPackageId: null,
    status: { in: ["CONFIRMED", "CANCELLED"] },
    ...(finalizedAt ? { updatedAt: finalizedAt } : {}),
    AND: [
      {
        operationalRequirement: {
          is: {
            tenantId,
            scopeType: "STANDALONE_CUSTOMER",
            travelPackageId: null,
            sourceType: "CUSTOM_QUOTATION_LINE",
            sourceId: { not: null },
          },
        },
      },
      ...(customerSearch || fiscalSearch ? [{ OR: [customerSearch, fiscalSearch].filter(Boolean) }] : []),
    ],
  };
}

function customQuotationHistoryBaseSql(
  tenantId: string,
  finalizedAt: { gte: Date; lt: Date } | undefined,
  search: string | null,
  fiscalVersionIds: string[],
) {
  const customerSearch = search
    ? accentInsensitiveContainsClause(search, ["customer.\"fullName\"", "customer.\"idNumber\"", "customer.\"email\""])
    : Prisma.empty;
  const fiscalSearch = fiscalVersionIds.length > 0
    ? Prisma.sql`requirement."sourceId" IN (${Prisma.join(fiscalVersionIds)})`
    : Prisma.empty;
  const searchClause = search
    ? fiscalVersionIds.length > 0
      ? Prisma.sql`AND ((translate(lower(customer."fullName"), ${DIACRITIC_FROM}, ${DIACRITIC_TO}) LIKE ${`%${normalizeAccentInsensitiveSearch(search)}%`}
          OR translate(lower(customer."idNumber"), ${DIACRITIC_FROM}, ${DIACRITIC_TO}) LIKE ${`%${normalizeAccentInsensitiveSearch(search)}%`}
          OR translate(lower(customer."email"), ${DIACRITIC_FROM}, ${DIACRITIC_TO}) LIKE ${`%${normalizeAccentInsensitiveSearch(search)}%`}) OR ${fiscalSearch})`
      : customerSearch
    : Prisma.empty;
  return Prisma.sql`
    FROM "operational_fulfillments" fulfillment
    INNER JOIN "operational_requirements" requirement
      ON requirement."id" = fulfillment."operationalRequirementId" AND requirement."tenantId" = fulfillment."tenantId"
    LEFT JOIN "Client" customer
      ON customer."id" = requirement."customerId" AND customer."tenantId" = requirement."tenantId"
    WHERE fulfillment."tenantId" = ${tenantId}
      AND fulfillment."travelPackageId" IS NULL
      AND fulfillment."status" IN ('CONFIRMED', 'CANCELLED')
      AND requirement."tenantId" = ${tenantId}
      AND requirement."scopeType" = 'STANDALONE_CUSTOMER'
      AND requirement."travelPackageId" IS NULL
      AND requirement."sourceType" = 'CUSTOM_QUOTATION_LINE'
      AND requirement."sourceId" IS NOT NULL
      ${finalizedAt ? Prisma.sql`AND fulfillment."updatedAt" >= ${finalizedAt.gte} AND fulfillment."updatedAt" < ${finalizedAt.lt}` : Prisma.empty}
      ${searchClause}
  `;
}

function pageCustomQuotationHistoryCustomers(
  tx: OperationsTransaction,
  tenantId: string,
  finalizedAt: { gte: Date; lt: Date } | undefined,
  search: string | null,
  fiscalVersionIds: string[],
  page: number,
  pageSize: number,
) {
  const base = customQuotationHistoryBaseSql(tenantId, finalizedAt, search, fiscalVersionIds);
  return tx.$queryRaw<HistoryCustomerPageFulfillment[]>`
    WITH filtered_fulfillments AS (
      SELECT requirement."customerId", fulfillment."id" AS "fulfillmentId", fulfillment."updatedAt"
      ${base}
    ), customer_groups AS (
      SELECT "customerId",
        CASE WHEN "customerId" IS NULL THEN "fulfillmentId" ELSE NULL END AS "nullFulfillmentId",
        MAX("updatedAt") AS "groupFinalizedAt",
        MIN("fulfillmentId") AS "groupTie"
      FROM filtered_fulfillments
      GROUP BY "customerId", CASE WHEN "customerId" IS NULL THEN "fulfillmentId" ELSE NULL END
    ), paged_groups AS (
      SELECT *
      FROM customer_groups
      ORDER BY "groupFinalizedAt" DESC, "groupTie" ASC, "customerId" ASC NULLS LAST
      OFFSET ${(page - 1) * pageSize} LIMIT ${pageSize}
    )
    SELECT row."customerId", row."fulfillmentId",
      CASE WHEN paged."customerId" IS NULL THEN concat('null:', row."fulfillmentId") ELSE concat('customer:', paged."customerId") END AS "groupKey"
    FROM filtered_fulfillments row
    INNER JOIN paged_groups paged
      ON (row."customerId" = paged."customerId" OR (row."customerId" IS NULL AND paged."customerId" IS NULL AND row."fulfillmentId" = paged."nullFulfillmentId"))
    ORDER BY paged."groupFinalizedAt" DESC, paged."groupTie" ASC, paged."customerId" ASC NULLS LAST, row."updatedAt" DESC, row."fulfillmentId" ASC
  `;
}

function countCustomQuotationHistoryCustomers(
  tx: OperationsTransaction,
  tenantId: string,
  finalizedAt: { gte: Date; lt: Date } | undefined,
  search: string | null,
  fiscalVersionIds: string[],
) {
  const base = customQuotationHistoryBaseSql(tenantId, finalizedAt, search, fiscalVersionIds);
  return tx.$queryRaw<Array<{ total: bigint | number }>>`
    WITH filtered_fulfillments AS (
      SELECT requirement."customerId", fulfillment."id" AS "fulfillmentId"
      ${base}
    )
    SELECT COUNT(*) AS total
    FROM (
      SELECT "customerId", CASE WHEN "customerId" IS NULL THEN "fulfillmentId" ELSE NULL END
      FROM filtered_fulfillments
      GROUP BY "customerId", CASE WHEN "customerId" IS NULL THEN "fulfillmentId" ELSE NULL END
    ) customer_groups
  `;
}

async function customQuotationFiscalSearchVersionIds(tx: OperationsTransaction, tenantId: string, search: string) {
  const documents = await tx.billingDocument.findMany({
    where: {
      tenantId,
      sourceType: "SALES_ORDER",
      sourceRole: "PRIMARY",
      fiscalNumber: { contains: search, mode: "insensitive" },
    },
    select: { sourceId: true },
  }) as Array<{ sourceId: string | null }>;
  const salesOrderIds = documents.map((document) => document.sourceId).filter((value): value is string => Boolean(value));
  if (salesOrderIds.length === 0) return [];
  const versions = await tx.customQuotationVersion.findMany({
    where: { tenantId, salesOrderId: { in: salesOrderIds } },
    select: { id: true },
  }) as Array<{ id: string }>;
  return versions.map((version) => version.id);
}

function customQuotationHistoryDateRange(
  input: ListCustomQuotationOperationsHistoryDto,
  timezone: string,
  now = new Date(),
): { gte: Date; lt: Date } | undefined {
  const preset = input.datePreset ?? ((input.dateFrom || input.dateTo) ? "CUSTOM" : undefined);
  if (!preset) return undefined;
  let from: string;
  let to: string;
  if (preset === "CUSTOM") {
    if (!input.dateFrom || !input.dateTo || input.dateFrom > input.dateTo) {
      throw new BadRequestException("OPERATIONAL_CUSTOM_QUOTATION_HISTORY_DATE_RANGE_INVALID");
    }
    from = input.dateFrom;
    to = input.dateTo;
  } else {
    const today = tenantCalendarDate(now, timezone);
    const days = preset === "TODAY" ? 0 : preset === "LAST_7_DAYS" ? 6 : preset === "LAST_15_DAYS" ? 14 : 29;
    from = shiftCalendarDate(today, -days);
    to = today;
  }
  return {
    gte: tenantCalendarDateStartAsUtc(from, timezone),
    lt: tenantCalendarDateStartAsUtc(nextTenantCalendarDate(to), timezone),
  };
}

function tenantCalendarDate(value: Date, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
    const year = part("year"), month = part("month"), day = part("day");
    if (!year || !month || !day) throw new Error("missing date part");
    return `${year}-${month}-${day}`;
  } catch {
    throw new BadRequestException("OPERATIONAL_CUSTOM_QUOTATION_HISTORY_TIMEZONE_INVALID");
  }
}

function shiftCalendarDate(value: string, days: number) {
  const shifted = tenantCalendarDateStartAsUtc(value, "UTC");
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function toCustomQuotationHistoryRow(
  fulfillment: CustomQuotationHistoryFulfillmentRecord,
  version: CustomQuotationVersionRecord | undefined,
  billingDocuments: PrimaryBillingDocumentRecord[],
) {
  const purchase = fulfillment.purchases[0] ?? null;
  const billingDocument = billingDocuments.find((document) => document.taxAuthorityStatus === "ACCEPTED") ?? billingDocuments[0] ?? null;
  return {
    fulfillmentId: fulfillment.id,
    requirementId: fulfillment.operationalRequirement.id,
    finalStatus: fulfillment.status,
    requirementStatus: fulfillment.operationalRequirement.status,
    finalizedAt: fulfillment.updatedAt,
    confirmationReference: fulfillment.confirmationReference,
    servicePurposeCode: fulfillment.servicePurposeCode,
    cancellationContext: null,
    customer: fulfillment.operationalRequirement.customer,
    quotationNumber: version?.customQuotation.quotationNumber ?? null,
    salesOrderNumber: version?.salesOrder?.orderNumber ?? null,
    fiscalDocument: billingDocument ? {
      id: billingDocument.id,
      type: billingDocument.documentTypeCode,
      number: billingDocument.fiscalNumber,
    } : null,
    serviceDescription: fulfillment.operationalRequirement.description,
    purchase: purchase ? {
      id: purchase.id,
      providerName: purchase.providerName,
      amount: purchase.amount.toFixed(),
      currency: purchase.currency,
      purchasedAt: purchase.purchasedAt,
      supplierReference: purchase.supplierReference,
      supplierInvoiceNumber: purchase.supplierInvoiceNumber,
      taxAmount: purchase.taxAmount?.toFixed() ?? null,
      notes: purchase.notes,
      evidenceCount: purchase._count.evidence,
    } : null,
  };
}

function toCustomQuotationHistoryPurchase(purchase: any) {
  return {
    id: purchase.id,
    providerName: purchase.providerName,
    supplierReference: purchase.supplierReference,
    amount: purchase.amount.toFixed(),
    currency: purchase.currency,
    taxAmount: purchase.taxAmount?.toFixed() ?? null,
    purchasedAt: purchase.purchasedAt,
    supplierInvoiceNumber: purchase.supplierInvoiceNumber,
    notes: purchase.notes,
  };
}

function toCustomQuotationGroup(
  sourceId: string,
  requirements: CustomQuotationGroupChildRecord[],
  version: CustomQuotationVersionRecord | undefined,
  billingDocuments: PrimaryBillingDocumentRecord[],
) {
  const displayRequirements = requirements.map((requirement) => ({
    ...requirement,
    status: customQuotationDisplayStatus(requirement.status, "CUSTOM_QUOTATION_LINE", requirement.fulfillments.length > 0),
  }));
  const billingDocument = billingDocuments.find((document) => document.taxAuthorityStatus === "ACCEPTED");
  const fiscalDocumentState: "MISSING" | "PENDING" | "ACCEPTED" = billingDocuments.length === 0
    ? "MISSING"
    : billingDocument ? "ACCEPTED" : "PENDING";
  const first = displayRequirements[0];
  const currencies = [...new Set(displayRequirements.map((requirement) => requirement.soldCurrency).filter((value): value is string => Boolean(value)))];
  const currency = currencies.length === 1 ? currencies[0] : null;
  const hasCompleteValues = Boolean(currency) && displayRequirements.every((requirement) => requirement.soldAmount !== null && requirement.soldCurrency === currency);
  const total = hasCompleteValues
    ? displayRequirements.reduce((sum, requirement) => sum.plus(requirement.soldAmount!), new Prisma.Decimal(0)).toFixed()
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
    createdAt: displayRequirements.reduce<Date | null>((earliest, requirement) => !earliest || requirement.createdAt < earliest ? requirement.createdAt : earliest, null),
    status: customQuotationGroupStatus(displayRequirements.map((requirement) => requirement.status)),
    currency,
    commercialValue: { amount: total, currency },
    serviceCount: displayRequirements.length,
    requirements: displayRequirements.map((requirement) => ({
      requirementId: requirement.id,
      sourceLineId: requirement.sourceLineId,
      description: requirement.description,
      commercialValue: { amount: requirement.soldAmount?.toFixed() ?? null, currency: requirement.soldCurrency },
      status: requirement.status,
    })),
  };
}

function groupActiveCustomQuotationCustomers(
  groups: Array<ReturnType<typeof toCustomQuotationGroup>>,
  pageSources: ActiveCustomerPageSource[],
) {
  const sourceGroupKey = new Map(pageSources.map((row) => [row.sourceId, row.groupKey]));
  const orderedKeys = [...new Set(pageSources.map((row) => row.groupKey))];
  const grouped = new Map<string, {
    customer: ReturnType<typeof toCustomQuotationGroup>["customer"];
    quotationGroupCount: number;
    serviceCount: number;
    groups: Array<ReturnType<typeof toCustomQuotationGroup>>;
  }>();
  for (const key of orderedKeys) {
    grouped.set(key, { customer: null, quotationGroupCount: 0, serviceCount: 0, groups: [] });
  }
  for (const group of groups) {
    const key = sourceGroupKey.get(group.sourceId);
    if (!key) continue;
    const customerGroup = grouped.get(key);
    if (!customerGroup) continue;
    customerGroup.customer = customerGroup.customer ?? group.customer;
    customerGroup.quotationGroupCount += 1;
    customerGroup.serviceCount += group.serviceCount;
    customerGroup.groups.push(group);
  }
  return orderedKeys.map((key) => grouped.get(key)!);
}

function groupCustomQuotationHistoryCustomers(
  items: Array<ReturnType<typeof toCustomQuotationHistoryRow>>,
  pageFulfillments: HistoryCustomerPageFulfillment[],
) {
  const fulfillmentGroupKey = new Map(pageFulfillments.map((row) => [row.fulfillmentId, row.groupKey]));
  const orderedKeys = [...new Set(pageFulfillments.map((row) => row.groupKey))];
  const grouped = new Map<string, {
    customer: ReturnType<typeof toCustomQuotationHistoryRow>["customer"];
    historyCount: number;
    items: Array<ReturnType<typeof toCustomQuotationHistoryRow>>;
  }>();
  for (const key of orderedKeys) grouped.set(key, { customer: null, historyCount: 0, items: [] });
  for (const item of items) {
    const key = fulfillmentGroupKey.get(item.fulfillmentId);
    if (!key) continue;
    const customerGroup = grouped.get(key);
    if (!customerGroup) continue;
    customerGroup.customer = customerGroup.customer ?? item.customer;
    customerGroup.historyCount += 1;
    customerGroup.items.push(item);
  }
  return orderedKeys.map((key) => grouped.get(key)!);
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

function customQuotationDisplayStatus(
  status: RequirementStatus,
  sourceType: string,
  hasConfirmedFulfillment: boolean,
): RequirementStatus {
  return sourceType === "CUSTOM_QUOTATION_LINE"
    && hasConfirmedFulfillment
    && (status === "PENDING" || status === "IN_PROGRESS")
    ? "FULFILLED"
    : status;
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

function withPassengerContexts(
  requirement: RequirementRecord,
  dateContext: { tenantTimezone: string; tenantCurrentDate: string },
) {
  return {
    ...toDetail(requirement),
    passengerContexts: passengerOperationalContexts(
      requirement.scopeType === "STANDALONE_CUSTOMER"
        ? requirement.customer
          ? [{ displayName: requirement.customer.fullName, dateOfBirth: requirement.customerDateOfBirth, role: null }]
          : []
        : requirement.passengers.map((passenger) => ({
          displayName: passenger.travelPackageParticipant.client.fullName,
          dateOfBirth: passenger.travelPackageParticipant.dateOfBirth,
          role: passenger.travelPackageParticipant.role,
        })),
      {
        serviceStartAt: null,
        tripDepartureDate: requirement.scopeType === "TRAVEL_PACKAGE" ? requirement.travelPackage?.departureDate ?? null : null,
        ...dateContext,
      },
    ),
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
