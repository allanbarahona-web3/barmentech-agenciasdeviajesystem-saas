import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { OPERATIONAL_ADDITIONAL_SERVICE_READER, type OperationalAdditionalServiceReader } from "../../additional-services/operations-read/operational-additional-service-reader.port";
import { FINANCE_ELIGIBILITY_READER, type CommercialSourceRef, type FinanceEligibilityReader } from "../../finance/eligibility-read/finance-eligibility-reader.port";
import { OPERATIONAL_PASSENGER_NOTE_READER, type OperationalPassengerNoteReader } from "../../contracts/operations-read/operational-passenger-note-reader.port";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import { commercialSourceRefKey, requirementToCommercialSourceRef } from "../requirement-finance-source";
import { ListOperationalPassengerOverviewDto } from "./dto/list-operational-passenger-overview.dto";

type Tx = { $executeRaw<T = unknown>(q: TemplateStringsArray, ...v: unknown[]): Promise<T>; travelPackage: Record<string, (...a: any[]) => Promise<any>>; travelPackageParticipant: Record<string, (...a: any[]) => Promise<any>>; passengerGroupMember: Record<string, (...a: any[]) => Promise<any>>; operationalRequirementPassenger: Record<string, (...a: any[]) => Promise<any>>; operationalFulfillmentPassenger: Record<string, (...a: any[]) => Promise<any>>; };
type Db = { $transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> };
type Participant = { id: string; clientId: string; role: string; client: { fullName: string } };
type Assignment = { travelPackageParticipantId: string; operationalRequirementId: string; operationalRequirement: { travelPackageId: string; status: string; servicePurposeCode: string; servicePurposeName: string; critical: boolean; operationalDeadlineAt: Date | null; sourceType: string | null; sourceId: string | null; sourceLineId: string | null; sourceVersionId: string | null } };
type FulfillmentPassenger = { travelPackageParticipantId: string; operationalFulfillment: { operationalRequirementId: string; status: string } };

@Injectable()
export class OperationalPassengerOverviewService {
  private readonly db: Db;
  constructor(
    prisma: PrismaService,
    @Inject(OPERATIONAL_PASSENGER_NOTE_READER) private readonly notes: OperationalPassengerNoteReader,
    @Inject(FINANCE_ELIGIBILITY_READER) private readonly finance: FinanceEligibilityReader,
    @Inject(OPERATIONAL_ADDITIONAL_SERVICE_READER) private readonly additional: OperationalAdditionalServiceReader,
  ) { this.db = prisma as unknown as Db; }

  async list(tenantId: string, travelPackageId: string, input: ListOperationalPassengerOverviewDto) {
    const search = input.search?.trim();
    const passengerGroupId = input.passengerGroupId?.trim();
    const core = await this.tx(tenantId, async (tx) => {
      const trip = await tx.travelPackage.findFirst({ where: { id: travelPackageId, tenantId }, select: { id: true, packageCode: true, name: true, destination: true, departureDate: true, returnDate: true } });
      if (!trip) throw new NotFoundException("OPERATIONAL_READINESS_TRAVEL_PACKAGE_NOT_FOUND");
      const where = { tenantId, travelPackageId, ...(search ? { client: { fullName: { contains: search, mode: "insensitive" } } } : {}), ...(passengerGroupId ? { passengerGroupMembers: { some: { tenantId, travelPackageId, passengerGroupId, passengerGroup: { tenantId, travelPackageId, status: "ACTIVE" } } } } : {}) };
      const [participants, total] = await Promise.all([
        tx.travelPackageParticipant.findMany({ where, select: { id: true, clientId: true, role: true, client: { select: { fullName: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (input.page - 1) * input.pageSize, take: input.pageSize }) as Promise<Participant[]>,
        tx.travelPackageParticipant.count({ where }) as Promise<number>,
      ]);
      const ids = participants.map((p) => p.id);
      if (!ids.length) return { trip, participants, total, groups: [], assignments: [], fulfillments: [] as FulfillmentPassenger[] };
      const [groups, assignments] = await Promise.all([
        tx.passengerGroupMember.findMany({ where: { tenantId, travelPackageId, travelPackageParticipantId: { in: ids }, passengerGroup: { status: "ACTIVE" } }, select: { travelPackageParticipantId: true, passengerGroup: { select: { id: true, name: true, serviceCode: true, serviceName: true, color: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
        tx.operationalRequirementPassenger.findMany({
          where: { tenantId, travelPackageId, travelPackageParticipantId: { in: ids } },
          select: { travelPackageParticipantId: true, operationalRequirementId: true, operationalRequirement: { select: { travelPackageId: true, status: true, servicePurposeCode: true, servicePurposeName: true, critical: true, operationalDeadlineAt: true, sourceType: true, sourceId: true, sourceLineId: true, sourceVersionId: true } } },
        }) as Promise<Assignment[]>,
      ]);
      const requirementIds = [...new Set(assignments.map((assignment) => assignment.operationalRequirementId))];
      const fulfillments: FulfillmentPassenger[] = requirementIds.length ? (await tx.operationalFulfillmentPassenger.findMany({ where: { tenantId, travelPackageId, travelPackageParticipantId: { in: ids }, operationalFulfillment: { operationalRequirementId: { in: requirementIds }, status: { not: "CANCELLED" } } }, select: { travelPackageParticipantId: true, operationalFulfillment: { select: { operationalRequirementId: true, status: true } } } })) as FulfillmentPassenger[] : [];
      return { trip, participants, total, groups, assignments, fulfillments };
    });

    const participantIds = core.participants.map((participant) => participant.id);
    const clientIds = core.participants.map((participant) => participant.clientId);
    const [notes, additional] = await Promise.all([
      safeMap(() => this.notes.readNotesForParticipants({ tenantId, travelPackageId, participantIds })),
      safeMap(() => this.additional.readForClients({ tenantId, travelPackageId, clientIds })),
    ]);
    const sourceByRequirementId = new Map<string, CommercialSourceRef>();
    for (const assignment of core.assignments) {
      const source = requirementToCommercialSourceRef(assignment.operationalRequirement);
      if (source) sourceByRequirementId.set(assignment.operationalRequirementId, source);
    }
    const uniqueSources = new Map<string, CommercialSourceRef>();
    for (const source of sourceByRequirementId.values()) uniqueSources.set(commercialSourceRefKey(source), source);
    const eligibility = uniqueSources.size ? await safeArray(() => this.finance.readMany({ tenantId, sources: [...uniqueSources.values()] })) : [];
    const financeBySource = new Map(eligibility.map((item) => [commercialSourceRefKey(item.source), item]));
    const assignmentsByParticipant = group(core.assignments, (assignment) => assignment.travelPackageParticipantId);
    const groupsByParticipant = group(core.groups, (membership: any) => membership.travelPackageParticipantId);
    const covered = new Set(core.fulfillments.filter((fulfillment) => fulfillment.operationalFulfillment.status === "CONFIRMED").map((fulfillment) => key(fulfillment.operationalFulfillment.operationalRequirementId, fulfillment.travelPackageParticipantId)));
    return {
      trip: core.trip,
      items: core.participants.map((participant) => row(participant, assignmentsByParticipant.get(participant.id) ?? [], groupsByParticipant.get(participant.id) ?? [], notes.get(participant.id) ?? [], additional.get(participant.clientId) ?? [], sourceByRequirementId, financeBySource, covered)),
      total: core.total,
      page: input.page,
      pageSize: input.pageSize,
      totalPages: core.total === 0 ? 0 : Math.ceil(core.total / input.pageSize),
    };
  }

  private tx<T>(tenantId: string, work: (tx: Tx) => Promise<T>) { return runTenantTransaction(this.db, tenantId, work); }
}

function row(p: Participant, assignments: Assignment[], groups: any[], notes: any[], additionalServices: any[], sourceByRequirementId: Map<string, CommercialSourceRef>, finance: Map<string, any>, covered: Set<string>) {
  const applicable = assignments.filter((assignment) => assignment.operationalRequirement.status !== "CANCELLED" && assignment.operationalRequirement.status !== "NOT_APPLICABLE");
  const fulfilled = applicable.filter((assignment) => covered.has(key(assignment.operationalRequirementId, p.id)));
  const requirements = assignments.map((assignment) => ({ id: assignment.operationalRequirementId, servicePurposeCode: assignment.operationalRequirement.servicePurposeCode, servicePurposeName: assignment.operationalRequirement.servicePurposeName, status: assignment.operationalRequirement.status, critical: assignment.operationalRequirement.critical, deadline: assignment.operationalRequirement.operationalDeadlineAt, coverageStatus: covered.has(key(assignment.operationalRequirementId, p.id)) ? "FULFILLED" : "PENDING" }));
  const missingItems = applicable.filter((assignment) => !covered.has(key(assignment.operationalRequirementId, p.id))).map((assignment) => ({ servicePurposeCode: assignment.operationalRequirement.servicePurposeCode, servicePurposeName: assignment.operationalRequirement.servicePurposeName })).filter((value, index, values) => values.findIndex((other) => other.servicePurposeCode === value.servicePurposeCode) === index);
  const sources = new Map<string, CommercialSourceRef>();
  for (const assignment of assignments) {
    const source = sourceByRequirementId.get(assignment.operationalRequirementId);
    if (source) sources.set(commercialSourceRefKey(source), source);
  }
  const sourceDetails = [...sources.values()].map((source) => finance.get(commercialSourceRefKey(source))).filter(Boolean).map((item) => ({ sourceId: item.source.sourceId, eligibility: item.eligibility, reason: item.reason, outstandingAmount: item.financial?.outstandingAmount ?? null, currency: item.financial?.currency ?? null }));
  const blocked = sourceDetails.find((item) => item.eligibility === "BLOCKED");
  const eligible = sourceDetails.find((item) => item.eligibility === "ELIGIBLE");
  const financial = blocked ?? eligible;
  return { travelPackageParticipantId: p.id, clientId: p.clientId, fullName: p.client.fullName, role: p.role, groups: groups.map((membership) => ({ id: membership.passengerGroup.id, name: membership.passengerGroup.name, servicePurposeCode: membership.passengerGroup.serviceCode, servicePurposeName: membership.passengerGroup.serviceName, color: membership.passengerGroup.color })), operationalNotes: notes.map((note) => ({ id: note.id, text: note.text, sourceReference: note.source.sourceId, createdAt: note.createdAt })), additionalServices, requirements, progress: { fulfilled: fulfilled.length, total: applicable.length, percent: applicable.length ? Number(((fulfilled.length / applicable.length) * 100).toFixed(2)) : null, isOperationallyComplete: applicable.length > 0 && fulfilled.length === applicable.length }, financeEligibility: { eligibility: blocked ? "BLOCKED" : eligible ? "ELIGIBLE" : "UNKNOWN", reason: financial?.reason ?? null, outstandingAmount: financial?.outstandingAmount ?? null, currency: financial?.currency ?? null, sources: sourceDetails }, missingItems };
}
function key(requirementId: string, participantId: string) { return `${requirementId}\u0000${participantId}`; }
function group<T>(items: T[], get: (item: T) => string) { const result = new Map<string, T[]>(); for (const item of items) result.set(get(item), [...(result.get(get(item)) ?? []), item]); return result; }
async function safeMap<T>(read: () => Promise<Map<string, T[]>>) { try { return await read(); } catch { return new Map<string, T[]>(); } }
async function safeArray<T>(read: () => Promise<T[]>) { try { return await read(); } catch { return [] as T[]; } }
