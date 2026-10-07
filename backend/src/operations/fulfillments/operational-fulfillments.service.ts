import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  FINANCE_ELIGIBILITY_READER,
  type FinanceEligibilityReader,
} from "../../finance/eligibility-read/finance-eligibility-reader.port";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import { procurementAuthorizationForRequirement } from "../operational-procurement-authorization";
import {
  CreateOperationalFulfillmentDto,
  CreateStandaloneOperationalFulfillmentDto,
  ListOperationalFulfillmentsDto,
  OperationalFulfillmentPassengersDto,
  OPERATIONAL_FULFILLMENT_STATUSES,
  TransitionOperationalFulfillmentDto,
  UpdateOperationalFulfillmentDto,
} from "./dto/operational-fulfillments.dto";

export type OperationalFulfillmentsActor = { userId: string; name: string };

type OperationsTransaction = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  travelPackageParticipant: Record<string, (...args: any[]) => Promise<any>>;
  user: Record<string, (...args: any[]) => Promise<any>>;
  operationalRequirement: Record<string, (...args: any[]) => Promise<any>>;
  operationalRequirementPassenger: Record<string, (...args: any[]) => Promise<any>>;
  operationalFulfillment: Record<string, (...args: any[]) => Promise<any>>;
  operationalFulfillmentPassenger: Record<string, (...args: any[]) => Promise<any>>;
};
type OperationsDatabase = {
  $transaction<T>(work: (transaction: OperationsTransaction) => Promise<T>): Promise<T>;
};
type FulfillmentStatus = (typeof OPERATIONAL_FULFILLMENT_STATUSES)[number];
type RequirementState = {
  id: string;
  scopeType?: "TRAVEL_PACKAGE" | "STANDALONE_CUSTOMER";
  travelPackageId: string | null;
  customerId?: string | null;
  status: string;
  servicePurposeCode: string;
  servicePurposeName: string;
  sourceType: string;
  sourceId: string | null;
  sourceLineId: string | null;
  sourceVersionId: string | null;
};
type FulfillmentPassengerRecord = {
  travelPackageParticipantId: string;
  travelPackageParticipant: {
    id: string;
    clientId: string;
    role: string;
    client: { fullName: string };
  };
};
type FulfillmentRecord = {
  id: string;
  travelPackageId: string | null;
  operationalRequirementId: string;
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
  detailPayload: unknown | null;
  detailVersion: number | null;
  status: FulfillmentStatus;
  assignedToUserId: string | null;
  assignedToName: string | null;
  confirmationNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  operationalRequirement: RequirementState;
  passengers: FulfillmentPassengerRecord[];
  _count: { purchases: number };
};
type FulfillmentState = Omit<FulfillmentRecord, "passengers" | "_count">;
type FulfillmentSummaryRecord = Omit<FulfillmentRecord, "operationalRequirement"> & { _count: { passengers: number; purchases: number } };

const DETAIL_SELECT = {
  id: true,
  travelPackageId: true,
  operationalRequirementId: true,
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
  status: true,
  assignedToUserId: true,
  assignedToName: true,
  confirmationNotes: true,
  createdAt: true,
  updatedAt: true,
  operationalRequirement: {
    select: {
      id: true,
      travelPackageId: true,
      status: true,
      servicePurposeCode: true,
      servicePurposeName: true,
      sourceType: true,
      sourceId: true,
      sourceLineId: true,
      sourceVersionId: true,
    },
  },
  passengers: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      travelPackageParticipantId: true,
      travelPackageParticipant: {
        select: { id: true, clientId: true, role: true, client: { select: { fullName: true } } },
      },
    },
  },
  _count: { select: { purchases: true } },
} as const;

const STATE_SELECT = {
  id: true,
  travelPackageId: true,
  operationalRequirementId: true,
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
  status: true,
  assignedToUserId: true,
  assignedToName: true,
  confirmationNotes: true,
  createdAt: true,
  updatedAt: true,
  operationalRequirement: {
    select: {
      id: true,
      travelPackageId: true,
      status: true,
      servicePurposeCode: true,
      servicePurposeName: true,
      sourceType: true,
      sourceId: true,
      sourceLineId: true,
      sourceVersionId: true,
    },
  },
} as const;

const SUMMARY_SELECT = {
  id: true,
  travelPackageId: true,
  operationalRequirementId: true,
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
  status: true,
  assignedToUserId: true,
  assignedToName: true,
  createdAt: true,
  updatedAt: true,
  passengers: {
    take: 2,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      travelPackageParticipantId: true,
      travelPackageParticipant: {
        select: { id: true, clientId: true, role: true, client: { select: { fullName: true } } },
      },
    },
  },
  _count: { select: { passengers: true, purchases: true } },
} as const;

const STATUS_TRANSITIONS: Readonly<Record<FulfillmentStatus, readonly FulfillmentStatus[]>> = {
  DRAFT: ["RESERVED", "PURCHASED", "CANCELLED"],
  RESERVED: ["PURCHASED", "CONFIRMED", "CANCELLED"],
  PURCHASED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: [],
  CANCELLED: [],
};
const SPEND_COMMITTING_STATUSES = new Set<FulfillmentStatus>(["RESERVED", "PURCHASED", "CONFIRMED"]);
const MAX_DETAIL_PAYLOAD_BYTES = 64 * 1024;

@Injectable()
export class OperationalFulfillmentsService {
  private readonly database: OperationsDatabase;

  constructor(
    prisma: PrismaService,
    @Inject(FINANCE_ELIGIBILITY_READER) private readonly financeEligibility: FinanceEligibilityReader,
  ) {
    this.database = prisma as unknown as OperationsDatabase;
  }

  async list(tenantId: string, travelPackageId: string, requirementId: string, input: ListOperationalFulfillmentsDto) {
    const page = pageNumber(input.page);
    const pageSize = pageSizeNumber(input.pageSize);
    const where = listWhere(tenantId, travelPackageId, requirementId, input);
    return this.withTenantTransaction(tenantId, async (tx) => {
      await this.requireRequirement(tx, tenantId, travelPackageId, requirementId);
      const [rows, total] = await Promise.all([
        tx.operationalFulfillment.findMany({
          where,
          select: SUMMARY_SELECT,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }) as Promise<FulfillmentSummaryRecord[]>,
        tx.operationalFulfillment.count({ where }) as Promise<number>,
      ]);
      return { items: rows.map(toSummary), total, page, pageSize, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) };
    });
  }

  async find(tenantId: string, travelPackageId: string, requirementId: string, fulfillmentId: string) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      const fulfillment = await this.findFulfillment(tx, tenantId, travelPackageId, requirementId, fulfillmentId);
      if (!fulfillment) throw new NotFoundException("OPERATIONAL_FULFILLMENT_NOT_FOUND");
      return toDetail(fulfillment);
    });
  }

  async create(
    tenantId: string,
    travelPackageId: string,
    requirementId: string,
    input: CreateOperationalFulfillmentDto,
    actor: OperationalFulfillmentsActor,
  ) {
    const participantIds = uniqueParticipantIds(input.participantIds);
    const fields = createFields(input);
    return this.withTenantTransaction(tenantId, async (tx) => {
      const requirement = await this.requireMutableRequirement(tx, tenantId, travelPackageId, requirementId);
      await this.requireRequirementParticipants(tx, tenantId, travelPackageId, requirementId, participantIds);
      await this.requireUncoveredParticipants(tx, tenantId, travelPackageId, requirementId, participantIds);
      const assignee = await this.resolveAssignee(tx, tenantId, input.assignedToUserId);
      const created = await tx.operationalFulfillment.create({
        data: {
          tenantId,
          travelPackageId,
          operationalRequirementId: requirementId,
          servicePurposeCode: requirement.servicePurposeCode,
          servicePurposeName: requirement.servicePurposeName,
          status: "DRAFT",
          ...fields,
          assignedToUserId: assignee?.id ?? null,
          assignedToName: assignee?.fullName ?? null,
          createdByUserId: actor.userId,
          createdByName: actor.name,
        },
        select: { id: true },
      }) as { id: string };
      await tx.operationalFulfillmentPassenger.createMany({
        data: participantIds.map((travelPackageParticipantId) => ({
          tenantId,
          travelPackageId,
          operationalFulfillmentId: created.id,
          travelPackageParticipantId,
          createdByUserId: actor.userId,
          createdByName: actor.name,
        })),
      });
      if (requirement.status === "PENDING") {
        await tx.operationalRequirement.updateMany({
          where: { id: requirementId, tenantId, travelPackageId, status: "PENDING" },
          data: { status: "IN_PROGRESS", updatedByUserId: actor.userId, updatedByName: actor.name },
        });
      }
      const fulfillment = await this.findFulfillment(tx, tenantId, travelPackageId, requirementId, created.id);
      if (!fulfillment) throw new NotFoundException("OPERATIONAL_FULFILLMENT_NOT_FOUND");
      return toDetail(fulfillment);
    });
  }

  async update(
    tenantId: string,
    travelPackageId: string,
    requirementId: string,
    fulfillmentId: string,
    input: UpdateOperationalFulfillmentDto,
    actor: OperationalFulfillmentsActor,
  ) {
    if (!hasUpdate(input)) throw new BadRequestException("OPERATIONAL_FULFILLMENT_UPDATE_EMPTY");
    return this.withTenantTransaction(tenantId, async (tx) => {
      const fulfillment = await this.requireMutableFulfillment(tx, tenantId, travelPackageId, requirementId, fulfillmentId);
      const fields = updateFields(input, fulfillment);
      const assignee = input.assignedToUserId === undefined ? undefined : await this.resolveAssignee(tx, tenantId, input.assignedToUserId);
      const updated = await tx.operationalFulfillment.updateMany({
        where: { id: fulfillmentId, tenantId, travelPackageId, operationalRequirementId: requirementId },
        data: {
          ...fields,
          ...(assignee === undefined ? {} : { assignedToUserId: assignee?.id ?? null, assignedToName: assignee?.fullName ?? null }),
          updatedByUserId: actor.userId,
          updatedByName: actor.name,
        },
      });
      if (updated.count !== 1) throw new NotFoundException("OPERATIONAL_FULFILLMENT_NOT_FOUND");
      const refreshed = await this.findFulfillment(tx, tenantId, travelPackageId, requirementId, fulfillmentId);
      if (!refreshed) throw new NotFoundException("OPERATIONAL_FULFILLMENT_NOT_FOUND");
      return toDetail(refreshed);
    });
  }

  async addPassengers(
    tenantId: string,
    travelPackageId: string,
    requirementId: string,
    fulfillmentId: string,
    input: OperationalFulfillmentPassengersDto,
    actor: OperationalFulfillmentsActor,
  ) {
    const participantIds = uniqueParticipantIds(input.participantIds);
    return this.withTenantTransaction(tenantId, async (tx) => {
      await this.requireMutableFulfillment(tx, tenantId, travelPackageId, requirementId, fulfillmentId);
      await this.requireRequirementParticipants(tx, tenantId, travelPackageId, requirementId, participantIds);
      await tx.operationalFulfillmentPassenger.createMany({
        data: participantIds.map((travelPackageParticipantId) => ({
          tenantId, travelPackageId, operationalFulfillmentId: fulfillmentId, travelPackageParticipantId,
          createdByUserId: actor.userId, createdByName: actor.name,
        })),
        skipDuplicates: true,
      });
      const fulfillment = await this.findFulfillment(tx, tenantId, travelPackageId, requirementId, fulfillmentId);
      if (!fulfillment) throw new NotFoundException("OPERATIONAL_FULFILLMENT_NOT_FOUND");
      return toDetail(fulfillment);
    });
  }

  async removePassengers(
    tenantId: string,
    travelPackageId: string,
    requirementId: string,
    fulfillmentId: string,
    input: OperationalFulfillmentPassengersDto,
  ) {
    const participantIds = uniqueParticipantIds(input.participantIds);
    return this.withTenantTransaction(tenantId, async (tx) => {
      await this.requireMutableFulfillment(tx, tenantId, travelPackageId, requirementId, fulfillmentId);
      await this.requireRequirementParticipants(tx, tenantId, travelPackageId, requirementId, participantIds);
      const members = await tx.operationalFulfillmentPassenger.findMany({
        where: { tenantId, travelPackageId, operationalFulfillmentId: fulfillmentId },
        select: { travelPackageParticipantId: true },
      }) as Array<{ travelPackageParticipantId: string }>;
      const memberIds = new Set(members.map((member) => member.travelPackageParticipantId));
      const existingIds = participantIds.filter((id) => memberIds.has(id));
      if (members.length - existingIds.length < 1) throw new ConflictException("OPERATIONAL_FULFILLMENT_LAST_PASSENGER_REQUIRED");
      if (existingIds.length > 0) {
        await tx.operationalFulfillmentPassenger.deleteMany({
          where: { tenantId, travelPackageId, operationalFulfillmentId: fulfillmentId, travelPackageParticipantId: { in: existingIds } },
        });
      }
      const fulfillment = await this.findFulfillment(tx, tenantId, travelPackageId, requirementId, fulfillmentId);
      if (!fulfillment) throw new NotFoundException("OPERATIONAL_FULFILLMENT_NOT_FOUND");
      return toDetail(fulfillment);
    });
  }

  async transitionStatus(
    tenantId: string,
    travelPackageId: string,
    requirementId: string,
    fulfillmentId: string,
    input: TransitionOperationalFulfillmentDto,
    actor: OperationalFulfillmentsActor,
  ) {
    const target = input.targetStatus as FulfillmentStatus;
    const initial = await this.withTenantTransaction(tenantId, (tx) =>
      this.requireMutableFulfillment(tx, tenantId, travelPackageId, requirementId, fulfillmentId),
    );
    assertTransition(initial, target);
    if (SPEND_COMMITTING_STATUSES.has(target)) await this.requireProcurementAuthorization(tenantId, initial.operationalRequirement);

    return this.withTenantTransaction(tenantId, async (tx) => {
      const current = await this.requireMutableFulfillment(tx, tenantId, travelPackageId, requirementId, fulfillmentId);
      assertTransition(current, target);
      const updated = await tx.operationalFulfillment.updateMany({
        where: { id: fulfillmentId, tenantId, travelPackageId, operationalRequirementId: requirementId, status: current.status },
        data: { status: target, updatedByUserId: actor.userId, updatedByName: actor.name },
      });
      if (updated.count !== 1) await this.throwLatestTransitionState(tx, tenantId, travelPackageId, requirementId, fulfillmentId);
      const fulfillment = await this.findFulfillment(tx, tenantId, travelPackageId, requirementId, fulfillmentId);
      if (!fulfillment) throw new NotFoundException("OPERATIONAL_FULFILLMENT_NOT_FOUND");
      return toDetail(fulfillment);
    });
  }

  async listStandalone(tenantId: string, requirementId: string, input: ListOperationalFulfillmentsDto) {
    const page = pageNumber(input.page);
    const pageSize = pageSizeNumber(input.pageSize);
    const where = { ...listWhere(tenantId, null, requirementId, input), travelPackageId: null };
    return this.withTenantTransaction(tenantId, async (tx) => {
      await this.requireStandaloneRequirement(tx, tenantId, requirementId);
      const [rows, total] = await Promise.all([
        tx.operationalFulfillment.findMany({ where, select: SUMMARY_SELECT, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }) as Promise<FulfillmentSummaryRecord[]>,
        tx.operationalFulfillment.count({ where }) as Promise<number>,
      ]);
      return { items: rows.map(toSummary), total, page, pageSize, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) };
    });
  }

  async findStandalone(tenantId: string, requirementId: string, fulfillmentId: string) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      const fulfillment = await this.findStandaloneFulfillment(tx, tenantId, requirementId, fulfillmentId);
      if (!fulfillment) throw new NotFoundException("OPERATIONAL_STANDALONE_FULFILLMENT_NOT_FOUND");
      return toDetail(fulfillment);
    });
  }

  async createStandalone(tenantId: string, requirementId: string, input: CreateStandaloneOperationalFulfillmentDto, actor: OperationalFulfillmentsActor) {
    const fields = createFields(input);
    return this.withTenantTransaction(tenantId, async (tx) => {
      const requirement = await this.requireMutableStandaloneRequirement(tx, tenantId, requirementId);
      const assignee = await this.resolveAssignee(tx, tenantId, input.assignedToUserId);
      const created = await tx.operationalFulfillment.create({
        data: {
          tenantId, travelPackageId: null, operationalRequirementId: requirementId,
          servicePurposeCode: requirement.servicePurposeCode, servicePurposeName: requirement.servicePurposeName,
          status: "DRAFT", ...fields, assignedToUserId: assignee?.id ?? null, assignedToName: assignee?.fullName ?? null,
          createdByUserId: actor.userId, createdByName: actor.name,
        }, select: { id: true },
      }) as { id: string };
      if (requirement.status === "PENDING") {
        await tx.operationalRequirement.updateMany({
          where: { id: requirementId, tenantId, scopeType: "STANDALONE_CUSTOMER", travelPackageId: null, status: "PENDING" },
          data: { status: "IN_PROGRESS", updatedByUserId: actor.userId, updatedByName: actor.name },
        });
      }
      const fulfillment = await this.findStandaloneFulfillment(tx, tenantId, requirementId, created.id);
      if (!fulfillment) throw new NotFoundException("OPERATIONAL_STANDALONE_FULFILLMENT_NOT_FOUND");
      return toDetail(fulfillment);
    });
  }

  async updateStandalone(tenantId: string, requirementId: string, fulfillmentId: string, input: UpdateOperationalFulfillmentDto, actor: OperationalFulfillmentsActor) {
    if (!hasUpdate(input)) throw new BadRequestException("OPERATIONAL_FULFILLMENT_UPDATE_EMPTY");
    return this.withTenantTransaction(tenantId, async (tx) => {
      const fulfillment = await this.requireMutableStandaloneFulfillment(tx, tenantId, requirementId, fulfillmentId);
      const fields = updateFields(input, fulfillment);
      const assignee = input.assignedToUserId === undefined ? undefined : await this.resolveAssignee(tx, tenantId, input.assignedToUserId);
      const updated = await tx.operationalFulfillment.updateMany({
        where: { id: fulfillmentId, tenantId, travelPackageId: null, operationalRequirementId: requirementId },
        data: { ...fields, ...(assignee === undefined ? {} : { assignedToUserId: assignee?.id ?? null, assignedToName: assignee?.fullName ?? null }), updatedByUserId: actor.userId, updatedByName: actor.name },
      });
      if (updated.count !== 1) throw new NotFoundException("OPERATIONAL_STANDALONE_FULFILLMENT_NOT_FOUND");
      const refreshed = await this.findStandaloneFulfillment(tx, tenantId, requirementId, fulfillmentId);
      if (!refreshed) throw new NotFoundException("OPERATIONAL_STANDALONE_FULFILLMENT_NOT_FOUND");
      return toDetail(refreshed);
    });
  }

  async transitionStandaloneStatus(tenantId: string, requirementId: string, fulfillmentId: string, input: TransitionOperationalFulfillmentDto, actor: OperationalFulfillmentsActor) {
    const target = input.targetStatus as FulfillmentStatus;
    const initial = await this.withTenantTransaction(tenantId, (tx) => this.requireMutableStandaloneFulfillment(tx, tenantId, requirementId, fulfillmentId));
    assertTransition(initial, target);
    if (SPEND_COMMITTING_STATUSES.has(target)) await this.requireProcurementAuthorization(tenantId, initial.operationalRequirement);
    return this.withTenantTransaction(tenantId, async (tx) => {
      const current = await this.requireMutableStandaloneFulfillment(tx, tenantId, requirementId, fulfillmentId);
      assertTransition(current, target);
      const updated = await tx.operationalFulfillment.updateMany({
        where: { id: fulfillmentId, tenantId, travelPackageId: null, operationalRequirementId: requirementId, status: current.status },
        data: { status: target, updatedByUserId: actor.userId, updatedByName: actor.name },
      });
      if (updated.count !== 1) throw new ConflictException("OPERATIONAL_FULFILLMENT_STATUS_TRANSITION_CONFLICT");
      const fulfillment = await this.findStandaloneFulfillment(tx, tenantId, requirementId, fulfillmentId);
      if (!fulfillment) throw new NotFoundException("OPERATIONAL_STANDALONE_FULFILLMENT_NOT_FOUND");
      return toDetail(fulfillment);
    });
  }

  async rejectStandalonePassengerAssignment(tenantId: string, requirementId: string, fulfillmentId: string) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      await this.requireMutableStandaloneFulfillment(tx, tenantId, requirementId, fulfillmentId);
      throw new BadRequestException("OPERATIONAL_STANDALONE_PASSENGERS_UNSUPPORTED");
    });
  }

  private async requireRequirement(tx: OperationsTransaction, tenantId: string, travelPackageId: string, requirementId: string): Promise<RequirementState> {
    const requirement = await tx.operationalRequirement.findFirst({
      where: { id: requirementId, tenantId, travelPackageId },
      select: { id: true, travelPackageId: true, status: true, servicePurposeCode: true, servicePurposeName: true, sourceType: true, sourceId: true, sourceLineId: true, sourceVersionId: true },
    }) as RequirementState | null;
    if (!requirement) throw new NotFoundException("OPERATIONAL_REQUIREMENT_NOT_FOUND");
    return requirement;
  }

  private async requireStandaloneRequirement(tx: OperationsTransaction, tenantId: string, requirementId: string): Promise<RequirementState> {
    const requirement = await tx.operationalRequirement.findFirst({
      where: { id: requirementId, tenantId, scopeType: "STANDALONE_CUSTOMER", travelPackageId: null, customerId: { not: null } },
      select: { id: true, scopeType: true, customerId: true, travelPackageId: true, status: true, servicePurposeCode: true, servicePurposeName: true, sourceType: true, sourceId: true, sourceLineId: true, sourceVersionId: true },
    }) as RequirementState | null;
    if (!requirement) throw new NotFoundException("OPERATIONAL_STANDALONE_REQUIREMENT_NOT_FOUND");
    return requirement;
  }

  private async requireMutableStandaloneRequirement(tx: OperationsTransaction, tenantId: string, requirementId: string) {
    const requirement = await this.requireStandaloneRequirement(tx, tenantId, requirementId);
    if (requirement.status === "CANCELLED" || requirement.status === "NOT_APPLICABLE") throw new ConflictException("OPERATIONAL_FULFILLMENT_PARENT_REQUIREMENT_TERMINAL");
    return requirement;
  }

  private async requireMutableRequirement(tx: OperationsTransaction, tenantId: string, travelPackageId: string, requirementId: string) {
    const requirement = await this.requireRequirement(tx, tenantId, travelPackageId, requirementId);
    if (requirement.status === "CANCELLED" || requirement.status === "NOT_APPLICABLE") {
      throw new ConflictException("OPERATIONAL_FULFILLMENT_PARENT_REQUIREMENT_TERMINAL");
    }
    return requirement;
  }

  private async requireRequirementParticipants(tx: OperationsTransaction, tenantId: string, travelPackageId: string, requirementId: string, participantIds: string[]) {
    const participants = await tx.travelPackageParticipant.findMany({
      where: { tenantId, travelPackageId, id: { in: participantIds } },
      select: { id: true },
    }) as Array<{ id: string }>;
    if (participants.length !== participantIds.length) {
      throw new NotFoundException("OPERATIONAL_FULFILLMENT_PARTICIPANT_NOT_FOUND_IN_TRAVEL_PACKAGE");
    }
    const requirementPassengers = await tx.operationalRequirementPassenger.findMany({
      where: { tenantId, travelPackageId, operationalRequirementId: requirementId, travelPackageParticipantId: { in: participantIds } },
      select: { travelPackageParticipantId: true },
    }) as Array<{ travelPackageParticipantId: string }>;
    if (requirementPassengers.length !== participantIds.length) {
      throw new ConflictException("OPERATIONAL_FULFILLMENT_PARTICIPANT_OUTSIDE_REQUIREMENT");
    }
  }

  private async requireUncoveredParticipants(tx: OperationsTransaction, tenantId: string, travelPackageId: string, requirementId: string, participantIds: string[]) {
    const covered = await tx.operationalFulfillmentPassenger.findMany({
      where: { tenantId, travelPackageId, travelPackageParticipantId: { in: participantIds }, operationalFulfillment: { operationalRequirementId: requirementId, status: "CONFIRMED" } },
      select: { travelPackageParticipantId: true },
    }) as Array<{ travelPackageParticipantId: string }>;
    if (covered.length > 0) throw new ConflictException("OPERATIONAL_FULFILLMENT_PARTICIPANT_ALREADY_CONFIRMED");
  }

  private async resolveAssignee(tx: OperationsTransaction, tenantId: string, userId: string | null | undefined): Promise<{ id: string; fullName: string } | null | undefined> {
    if (userId === undefined) return undefined;
    if (userId === null) return null;
    const user = await tx.user.findFirst({ where: { id: userId, tenantId }, select: { id: true, fullName: true } }) as { id: string; fullName: string } | null;
    if (!user) throw new NotFoundException("OPERATIONAL_FULFILLMENT_ASSIGNEE_NOT_FOUND");
    return user;
  }

  private async requireMutableFulfillment(tx: OperationsTransaction, tenantId: string, travelPackageId: string, requirementId: string, fulfillmentId: string): Promise<FulfillmentState> {
    const fulfillment = await this.findFulfillmentState(tx, tenantId, travelPackageId, requirementId, fulfillmentId);
    if (!fulfillment) throw new NotFoundException("OPERATIONAL_FULFILLMENT_NOT_FOUND");
    const requirementStatus = fulfillment.operationalRequirement.status;
    if (requirementStatus === "CANCELLED" || requirementStatus === "NOT_APPLICABLE") {
      throw new ConflictException("OPERATIONAL_FULFILLMENT_PARENT_REQUIREMENT_TERMINAL");
    }
    if (fulfillment.status === "CONFIRMED" || fulfillment.status === "CANCELLED") {
      throw new ConflictException("OPERATIONAL_FULFILLMENT_TERMINAL_STATUS");
    }
    return fulfillment;
  }

  private findFulfillment(tx: OperationsTransaction, tenantId: string, travelPackageId: string, requirementId: string, fulfillmentId: string): Promise<FulfillmentRecord | null> {
    return tx.operationalFulfillment.findFirst({
      where: { id: fulfillmentId, tenantId, travelPackageId, operationalRequirementId: requirementId },
      select: DETAIL_SELECT,
    }) as Promise<FulfillmentRecord | null>;
  }

  private findFulfillmentState(tx: OperationsTransaction, tenantId: string, travelPackageId: string, requirementId: string, fulfillmentId: string): Promise<FulfillmentState | null> {
    return tx.operationalFulfillment.findFirst({
      where: { id: fulfillmentId, tenantId, travelPackageId, operationalRequirementId: requirementId },
      select: STATE_SELECT,
    }) as Promise<FulfillmentState | null>;
  }

  private findStandaloneFulfillment(tx: OperationsTransaction, tenantId: string, requirementId: string, fulfillmentId: string): Promise<FulfillmentRecord | null> {
    return tx.operationalFulfillment.findFirst({
      where: { id: fulfillmentId, tenantId, travelPackageId: null, operationalRequirementId: requirementId, operationalRequirement: { scopeType: "STANDALONE_CUSTOMER", customerId: { not: null } } },
      select: DETAIL_SELECT,
    }) as Promise<FulfillmentRecord | null>;
  }

  private async requireMutableStandaloneFulfillment(tx: OperationsTransaction, tenantId: string, requirementId: string, fulfillmentId: string): Promise<FulfillmentState> {
    const fulfillment = await tx.operationalFulfillment.findFirst({
      where: { id: fulfillmentId, tenantId, travelPackageId: null, operationalRequirementId: requirementId, operationalRequirement: { scopeType: "STANDALONE_CUSTOMER", customerId: { not: null } } },
      select: STATE_SELECT,
    }) as FulfillmentState | null;
    if (!fulfillment) throw new NotFoundException("OPERATIONAL_STANDALONE_FULFILLMENT_NOT_FOUND");
    if (fulfillment.operationalRequirement.status === "CANCELLED" || fulfillment.operationalRequirement.status === "NOT_APPLICABLE") throw new ConflictException("OPERATIONAL_FULFILLMENT_PARENT_REQUIREMENT_TERMINAL");
    if (fulfillment.status === "CONFIRMED" || fulfillment.status === "CANCELLED") throw new ConflictException("OPERATIONAL_FULFILLMENT_TERMINAL_STATUS");
    return fulfillment;
  }

  private async requireProcurementAuthorization(tenantId: string, requirement: RequirementState) {
    const authorization = procurementAuthorizationForRequirement(requirement);
    if (authorization.kind === "AUTHORIZED_BY_SOURCE_POLICY") return;
    if (authorization.kind === "UNAVAILABLE") {
      throw new ConflictException("OPERATIONAL_FULFILLMENT_FINANCIAL_ELIGIBILITY_UNAVAILABLE");
    }
    let result;
    try {
      [result] = await this.financeEligibility.readMany({ tenantId, sources: [authorization.source] });
    } catch {
      throw new ConflictException("OPERATIONAL_FULFILLMENT_FINANCIAL_ELIGIBILITY_UNAVAILABLE");
    }
    if (!result || result.eligibility !== "ELIGIBLE") {
      if (!result || result.reason === "FINANCIAL_DATA_MISSING") {
        throw new ConflictException("OPERATIONAL_FULFILLMENT_FINANCIAL_ELIGIBILITY_UNAVAILABLE");
      }
      throw new ConflictException("OPERATIONAL_FULFILLMENT_FINANCIAL_ELIGIBILITY_BLOCKED");
    }
  }

  private async throwLatestTransitionState(tx: OperationsTransaction, tenantId: string, travelPackageId: string, requirementId: string, fulfillmentId: string): Promise<never> {
    const latest = await this.requireMutableFulfillment(tx, tenantId, travelPackageId, requirementId, fulfillmentId);
    if (latest.status === "CONFIRMED" || latest.status === "CANCELLED") throw new ConflictException("OPERATIONAL_FULFILLMENT_TERMINAL_STATUS");
    throw new ConflictException("OPERATIONAL_FULFILLMENT_STATUS_TRANSITION_CONFLICT");
  }

  private withTenantTransaction<T>(tenantId: string, work: (tx: OperationsTransaction) => Promise<T>): Promise<T> {
    return runTenantTransaction(this.database, tenantId, work);
  }
}

function createFields(input: CreateOperationalFulfillmentDto | CreateStandaloneOperationalFulfillmentDto) {
  const fields = commonFields(input);
  validateDateRange(fields.serviceStartAt, fields.serviceEndAt);
  validateDetail(fields.detailPayload, fields.detailVersion);
  return fields;
}

function updateFields(input: UpdateOperationalFulfillmentDto, current: FulfillmentState) {
  const fields = commonFields(input, current);
  validateDateRange(fields.serviceStartAt, fields.serviceEndAt);
  validateDetail(fields.detailPayload, fields.detailVersion);
  return omitUndefined(fields);
}

function commonFields(input: CreateOperationalFulfillmentDto | CreateStandaloneOperationalFulfillmentDto | UpdateOperationalFulfillmentDto, current?: FulfillmentState) {
  const field = <T>(key: keyof CreateOperationalFulfillmentDto, fallback: T | null = null): T | null | undefined => {
    const value = (input as unknown as Record<string, unknown>)[key];
    if (value === undefined && current) return (current as unknown as Record<string, unknown>)[key] as T | null;
    if (value === undefined) return undefined;
    return value as T | null;
  };
  return {
    providerName: normalizedOptionalText(field<string>("providerName")),
    providerReference: normalizedOptionalText(field<string>("providerReference")),
    reservationCode: normalizedOptionalText(field<string>("reservationCode")),
    confirmationReference: normalizedOptionalText(field<string>("confirmationReference")),
    voucherReference: normalizedOptionalText(field<string>("voucherReference")),
    ticketReference: normalizedOptionalText(field<string>("ticketReference")),
    serviceStartAt: parsedDate(field<string>("serviceStartAt"), "OPERATIONAL_FULFILLMENT_SERVICE_DATE_INVALID"),
    serviceEndAt: parsedDate(field<string>("serviceEndAt"), "OPERATIONAL_FULFILLMENT_SERVICE_DATE_INVALID"),
    detailPayload: field<unknown>("detailPayload"),
    detailVersion: field<number>("detailVersion"),
    confirmationNotes: normalizedOptionalText(field<string>("confirmationNotes")),
  };
}

function hasUpdate(input: UpdateOperationalFulfillmentDto) {
  return input.providerName !== undefined || input.providerReference !== undefined || input.reservationCode !== undefined || input.confirmationReference !== undefined || input.voucherReference !== undefined || input.ticketReference !== undefined || input.serviceStartAt !== undefined || input.serviceEndAt !== undefined || input.detailPayload !== undefined || input.detailVersion !== undefined || input.assignedToUserId !== undefined || input.confirmationNotes !== undefined;
}

function uniqueParticipantIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) throw new BadRequestException("OPERATIONAL_FULFILLMENT_PARTICIPANTS_INVALID");
  const ids = value.map((item) => typeof item === "string" ? item.trim() : "");
  if (ids.some((id) => !id || id.length > 191)) throw new BadRequestException("OPERATIONAL_FULFILLMENT_PARTICIPANTS_INVALID");
  return [...new Set(ids)];
}

function normalizedOptionalText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new BadRequestException("OPERATIONAL_FULFILLMENT_TEXT_INVALID");
  return normalized;
}

function parsedDate(value: unknown, errorCode: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new BadRequestException(errorCode);
    return value;
  }
  if (typeof value !== "string") throw new BadRequestException(errorCode);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException(errorCode);
  return parsed;
}

function validateDateRange(start: Date | null | undefined, end: Date | null | undefined) {
  if (start instanceof Date && end instanceof Date && end.getTime() < start.getTime()) {
    throw new BadRequestException("OPERATIONAL_FULFILLMENT_SERVICE_DATE_RANGE_INVALID");
  }
}

function validateDetail(payload: unknown, version: unknown) {
  if (payload === undefined && version === undefined) return;
  if (payload === undefined || version === undefined) {
    throw new BadRequestException("OPERATIONAL_FULFILLMENT_DETAIL_INVALID");
  }
  if (payload === null && version === null) return;
  if (!isJsonObject(payload) || !Number.isInteger(version) || (version as number) < 1) {
    throw new BadRequestException("OPERATIONAL_FULFILLMENT_DETAIL_INVALID");
  }
  if (Buffer.byteLength(JSON.stringify(payload), "utf8") > MAX_DETAIL_PAYLOAD_BYTES) {
    throw new BadRequestException("OPERATIONAL_FULFILLMENT_DETAIL_TOO_LARGE");
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function omitUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function assertTransition(fulfillment: FulfillmentState, target: FulfillmentStatus) {
  if (!OPERATIONAL_FULFILLMENT_STATUSES.includes(target)) throw new BadRequestException("OPERATIONAL_FULFILLMENT_STATUS_INVALID");
  if (!STATUS_TRANSITIONS[fulfillment.status].includes(target)) throw new ConflictException("OPERATIONAL_FULFILLMENT_STATUS_TRANSITION_INVALID");
  if (target === "RESERVED" && !hasOperationalReference(fulfillment)) {
    throw new ConflictException("OPERATIONAL_FULFILLMENT_RESERVATION_CONTEXT_REQUIRED");
  }
  if (target === "CONFIRMED" && !hasConfirmationReference(fulfillment)) {
    throw new ConflictException("OPERATIONAL_FULFILLMENT_CONFIRMATION_CONTEXT_REQUIRED");
  }
}

function hasOperationalReference(fulfillment: FulfillmentState) {
  return Boolean(fulfillment.providerName || fulfillment.providerReference || fulfillment.reservationCode || fulfillment.confirmationReference || fulfillment.voucherReference || fulfillment.ticketReference);
}

function hasConfirmationReference(fulfillment: FulfillmentState) {
  return Boolean(fulfillment.confirmationReference || fulfillment.reservationCode || fulfillment.ticketReference || fulfillment.voucherReference);
}

function listWhere(tenantId: string, travelPackageId: string | null, requirementId: string, input: ListOperationalFulfillmentsDto) {
  const from = input.serviceStartFrom === undefined ? undefined : parsedDate(input.serviceStartFrom, "OPERATIONAL_FULFILLMENT_SERVICE_DATE_INVALID");
  const to = input.serviceStartTo === undefined ? undefined : parsedDate(input.serviceStartTo, "OPERATIONAL_FULFILLMENT_SERVICE_DATE_INVALID");
  return {
    tenantId, travelPackageId, operationalRequirementId: requirementId,
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.assignedToUserId === undefined ? {} : { assignedToUserId: input.assignedToUserId.trim() }),
    ...(from === undefined && to === undefined ? {} : { serviceStartAt: { ...(from === undefined ? {} : { gte: from }), ...(to === undefined ? {} : { lte: to }) } }),
  };
}

function pageNumber(value: number | undefined) {
  return Number.isInteger(value) && value! > 0 ? value! : 1;
}

function pageSizeNumber(value: number | undefined) {
  if (value === undefined) return 20;
  if (!Number.isInteger(value) || value < 1 || value > 25) throw new BadRequestException("OPERATIONAL_FULFILLMENT_PAGE_SIZE_INVALID");
  return value;
}

function toSummary(fulfillment: FulfillmentSummaryRecord) {
  return {
    id: fulfillment.id,
    requirementId: fulfillment.operationalRequirementId,
    travelPackageId: fulfillment.travelPackageId,
    servicePurposeCode: fulfillment.servicePurposeCode,
    servicePurposeName: fulfillment.servicePurposeName,
    providerName: fulfillment.providerName,
    reservationCode: fulfillment.reservationCode,
    confirmationReference: fulfillment.confirmationReference,
    status: fulfillment.status,
    serviceStartAt: fulfillment.serviceStartAt,
    serviceEndAt: fulfillment.serviceEndAt,
    assignedTo: fulfillment.assignedToUserId ? { userId: fulfillment.assignedToUserId, name: fulfillment.assignedToName } : null,
    passengerCount: fulfillment._count.passengers,
    passengerPreview: fulfillment.passengers.map((passenger) => passenger.travelPackageParticipant.client.fullName),
    purchaseCount: fulfillment._count.purchases,
    createdAt: fulfillment.createdAt,
    updatedAt: fulfillment.updatedAt,
  };
}

function toDetail(fulfillment: FulfillmentRecord) {
  return {
    ...toSummary({ ...fulfillment, _count: { passengers: fulfillment.passengers.length, purchases: fulfillment._count.purchases } }),
    providerReference: fulfillment.providerReference,
    voucherReference: fulfillment.voucherReference,
    ticketReference: fulfillment.ticketReference,
    detailPayload: fulfillment.detailPayload,
    detailVersion: fulfillment.detailVersion,
    confirmationNotes: fulfillment.confirmationNotes,
    passengers: fulfillment.passengers.map((passenger) => ({
      travelPackageParticipantId: passenger.travelPackageParticipantId,
      clientId: passenger.travelPackageParticipant.clientId,
      fullName: passenger.travelPackageParticipant.client.fullName,
      role: passenger.travelPackageParticipant.role,
    })),
  };
}
