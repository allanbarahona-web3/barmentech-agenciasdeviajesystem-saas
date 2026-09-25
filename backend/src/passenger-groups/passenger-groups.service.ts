import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { runTenantTransaction } from "../tenant/tenant-transaction";
import {
  CreatePassengerGroupDto,
  PassengerGroupMembersDto,
  UpdatePassengerGroupDto,
} from "./dto/passenger-group.dto";
import { isPassengerGroupableServiceCode } from "./passenger-group-catalog";
import {
  ListGroupingTravelPackagesDto,
  PaginatedGroupingTravelPackagesDto,
} from "./dto/list-grouping-travel-packages.dto";

export type PassengerGroupsActor = { userId: string; name: string };

type GroupMemberRecord = {
  travelPackageParticipantId: string;
  travelPackageParticipant: {
    id: string;
    clientId: string;
    client: { fullName: string };
  };
};

type GroupRecord = {
  id: string;
  travelPackageId: string;
  additionalServiceCatalogId: string;
  serviceCode: string;
  serviceName: string;
  name: string;
  color: string | null;
  notes: string | null;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: Date;
  updatedAt: Date;
  members: GroupMemberRecord[];
};

type GroupStateRecord = Pick<
  GroupRecord,
  "id" | "travelPackageId" | "additionalServiceCatalogId" | "status"
>;

type CatalogRecord = { id: string; code: string; name: string; isActive: boolean };

type GroupingTravelPackageSummaryRow = {
  travelPackageId: string;
  packageCode: string;
  name: string;
  destination: string;
  departureDate: Date;
  returnDate: Date;
  status: string;
  passengerCount: number;
  groupedPassengerCount: number;
};

type PassengerGroupsTransaction = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  travelPackage: Record<string, (...args: any[]) => Promise<any>>;
  additionalServiceCatalog: Record<string, (...args: any[]) => Promise<any>>;
  passengerGroup: Record<string, (...args: any[]) => Promise<any>>;
  travelPackageParticipant: Record<string, (...args: any[]) => Promise<any>>;
  passengerGroupMember: Record<string, (...args: any[]) => Promise<any>>;
};

type PassengerGroupsDatabase = {
  $transaction<T>(work: (transaction: PassengerGroupsTransaction) => Promise<T>): Promise<T>;
};

const GROUP_SELECT = {
  id: true,
  travelPackageId: true,
  additionalServiceCatalogId: true,
  serviceCode: true,
  serviceName: true,
  name: true,
  color: true,
  notes: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  members: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      travelPackageParticipantId: true,
      travelPackageParticipant: {
        select: {
          id: true,
          clientId: true,
          client: { select: { fullName: true } },
        },
      },
    },
  },
} as const;

@Injectable()
export class PassengerGroupsService {
  private readonly database: PassengerGroupsDatabase;

  constructor(prisma: PrismaService) {
    this.database = prisma as unknown as PassengerGroupsDatabase;
  }

  async listTravelPackageSummaries(
    tenantId: string,
    input: ListGroupingTravelPackagesDto,
  ): Promise<PaginatedGroupingTravelPackagesDto> {
    const search = input.search?.trim() || null;
    const searchPattern = search ? `%${search}%` : null;
    const offset = (input.page - 1) * input.pageSize;

    return this.withTenantTransaction(tenantId, async (tx) => {
      const totalRows = await tx.$queryRaw<Array<{ total: number }>>`
        SELECT COUNT(*)::integer AS "total"
        FROM "TravelPackage" travel_package
        WHERE travel_package."tenantId" = ${tenantId}
          AND travel_package."travelType" = CAST(${input.travelType} AS "TravelPackageType")
          AND (
            CAST(${searchPattern} AS TEXT) IS NULL
            OR travel_package."packageCode" ILIKE ${searchPattern}
            OR travel_package."name" ILIKE ${searchPattern}
          )
      `;
      const rows = await tx.$queryRaw<GroupingTravelPackageSummaryRow[]>`
        WITH selected_packages AS (
          SELECT
            travel_package."id",
            travel_package."packageCode",
            travel_package."name",
            travel_package."destination",
            travel_package."departureDate",
            travel_package."returnDate",
            travel_package."status"
          FROM "TravelPackage" travel_package
          WHERE travel_package."tenantId" = ${tenantId}
            AND travel_package."travelType" = CAST(${input.travelType} AS "TravelPackageType")
            AND (
              CAST(${searchPattern} AS TEXT) IS NULL
              OR travel_package."packageCode" ILIKE ${searchPattern}
              OR travel_package."name" ILIKE ${searchPattern}
            )
          ORDER BY travel_package."departureDate" ASC, travel_package."id" ASC
          LIMIT ${input.pageSize}
          OFFSET ${offset}
        ),
        roster_counts AS (
          SELECT
            participant."travelPackageId",
            COUNT(*)::integer AS "passengerCount"
          FROM "travel_package_participants" participant
          INNER JOIN selected_packages selected
            ON selected."id" = participant."travelPackageId"
          WHERE participant."tenantId" = ${tenantId}
          GROUP BY participant."travelPackageId"
        ),
        grouped_counts AS (
          SELECT
            member."travelPackageId",
            COUNT(DISTINCT member."travelPackageParticipantId")::integer AS "groupedPassengerCount"
          FROM "passenger_group_members" member
          INNER JOIN selected_packages selected
            ON selected."id" = member."travelPackageId"
          INNER JOIN "passenger_groups" passenger_group
            ON passenger_group."id" = member."passengerGroupId"
            AND passenger_group."tenantId" = member."tenantId"
            AND passenger_group."travelPackageId" = member."travelPackageId"
          WHERE member."tenantId" = ${tenantId}
            AND passenger_group."status" = 'ACTIVE'
          GROUP BY member."travelPackageId"
        )
        SELECT
          selected."id" AS "travelPackageId",
          selected."packageCode",
          selected."name",
          selected."destination",
          selected."departureDate",
          selected."returnDate",
          selected."status",
          COALESCE(roster."passengerCount", 0)::integer AS "passengerCount",
          COALESCE(grouped."groupedPassengerCount", 0)::integer AS "groupedPassengerCount"
        FROM selected_packages selected
        LEFT JOIN roster_counts roster
          ON roster."travelPackageId" = selected."id"
        LEFT JOIN grouped_counts grouped
          ON grouped."travelPackageId" = selected."id"
        ORDER BY selected."departureDate" ASC, selected."id" ASC
      `;

      const total = Number(totalRows[0]?.total ?? 0);
      return {
        items: rows.map((row) => {
          const passengerCount = Number(row.passengerCount);
          const groupedPassengerCount = Math.min(
            passengerCount,
            Number(row.groupedPassengerCount),
          );
          return {
            ...row,
            passengerCount,
            groupedPassengerCount,
            ungroupedPassengerCount: Math.max(
              0,
              passengerCount - groupedPassengerCount,
            ),
          };
        }),
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
      };
    });
  }

  list(tenantId: string, travelPackageId: string) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      await this.requireTravelPackage(tx, tenantId, travelPackageId);
      const rows = await tx.passengerGroup.findMany({
        where: { tenantId, travelPackageId },
        select: GROUP_SELECT,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }, { id: "desc" }],
      }) as GroupRecord[];
      return rows.map(toResponse);
    });
  }

  async find(tenantId: string, travelPackageId: string, groupId: string) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      const group = await this.findGroup(tx, tenantId, travelPackageId, groupId);
      if (!group) throw new NotFoundException("PASSENGER_GROUP_NOT_FOUND");
      return toResponse(group);
    });
  }

  create(
    tenantId: string,
    travelPackageId: string,
    input: CreatePassengerGroupDto,
    actor: PassengerGroupsActor,
  ) {
    const name = requiredText(input.name, "PASSENGER_GROUP_NAME_INVALID");
    return this.withTenantTransaction(tenantId, async (tx) => {
      await this.requireTravelPackage(tx, tenantId, travelPackageId);
      const catalog = await this.requireGroupableActiveCatalog(
        tx,
        tenantId,
        input.additionalServiceCatalogId,
      );
      const created = await tx.passengerGroup.create({
        data: {
          tenantId,
          travelPackageId,
          additionalServiceCatalogId: catalog.id,
          serviceCode: catalog.code,
          serviceName: catalog.name,
          name,
          color: optionalText(input.color),
          notes: optionalText(input.notes),
          status: "ACTIVE",
          createdByUserId: actor.userId,
          createdByName: actor.name,
        },
        select: GROUP_SELECT,
      }) as GroupRecord;
      return toResponse(created);
    });
  }

  update(
    tenantId: string,
    travelPackageId: string,
    groupId: string,
    input: UpdatePassengerGroupDto,
    actor: PassengerGroupsActor,
  ) {
    if (!hasUpdate(input)) throw new BadRequestException("PASSENGER_GROUP_UPDATE_EMPTY");
    return this.withTenantTransaction(tenantId, async (tx) => {
      const current = await this.requireActiveGroup(tx, tenantId, travelPackageId, groupId);
      const catalog = input.additionalServiceCatalogId !== undefined
        && input.additionalServiceCatalogId !== current.additionalServiceCatalogId
        ? await this.requireGroupableActiveCatalog(tx, tenantId, input.additionalServiceCatalogId)
        : null;
      const updated = await tx.passengerGroup.updateMany({
        where: { id: groupId, tenantId, travelPackageId, status: "ACTIVE" },
        data: {
          ...(input.name === undefined
            ? {}
            : { name: requiredText(input.name, "PASSENGER_GROUP_NAME_INVALID") }),
          ...(input.color === undefined ? {} : { color: optionalText(input.color) }),
          ...(input.notes === undefined ? {} : { notes: optionalText(input.notes) }),
          ...(catalog
            ? {
                additionalServiceCatalogId: catalog.id,
                serviceCode: catalog.code,
                serviceName: catalog.name,
              }
            : {}),
          updatedByUserId: actor.userId,
          updatedByName: actor.name,
        },
      });
      if (updated.count !== 1) {
        await this.throwLatestGroupState(tx, tenantId, travelPackageId, groupId);
      }
      const group = await this.findGroup(tx, tenantId, travelPackageId, groupId);
      if (!group) throw new NotFoundException("PASSENGER_GROUP_NOT_FOUND");
      return toResponse(group);
    });
  }

  archive(
    tenantId: string,
    travelPackageId: string,
    groupId: string,
    actor: PassengerGroupsActor,
  ) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      const current = await this.findGroupState(tx, tenantId, travelPackageId, groupId);
      if (!current) throw new NotFoundException("PASSENGER_GROUP_NOT_FOUND");
      if (current.status === "ACTIVE") {
        await tx.passengerGroup.updateMany({
          where: { id: groupId, tenantId, travelPackageId, status: "ACTIVE" },
          data: {
            status: "ARCHIVED",
            updatedByUserId: actor.userId,
            updatedByName: actor.name,
          },
        });
      }
      const group = await this.findGroup(tx, tenantId, travelPackageId, groupId);
      if (!group) throw new NotFoundException("PASSENGER_GROUP_NOT_FOUND");
      return toResponse(group);
    });
  }

  addMembers(
    tenantId: string,
    travelPackageId: string,
    groupId: string,
    input: PassengerGroupMembersDto,
    actor: PassengerGroupsActor,
  ) {
    const participantIds = uniqueParticipantIds(input.participantIds);
    return this.withTenantTransaction(tenantId, async (tx) => {
      await this.requireActiveGroup(tx, tenantId, travelPackageId, groupId);
      const participants = await tx.travelPackageParticipant.findMany({
        where: {
          tenantId,
          travelPackageId,
          id: { in: participantIds },
        },
        select: { id: true },
      }) as Array<{ id: string }>;
      if (participants.length !== participantIds.length) {
        throw new NotFoundException("PASSENGER_GROUP_PARTICIPANT_NOT_FOUND_IN_TRAVEL_PACKAGE");
      }
      await tx.passengerGroupMember.createMany({
        data: participantIds.map((travelPackageParticipantId) => ({
          tenantId,
          travelPackageId,
          passengerGroupId: groupId,
          travelPackageParticipantId,
          createdByUserId: actor.userId,
          createdByName: actor.name,
        })),
        skipDuplicates: true,
      });
      const group = await this.findGroup(tx, tenantId, travelPackageId, groupId);
      if (!group) throw new NotFoundException("PASSENGER_GROUP_NOT_FOUND");
      return toResponse(group);
    });
  }

  removeMembers(
    tenantId: string,
    travelPackageId: string,
    groupId: string,
    input: PassengerGroupMembersDto,
  ) {
    const participantIds = uniqueParticipantIds(input.participantIds);
    return this.withTenantTransaction(tenantId, async (tx) => {
      await this.requireActiveGroup(tx, tenantId, travelPackageId, groupId);
      await tx.passengerGroupMember.deleteMany({
        where: {
          tenantId,
          travelPackageId,
          passengerGroupId: groupId,
          travelPackageParticipantId: { in: participantIds },
        },
      });
      const group = await this.findGroup(tx, tenantId, travelPackageId, groupId);
      if (!group) throw new NotFoundException("PASSENGER_GROUP_NOT_FOUND");
      return toResponse(group);
    });
  }

  private async requireTravelPackage(
    tx: PassengerGroupsTransaction,
    tenantId: string,
    travelPackageId: string,
  ) {
    const travelPackage = await tx.travelPackage.findFirst({
      where: { id: travelPackageId, tenantId },
      select: { id: true },
    });
    if (!travelPackage) throw new NotFoundException("PASSENGER_GROUP_TRAVEL_PACKAGE_NOT_FOUND");
  }

  private async requireGroupableActiveCatalog(
    tx: PassengerGroupsTransaction,
    tenantId: string,
    catalogId: string,
  ): Promise<CatalogRecord> {
    const catalog = await tx.additionalServiceCatalog.findFirst({
      where: { id: catalogId, tenantId },
      select: { id: true, code: true, name: true, isActive: true },
    }) as CatalogRecord | null;
    if (!catalog) throw new NotFoundException("PASSENGER_GROUP_CATALOG_NOT_FOUND");
    if (!catalog.isActive) throw new ConflictException("PASSENGER_GROUP_CATALOG_INACTIVE");
    if (!isPassengerGroupableServiceCode(catalog.code)) {
      throw new BadRequestException("PASSENGER_GROUP_CATALOG_CODE_NOT_ALLOWED");
    }
    return catalog;
  }

  private async requireActiveGroup(
    tx: PassengerGroupsTransaction,
    tenantId: string,
    travelPackageId: string,
    groupId: string,
  ): Promise<GroupStateRecord> {
    const group = await this.findGroupState(tx, tenantId, travelPackageId, groupId);
    if (!group) throw new NotFoundException("PASSENGER_GROUP_NOT_FOUND");
    if (group.status !== "ACTIVE") throw new ConflictException("PASSENGER_GROUP_ARCHIVED_IMMUTABLE");
    return group;
  }

  private async throwLatestGroupState(
    tx: PassengerGroupsTransaction,
    tenantId: string,
    travelPackageId: string,
    groupId: string,
  ): Promise<never> {
    const group = await this.findGroupState(tx, tenantId, travelPackageId, groupId);
    if (!group) throw new NotFoundException("PASSENGER_GROUP_NOT_FOUND");
    throw new ConflictException("PASSENGER_GROUP_ARCHIVED_IMMUTABLE");
  }

  private findGroupState(
    tx: PassengerGroupsTransaction,
    tenantId: string,
    travelPackageId: string,
    groupId: string,
  ): Promise<GroupStateRecord | null> {
    return tx.passengerGroup.findFirst({
      where: { id: groupId, tenantId, travelPackageId },
      select: {
        id: true,
        travelPackageId: true,
        additionalServiceCatalogId: true,
        status: true,
      },
    }) as Promise<GroupStateRecord | null>;
  }

  private findGroup(
    tx: PassengerGroupsTransaction,
    tenantId: string,
    travelPackageId: string,
    groupId: string,
  ): Promise<GroupRecord | null> {
    return tx.passengerGroup.findFirst({
      where: { id: groupId, tenantId, travelPackageId },
      select: GROUP_SELECT,
    }) as Promise<GroupRecord | null>;
  }

  private withTenantTransaction<T>(
    tenantId: string,
    work: (tx: PassengerGroupsTransaction) => Promise<T>,
  ): Promise<T> {
    return runTenantTransaction(this.database, tenantId, work);
  }
}

function requiredText(value: unknown, errorCode: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new BadRequestException(errorCode);
  return normalized;
}

function optionalText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function hasUpdate(input: UpdatePassengerGroupDto): boolean {
  return input.name !== undefined
    || input.color !== undefined
    || input.notes !== undefined
    || input.additionalServiceCatalogId !== undefined;
}

function uniqueParticipantIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) {
    throw new BadRequestException("PASSENGER_GROUP_PARTICIPANTS_INVALID");
  }
  const ids = value.map((item) => (typeof item === "string" ? item.trim() : ""));
  if (ids.some((id) => !id || id.length > 191)) {
    throw new BadRequestException("PASSENGER_GROUP_PARTICIPANTS_INVALID");
  }
  return [...new Set(ids)];
}

function toResponse(group: GroupRecord) {
  return {
    id: group.id,
    travelPackageId: group.travelPackageId,
    additionalServiceCatalogId: group.additionalServiceCatalogId,
    serviceCode: group.serviceCode,
    serviceName: group.serviceName,
    name: group.name,
    color: group.color,
    notes: group.notes,
    status: group.status,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    members: group.members.map((member) => ({
      travelPackageParticipantId: member.travelPackageParticipantId,
      clientId: member.travelPackageParticipant.clientId,
      fullName: member.travelPackageParticipant.client.fullName,
    })),
  };
}
