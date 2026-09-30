import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
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
  travelPackage: Record<string, (...args: any[]) => Promise<any>>;
  travelPackageParticipant: Record<string, (...args: any[]) => Promise<any>>;
  user: Record<string, (...args: any[]) => Promise<any>>;
  operationalRequirement: Record<string, (...args: any[]) => Promise<any>>;
  operationalRequirementPassenger: Record<string, (...args: any[]) => Promise<any>>;
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
  travelPackageId: string;
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
};
type RequirementSummaryRecord = Omit<RequirementRecord, "passengers"> & {
  _count: { passengers: number };
};

const REQUIREMENT_DETAIL_SELECT = {
  id: true,
  travelPackageId: true,
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
  travelPackageId: true,
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
  _count: { select: { passengers: true } },
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

  constructor(prisma: PrismaService) {
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
      return {
        items: rows.map(toSummary),
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
      return toDetail(requirement);
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
          travelPackageId,
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
    if (!hasUpdate(input)) throw new BadRequestException("OPERATIONAL_REQUIREMENT_UPDATE_EMPTY");
    return this.withTenantTransaction(tenantId, async (tx) => {
      await this.requireRequirementState(tx, tenantId, travelPackageId, requirementId);
      const assignee = input.assignedToUserId === undefined
        ? undefined
        : await this.resolveAssignee(tx, tenantId, input.assignedToUserId);
      const updated = await tx.operationalRequirement.updateMany({
        where: { id: requirementId, tenantId, travelPackageId },
        data: {
          ...(input.servicePurposeCode === undefined ? {} : {
            servicePurposeCode: requiredText(input.servicePurposeCode, "OPERATIONAL_REQUIREMENT_SERVICE_PURPOSE_CODE_INVALID"),
          }),
          ...(input.servicePurposeName === undefined ? {} : {
            servicePurposeName: requiredText(input.servicePurposeName, "OPERATIONAL_REQUIREMENT_SERVICE_PURPOSE_NAME_INVALID"),
          }),
          ...(input.description === undefined ? {} : {
            description: requiredText(input.description, "OPERATIONAL_REQUIREMENT_DESCRIPTION_INVALID"),
          }),
          ...(input.critical === undefined ? {} : { critical: input.critical }),
          ...(input.operationalDeadlineAt === undefined ? {} : {
            operationalDeadlineAt: optionalDate(input.operationalDeadlineAt, "OPERATIONAL_REQUIREMENT_DEADLINE_INVALID"),
          }),
          ...(assignee === undefined ? {} : {
            assignedToUserId: assignee?.id ?? null,
            assignedToName: assignee?.fullName ?? null,
          }),
          ...(input.sourceReference === undefined ? {} : { sourceReference: optionalText(input.sourceReference) }),
          ...sourceGroupSnapshotUpdates(input),
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

function requirementListWhere(tenantId: string, travelPackageId: string, input: ListOperationalRequirementsDto) {
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
    ...(deadlineFrom === undefined && deadlineTo === undefined ? {} : {
      operationalDeadlineAt: { ...(deadlineFrom === undefined ? {} : { gte: deadlineFrom }), ...(deadlineTo === undefined ? {} : { lte: deadlineTo }) },
    }),
    ...(search ? { OR: [{ description: { contains: search, mode: "insensitive" } }, { sourceReference: { contains: search, mode: "insensitive" } }] } : {}),
  };
}

function sourceGroupSnapshotUpdates(input: UpdateOperationalRequirementDto) {
  return {
    ...(input.sourcePassengerGroupId === undefined ? {} : { sourcePassengerGroupId: optionalText(input.sourcePassengerGroupId) }),
    ...(input.sourcePassengerGroupName === undefined ? {} : { sourcePassengerGroupName: optionalText(input.sourcePassengerGroupName) }),
    ...(input.sourcePassengerGroupServiceCode === undefined ? {} : { sourcePassengerGroupServiceCode: optionalText(input.sourcePassengerGroupServiceCode) }),
  };
}

function hasUpdate(input: UpdateOperationalRequirementDto) {
  return input.servicePurposeCode !== undefined
    || input.servicePurposeName !== undefined
    || input.description !== undefined
    || input.critical !== undefined
    || input.operationalDeadlineAt !== undefined
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
    travelPackageId: requirement.travelPackageId,
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
