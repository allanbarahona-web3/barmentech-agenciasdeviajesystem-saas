import { Injectable, NotFoundException } from "@nestjs/common";
import { calculateAge, formatDateOnly } from "../../customers/customer-date-of-birth";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import {
  OPERATIONAL_PASSENGER_DASHBOARD_SOURCES,
  OPERATIONAL_PASSENGER_DASHBOARD_STATUSES,
  type ListOperationalPassengerDashboardDto,
} from "./dto/list-operational-passenger-dashboard.dto";

type Tx = any;
type Db = { $transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> };
type PageRow = { travelPackageParticipantId: string | null; clientId: string | null; fullName: string | null; identification: string | null; role: string | null; dateOfBirth: Date | null; total: number | bigint | null; sourceFacets: unknown; statusFacets: unknown; passengerCount: number | bigint | null; requirementCount: number | bigint | null; pendingCount: number | bigint | null; confirmedCount: number | bigint | null };
type Assignment = { travelPackageParticipantId: string; operationalRequirementId: string; operationalRequirement: { servicePurposeName: string; sourceType: string; status: string; _count: { passengers: number } } };
type FulfillmentPassenger = { travelPackageParticipantId: string; operationalFulfillment: { operationalRequirementId: string; status: string; reservationCode: string | null; purchases: Array<{ id: string }> } };

const DIACRITIC_FROM = "áàäâãåāăąéèëêēĕėęěíìïîīĭįıóòöôõōŏőúùüûūŭůűųñńçćčýÿ";
const DIACRITIC_TO = "aaaaaaaaaeeeeeeeeeiiiiiiiioooooooouuuuuuuuunncccyy";

@Injectable()
export class OperationalPassengerDashboardService {
  private readonly db: Db;
  constructor(prisma: PrismaService) { this.db = prisma as unknown as Db; }

  async list(tenantId: string, travelPackageId: string, input: ListOperationalPassengerDashboardDto) {
    return runTenantTransaction(this.db, tenantId, async (tx) => {
      const trip = await tx.travelPackage.findFirst({ where: { id: travelPackageId, tenantId }, select: { id: true, departureDate: true } });
      if (!trip) throw new NotFoundException("OPERATIONAL_PASSENGER_DASHBOARD_TRAVEL_PACKAGE_NOT_FOUND");

      const pageRows = await dashboardPage(tx, tenantId, travelPackageId, input);
      const pageMeta = pageRows[0] ?? null;
      const total = numberValue(pageMeta?.total);
      const participants = pageRows.filter((row): row is PageRow & { travelPackageParticipantId: string; clientId: string; fullName: string; identification: string; role: string } => Boolean(row.travelPackageParticipantId && row.clientId && row.fullName && row.identification && row.role));
      const participantIds = participants.map((participant) => participant.travelPackageParticipantId);
      const clientIds = [...new Set(participants.map((participant) => participant.clientId))];

      const [contractSources, groupMemberships, assignments, noteCounts] = await Promise.all([
        tx.travelPackageParticipantContractSource.findMany({
          where: { tenantId, travelPackageId },
          select: { travelPackageParticipantId: true, contractId: true, sourceRole: true, contract: { select: { contractNumber: true, status: true } } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }),
        tx.passengerGroupMember.findMany({
          where: { tenantId, travelPackageId, passengerGroup: { tenantId, travelPackageId, status: "ACTIVE" } },
          select: { travelPackageParticipantId: true, passengerGroup: { select: { id: true, name: true, color: true, serviceCode: true, serviceName: true } } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }),
        participantIds.length ? tx.operationalRequirementPassenger.findMany({
          where: { tenantId, travelPackageId, travelPackageParticipantId: { in: participantIds } },
          select: { travelPackageParticipantId: true, operationalRequirementId: true, operationalRequirement: { select: { servicePurposeName: true, sourceType: true, status: true, _count: { select: { passengers: true } } } } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }) as Promise<Assignment[]> : Promise.resolve([] as Assignment[]),
        clientIds.length ? tx.contractNote.groupBy({
          by: ["clientId"],
          where: {
            tenantId,
            travelPackageId,
            clientId: { in: clientIds },
            status: "ACTIVE",
          },
          _count: { _all: true },
        }) : Promise.resolve([]),
      ]);
      const requirementIds = [...new Set(assignments.map((assignment) => assignment.operationalRequirementId))];
      const fulfillments: FulfillmentPassenger[] = requirementIds.length === 0 ? [] : await tx.operationalFulfillmentPassenger.findMany({
        where: { tenantId, travelPackageId, travelPackageParticipantId: { in: participantIds }, operationalFulfillment: { operationalRequirementId: { in: requirementIds }, status: { not: "CANCELLED" } } },
        select: { travelPackageParticipantId: true, operationalFulfillment: { select: { operationalRequirementId: true, status: true, reservationCode: true, purchases: { select: { id: true } } } } },
      });

      const contractsByParticipant = group(contractSources, (row: any) => row.travelPackageParticipantId);
      const groupsByParticipant = group(groupMemberships, (row: any) => row.travelPackageParticipantId);
      const fulfillmentsByAssignment = group(fulfillments, (row) => key(row.operationalFulfillment.operationalRequirementId, row.travelPackageParticipantId));
      const assignmentsByParticipant = group(assignments, (row) => row.travelPackageParticipantId);
      const operationalNoteCountByClientId = new Map(
        noteCounts
          .filter((row: any) => typeof row.clientId === "string")
          .map((row: any) => [row.clientId, Number(row._count._all)]),
      );
      const filteredAssignmentsByParticipant = new Map<string, Assignment[]>();
      for (const participant of participantIds) {
        filteredAssignmentsByParticipant.set(participant, (assignmentsByParticipant.get(participant) ?? []).filter((assignment) => matchesFilters(assignment, fulfillmentsByAssignment.get(key(assignment.operationalRequirementId, participant)) ?? [], input)));
      }

      const contractFacet = uniqueContracts(contractSources);
      const groupFacet = uniqueGroups(groupMemberships);
      return {
        items: participants.map((participant) => {
          const { dateOfBirth, ...identity } = participant;
          const passengerAssignments = filteredAssignmentsByParticipant.get(participant.travelPackageParticipantId) ?? [];
          const requirements = passengerAssignments.map((assignment) => requirementItem(assignment, fulfillmentsByAssignment.get(key(assignment.operationalRequirementId, participant.travelPackageParticipantId)) ?? []));
          const confirmedCount = requirements.filter((requirement) => requirement.confirmationStatus === "CONFIRMED").length;
          return {
            participant: {
              ...identity,
              ageAtTrip: dateOfBirth && trip.departureDate ? calculateAge(dateOfBirth, formatDateOnly(trip.departureDate)) : null,
            },
            contractSources: (contractsByParticipant.get(participant.travelPackageParticipantId) ?? []).map((source: any) => ({ contractId: source.contractId, contractNumber: source.contract.contractNumber, status: source.contract.status, sourceRole: source.sourceRole })),
            passengerGroups: (groupsByParticipant.get(participant.travelPackageParticipantId) ?? []).map((membership: any) => membership.passengerGroup),
            requirements,
            summary: { requirementCount: requirements.length, pendingCount: requirements.length - confirmedCount, confirmedCount },
            operationalNoteCount: operationalNoteCountByClientId.get(participant.clientId) ?? 0,
          };
        }),
        facets: {
          contracts: contractFacet,
          passengerGroups: groupFacet,
          sources: parseFacet(pageMeta?.sourceFacets, OPERATIONAL_PASSENGER_DASHBOARD_SOURCES).map((value) => ({ value, label: value === "BASE_TRIP" ? "Contrato base" : "Servicio adicional" })),
          statuses: parseFacet(pageMeta?.statusFacets, OPERATIONAL_PASSENGER_DASHBOARD_STATUSES),
        },
        summary: { passengerCount: numberValue(pageMeta?.passengerCount), requirementCount: numberValue(pageMeta?.requirementCount), pendingCount: numberValue(pageMeta?.pendingCount), confirmedCount: numberValue(pageMeta?.confirmedCount) },
        pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize) },
      };
    });
  }
}

function dashboardPage(tx: Tx, tenantId: string, travelPackageId: string, input: ListOperationalPassengerDashboardDto): Promise<PageRow[]> {
  const search = input.search?.trim() || null;
  const searchPattern = search ? `%${normalizeSearch(search)}%` : null;
  const offset = (input.page - 1) * input.pageSize;
  return tx.$queryRaw<PageRow[]>`
    WITH requirement_state AS MATERIALIZED (
      SELECT rp."travelPackageParticipantId" AS "participantId", r.id AS "requirementId",
        CASE WHEN r."sourceType" = 'TRAVEL_PACKAGE_COST_COMPONENT' THEN 'BASE_TRIP'
          WHEN r."sourceType" = 'ADDITIONAL_SERVICE_ORDER_LINE' THEN 'ADDITIONAL_SERVICES' ELSE NULL END AS source,
        CASE WHEN r.status IN ('CANCELLED', 'NOT_APPLICABLE') THEN r.status::text
          WHEN EXISTS (SELECT 1 FROM "operational_fulfillments" f JOIN "operational_fulfillment_passengers" fp ON fp."operationalFulfillmentId" = f.id AND fp."tenantId" = f."tenantId" AND fp."travelPackageId" = f."travelPackageId" WHERE f."tenantId" = ${tenantId} AND f."travelPackageId" = ${travelPackageId} AND f."operationalRequirementId" = r.id AND fp."travelPackageParticipantId" = rp."travelPackageParticipantId" AND f.status = 'CONFIRMED') THEN 'CONFIRMED'
          WHEN EXISTS (SELECT 1 FROM "operational_fulfillments" f JOIN "operational_fulfillment_passengers" fp ON fp."operationalFulfillmentId" = f.id AND fp."tenantId" = f."tenantId" AND fp."travelPackageId" = f."travelPackageId" JOIN "operational_purchases" op ON op."operationalFulfillmentId" = f.id AND op."tenantId" = f."tenantId" AND op."travelPackageId" = f."travelPackageId" WHERE f."tenantId" = ${tenantId} AND f."travelPackageId" = ${travelPackageId} AND f."operationalRequirementId" = r.id AND fp."travelPackageParticipantId" = rp."travelPackageParticipantId" AND f.status <> 'CANCELLED') THEN 'PURCHASED'
          WHEN EXISTS (SELECT 1 FROM "operational_fulfillments" f JOIN "operational_fulfillment_passengers" fp ON fp."operationalFulfillmentId" = f.id AND fp."tenantId" = f."tenantId" AND fp."travelPackageId" = f."travelPackageId" WHERE f."tenantId" = ${tenantId} AND f."travelPackageId" = ${travelPackageId} AND f."operationalRequirementId" = r.id AND fp."travelPackageParticipantId" = rp."travelPackageParticipantId" AND (f.status = 'RESERVED' OR f."reservationCode" IS NOT NULL)) THEN 'RESERVED'
          WHEN r.status = 'IN_PROGRESS' OR EXISTS (SELECT 1 FROM "operational_fulfillments" f JOIN "operational_fulfillment_passengers" fp ON fp."operationalFulfillmentId" = f.id AND fp."tenantId" = f."tenantId" AND fp."travelPackageId" = f."travelPackageId" WHERE f."tenantId" = ${tenantId} AND f."travelPackageId" = ${travelPackageId} AND f."operationalRequirementId" = r.id AND fp."travelPackageParticipantId" = rp."travelPackageParticipantId" AND f.status <> 'CANCELLED') THEN 'IN_PROGRESS'
          ELSE 'PENDING' END AS status
      FROM "operational_requirement_passengers" rp
      JOIN "operational_requirements" r ON r.id = rp."operationalRequirementId" AND r."tenantId" = rp."tenantId" AND r."travelPackageId" = rp."travelPackageId"
      WHERE rp."tenantId" = ${tenantId} AND rp."travelPackageId" = ${travelPackageId}
    ), filtered_participants AS MATERIALIZED (
      SELECT p.id, p."clientId", c."fullName", c."idNumber", p.role, p."dateOfBirth"
      FROM "travel_package_participants" p
      JOIN "Client" c ON c.id = p."clientId" AND c."tenantId" = p."tenantId"
      WHERE p."tenantId" = ${tenantId} AND p."travelPackageId" = ${travelPackageId}
        AND (CAST(${searchPattern} AS TEXT) IS NULL OR translate(lower(c."fullName"), ${DIACRITIC_FROM}, ${DIACRITIC_TO}) LIKE ${searchPattern} OR translate(lower(c."idNumber"), ${DIACRITIC_FROM}, ${DIACRITIC_TO}) LIKE ${searchPattern})
        AND (CAST(${input.contractId ?? null} AS TEXT) IS NULL OR EXISTS (SELECT 1 FROM "travel_package_participant_contract_sources" cs WHERE cs."tenantId" = ${tenantId} AND cs."travelPackageId" = ${travelPackageId} AND cs."travelPackageParticipantId" = p.id AND cs."contractId" = ${input.contractId ?? null}))
        AND (CAST(${input.passengerGroupId ?? null} AS TEXT) IS NULL OR EXISTS (SELECT 1 FROM "passenger_group_members" pgm JOIN "passenger_groups" pg ON pg.id = pgm."passengerGroupId" AND pg."tenantId" = pgm."tenantId" AND pg."travelPackageId" = pgm."travelPackageId" WHERE pgm."tenantId" = ${tenantId} AND pgm."travelPackageId" = ${travelPackageId} AND pgm."travelPackageParticipantId" = p.id AND pgm."passengerGroupId" = ${input.passengerGroupId ?? null} AND pg.status = 'ACTIVE'))
        AND ((CAST(${input.source ?? null} AS TEXT) IS NULL AND CAST(${input.status ?? null} AS TEXT) IS NULL) OR EXISTS (SELECT 1 FROM requirement_state state WHERE state."participantId" = p.id AND (CAST(${input.source ?? null} AS TEXT) IS NULL OR state.source = ${input.source ?? null}) AND (CAST(${input.status ?? null} AS TEXT) IS NULL OR state.status = ${input.status ?? null})))
    ), filtered_requirements AS MATERIALIZED (
      SELECT state.* FROM requirement_state state JOIN filtered_participants participant ON participant.id = state."participantId"
      WHERE (CAST(${input.source ?? null} AS TEXT) IS NULL OR state.source = ${input.source ?? null}) AND (CAST(${input.status ?? null} AS TEXT) IS NULL OR state.status = ${input.status ?? null})
    ), page AS (
      SELECT * FROM filtered_participants ORDER BY translate(lower("fullName"), ${DIACRITIC_FROM}, ${DIACRITIC_TO}) ASC, id ASC LIMIT ${input.pageSize} OFFSET ${offset}
    ), facets AS (
      SELECT COALESCE(jsonb_agg(DISTINCT source) FILTER (WHERE source IS NOT NULL), '[]'::jsonb) AS "sourceFacets", COALESCE(jsonb_agg(DISTINCT status), '[]'::jsonb) AS "statusFacets" FROM requirement_state
    ), dashboard_summary AS (
      SELECT COUNT(DISTINCT participant.id)::integer AS "passengerCount", COUNT(*)::integer AS "requirementCount", COUNT(*) FILTER (WHERE state.status <> 'CONFIRMED')::integer AS "pendingCount", COUNT(*) FILTER (WHERE state.status = 'CONFIRMED')::integer AS "confirmedCount" FROM filtered_participants participant LEFT JOIN filtered_requirements state ON state."participantId" = participant.id
    )
    SELECT page.id AS "travelPackageParticipantId", page."clientId", page."fullName", page."idNumber" AS identification, page.role, page."dateOfBirth", totals.total, facets."sourceFacets", facets."statusFacets", summary."passengerCount", summary."requirementCount", summary."pendingCount", summary."confirmedCount"
    FROM (SELECT COUNT(*)::integer AS total FROM filtered_participants) totals
    CROSS JOIN facets CROSS JOIN dashboard_summary summary LEFT JOIN page ON true
  `;
}

function requirementItem(assignment: Assignment, fulfillments: FulfillmentPassenger[]) {
  const state = executionState(assignment.operationalRequirement.status, fulfillments);
  return { requirementId: assignment.operationalRequirementId, serviceName: assignment.operationalRequirement.servicePurposeName, sourceType: assignment.operationalRequirement.sourceType, sourceLabel: sourceLabel(assignment.operationalRequirement.sourceType), status: state, reservationStatus: reservationState(fulfillments), purchaseStatus: purchaseState(fulfillments), confirmationStatus: state === "CONFIRMED" ? "CONFIRMED" : "PENDING", sharedPassengerCount: assignment.operationalRequirement._count.passengers };
}

function executionState(requirementStatus: string, fulfillments: FulfillmentPassenger[]) {
  if (requirementStatus === "CANCELLED" || requirementStatus === "NOT_APPLICABLE") return requirementStatus;
  const rows = fulfillments.map((row) => row.operationalFulfillment);
  if (rows.some((fulfillment) => fulfillment.status === "CONFIRMED")) return "CONFIRMED";
  if (rows.some((fulfillment) => fulfillment.purchases.length > 0)) return "PURCHASED";
  if (rows.some((fulfillment) => ["RESERVED", "PURCHASED", "CONFIRMED"].includes(fulfillment.status))) return "RESERVED";
  if (requirementStatus === "IN_PROGRESS" || rows.some((fulfillment) => fulfillment.status !== "CANCELLED")) return "IN_PROGRESS";
  return "PENDING";
}

function reservationState(fulfillments: FulfillmentPassenger[]) { return fulfillments.some((row) => row.operationalFulfillment.status === "RESERVED" || row.operationalFulfillment.reservationCode) ? "RESERVED" : "NONE"; }
function purchaseState(fulfillments: FulfillmentPassenger[]) { return fulfillments.some((row) => row.operationalFulfillment.purchases.length > 0) ? "PURCHASED" : "NONE"; }

function matchesFilters(assignment: Assignment, fulfillments: FulfillmentPassenger[], input: ListOperationalPassengerDashboardDto) {
  const source = sourceFacet(assignment.operationalRequirement.sourceType);
  return (!input.source || source === input.source) && (!input.status || executionState(assignment.operationalRequirement.status, fulfillments) === input.status);
}
function sourceFacet(sourceType: string) { return sourceType === "TRAVEL_PACKAGE_COST_COMPONENT" ? "BASE_TRIP" : sourceType === "ADDITIONAL_SERVICE_ORDER_LINE" ? "ADDITIONAL_SERVICES" : null; }
function sourceLabel(sourceType: string) { return sourceType === "TRAVEL_PACKAGE_COST_COMPONENT" ? "Contrato base" : sourceType === "ADDITIONAL_SERVICE_ORDER_LINE" ? "Servicio adicional" : "Origen operativo"; }
function uniqueContracts(rows: any[]) { const byId = new Map<string, any>(); for (const row of rows) if (!byId.has(row.contractId)) byId.set(row.contractId, { contractId: row.contractId, contractNumber: row.contract.contractNumber, status: row.contract.status }); return [...byId.values()].sort((left, right) => left.contractNumber.localeCompare(right.contractNumber) || left.contractId.localeCompare(right.contractId)); }
function uniqueGroups(rows: any[]) { const byId = new Map<string, any>(); for (const row of rows) if (!byId.has(row.passengerGroup.id)) byId.set(row.passengerGroup.id, row.passengerGroup); return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)); }
function group<T>(items: readonly T[], get: (item: T) => string) { const grouped = new Map<string, T[]>(); for (const item of items) grouped.set(get(item), [...(grouped.get(get(item)) ?? []), item]); return grouped; }
function key(requirementId: string, participantId: string) { return `${requirementId}\u0000${participantId}`; }
function numberValue(value: unknown) { return typeof value === "bigint" ? Number(value) : Number(value ?? 0); }
function normalizeSearch(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function parseFacet(value: unknown, allowed: readonly string[]) { const parsed = typeof value === "string" ? JSON.parse(value) : value; return Array.isArray(parsed) ? allowed.filter((item) => parsed.includes(item)) : []; }
