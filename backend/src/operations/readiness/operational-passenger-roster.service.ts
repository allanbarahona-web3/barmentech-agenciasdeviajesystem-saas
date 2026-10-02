import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import { ListOperationalPassengerRosterDto } from "./dto/list-operational-passenger-roster.dto";

type Tx = { $executeRaw<T = unknown>(q: TemplateStringsArray, ...v: unknown[]): Promise<T>; travelPackage: Record<string, (...a: any[]) => Promise<any>>; travelPackageParticipant: Record<string, (...a: any[]) => Promise<any>>; passengerGroupMember: Record<string, (...a: any[]) => Promise<any>>; operationalRequirementPassenger: Record<string, (...a: any[]) => Promise<any>>; operationalFulfillmentPassenger: Record<string, (...a: any[]) => Promise<any>>; };
type Db = { $transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> };
type Participant = { id: string; clientId: string; role: string; client: { fullName: string } };
type Assignment = { travelPackageParticipantId: string; operationalRequirementId: string; operationalRequirement: { status: string } };
type FulfillmentPassenger = { travelPackageParticipantId: string; operationalFulfillment: { operationalRequirementId: string; status: string } };

@Injectable()
export class OperationalPassengerRosterService {
  private readonly db: Db;

  constructor(prisma: PrismaService) { this.db = prisma as unknown as Db; }

  async list(tenantId: string, travelPackageId: string, input: ListOperationalPassengerRosterDto) {
    const search = input.search?.trim();
    return this.tx(tenantId, async (tx) => {
      const trip = await tx.travelPackage.findFirst({ where: { id: travelPackageId, tenantId }, select: { id: true } });
      if (!trip) throw new NotFoundException("OPERATIONAL_ROSTER_TRAVEL_PACKAGE_NOT_FOUND");
      const where = { tenantId, travelPackageId, ...(search ? { client: { fullName: { contains: search, mode: "insensitive" } } } : {}) };
      const [participants, total] = await Promise.all([
        tx.travelPackageParticipant.findMany({ where, select: { id: true, clientId: true, role: true, client: { select: { fullName: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (input.page - 1) * input.pageSize, take: input.pageSize }) as Promise<Participant[]>,
        tx.travelPackageParticipant.count({ where }) as Promise<number>,
      ]);
      const ids = participants.map((participant) => participant.id);
      if (!ids.length) return { items: [], total, page: input.page, pageSize: input.pageSize, totalPages: total ? Math.ceil(total / input.pageSize) : 0 };
      const [groups, assignments] = await Promise.all([
        tx.passengerGroupMember.findMany({ where: { tenantId, travelPackageId, travelPackageParticipantId: { in: ids }, passengerGroup: { tenantId, travelPackageId, status: "ACTIVE" } }, select: { travelPackageParticipantId: true, passengerGroup: { select: { id: true, name: true, serviceCode: true, serviceName: true, color: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
        tx.operationalRequirementPassenger.findMany({ where: { tenantId, travelPackageId, travelPackageParticipantId: { in: ids } }, select: { travelPackageParticipantId: true, operationalRequirementId: true, operationalRequirement: { select: { status: true } } } }) as Promise<Assignment[]>,
      ]);
      const requirementIds = [...new Set(assignments.map((assignment) => assignment.operationalRequirementId))];
      const fulfillments: FulfillmentPassenger[] = requirementIds.length ? await tx.operationalFulfillmentPassenger.findMany({ where: { tenantId, travelPackageId, travelPackageParticipantId: { in: ids }, operationalFulfillment: { operationalRequirementId: { in: requirementIds }, status: { not: "CANCELLED" } } }, select: { travelPackageParticipantId: true, operationalFulfillment: { select: { operationalRequirementId: true, status: true } } } }) as FulfillmentPassenger[] : [];
      const groupsByParticipant = group(groups, (membership: any) => membership.travelPackageParticipantId);
      const assignmentsByParticipant = group(assignments, (assignment) => assignment.travelPackageParticipantId);
      const covered = new Set(fulfillments.filter((fulfillment) => fulfillment.operationalFulfillment.status === "CONFIRMED").map((fulfillment) => key(fulfillment.operationalFulfillment.operationalRequirementId, fulfillment.travelPackageParticipantId)));
      return {
        items: participants.map((participant) => rosterRow(participant, assignmentsByParticipant.get(participant.id) ?? [], groupsByParticipant.get(participant.id) ?? [], covered)),
        total, page: input.page, pageSize: input.pageSize, totalPages: Math.ceil(total / input.pageSize),
      };
    });
  }

  private tx<T>(tenantId: string, work: (tx: Tx) => Promise<T>) { return runTenantTransaction(this.db, tenantId, work); }
}

function rosterRow(participant: Participant, assignments: Assignment[], groups: any[], covered: Set<string>) {
  const applicable = assignments.filter((assignment) => assignment.operationalRequirement.status !== "CANCELLED" && assignment.operationalRequirement.status !== "NOT_APPLICABLE");
  const fulfilled = applicable.filter((assignment) => covered.has(key(assignment.operationalRequirementId, participant.id)));
  return {
    travelPackageParticipantId: participant.id,
    clientId: participant.clientId,
    fullName: participant.client.fullName,
    role: participant.role,
    groups: groups.map((membership) => ({ id: membership.passengerGroup.id, name: membership.passengerGroup.name, servicePurposeCode: membership.passengerGroup.serviceCode, servicePurposeName: membership.passengerGroup.serviceName, color: membership.passengerGroup.color })),
    progress: { fulfilled: fulfilled.length, total: applicable.length, percent: applicable.length ? Number(((fulfilled.length / applicable.length) * 100).toFixed(2)) : null, isOperationallyComplete: applicable.length > 0 && fulfilled.length === applicable.length },
  };
}

function key(requirementId: string, participantId: string) { return `${requirementId}\u0000${participantId}`; }
function group<T>(items: T[], get: (item: T) => string) { const result = new Map<string, T[]>(); for (const item of items) result.set(get(item), [...(result.get(get(item)) ?? []), item]); return result; }
