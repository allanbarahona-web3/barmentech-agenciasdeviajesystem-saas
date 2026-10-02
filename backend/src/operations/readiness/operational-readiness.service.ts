import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import { PassengerMatrixQueryDto } from "./dto/operational-readiness.dto";

const DUE_SOON_HOURS = 72;

type Tx = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  travelPackage: Record<string, (...args: any[]) => Promise<any>>;
  travelPackageParticipant: Record<string, (...args: any[]) => Promise<any>>;
  operationalRequirement: Record<string, (...args: any[]) => Promise<any>>;
  operationalRequirementPassenger: Record<string, (...args: any[]) => Promise<any>>;
  operationalFulfillmentPassenger: Record<string, (...args: any[]) => Promise<any>>;
};
type Database = { $transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> };
type ServiceRow = { servicePurposeCode: string; servicePurposeName: string; totalAssignments: number; fulfilledAssignments: number };
type RiskRow = { criticalAssignmentCount: number; criticalPending: number; criticalOverdue: number; criticalDueSoon: number; nonCriticalPending: number };
type ConsolidatedReadinessRow = { totalAssignments: number; fulfilledAssignments: number; participantCountWithRequirements: number; completePassengerCount: number; totalRosterPassengerCount: number; criticalAssignmentCount: number; criticalPending: number; criticalOverdue: number; criticalDueSoon: number; nonCriticalPending: number; inconsistentFulfilledRequirementCount: number; services: unknown };
type Participant = { id: string; clientId: string; role: string; createdAt: Date; client: { fullName: string } };
type Assignment = { travelPackageParticipantId: string; operationalRequirementId: string; operationalRequirement: { id: string; status: string; servicePurposeCode: string; servicePurposeName: string } };
type FulfillmentPassenger = { travelPackageParticipantId: string; operationalFulfillment: { operationalRequirementId: string; status: string } };
type ServiceColumn = { servicePurposeCode: string; servicePurposeName: string };

@Injectable()
export class OperationalReadinessService {
  private readonly database: Database;
  constructor(prisma: PrismaService) { this.database = prisma as unknown as Database; }

  async readiness(tenantId: string, travelPackageId: string, now = new Date()) {
    const dueSoonAt = new Date(now.getTime() + DUE_SOON_HOURS * 60 * 60 * 1000);
    return this.withTransaction(tenantId, async (tx) => {
      await this.requireTravelPackage(tx, tenantId, travelPackageId);
      const summary = (await aggregateReadiness(tx, tenantId, travelPackageId, now, dueSoonAt))[0] ?? zeroReadiness();
      const totalAssignments = numberValue(summary.totalAssignments);
      const fulfilledAssignments = numberValue(summary.fulfilledAssignments);
      const pendingAssignments = totalAssignments - fulfilledAssignments;
      return {
        overall: {
          totalAssignments, fulfilledAssignments, pendingAssignments,
          progressPercent: percent(fulfilledAssignments, totalAssignments),
          completePassengerCount: numberValue(summary.completePassengerCount),
          participantCountWithRequirements: numberValue(summary.participantCountWithRequirements),
          totalRosterPassengerCount: numberValue(summary.totalRosterPassengerCount),
        },
        readinessState: readinessState(summary),
        critical: { pending: numberValue(summary.criticalPending), dueSoon: numberValue(summary.criticalDueSoon), overdue: numberValue(summary.criticalOverdue) },
        riskSummary: {
          criticalPending: numberValue(summary.criticalPending), criticalOverdue: numberValue(summary.criticalOverdue),
          criticalDueSoon: numberValue(summary.criticalDueSoon), nonCriticalPending: numberValue(summary.nonCriticalPending),
        },
        services: serviceRows(summary.services).map((service) => {
          const total = numberValue(service.totalAssignments), fulfilled = numberValue(service.fulfilledAssignments);
          return { servicePurposeCode: service.servicePurposeCode, servicePurposeName: service.servicePurposeName, totalAssignments: total, fulfilledAssignments: fulfilled, pendingAssignments: total - fulfilled, progressPercent: percent(fulfilled, total) };
        }),
        inconsistency: { fulfilledRequirementWithoutCoverageCount: numberValue(summary.inconsistentFulfilledRequirementCount) },
      };
    });
  }

  async passengerMatrix(tenantId: string, travelPackageId: string, input: PassengerMatrixQueryDto) {
    const page = positiveInteger(input.page, 1);
    const pageSize = matrixPageSize(input.pageSize);
    return this.withTransaction(tenantId, async (tx) => {
      await this.requireTravelPackage(tx, tenantId, travelPackageId);
      const [participants, total, serviceColumns] = await Promise.all([
        tx.travelPackageParticipant.findMany({
          where: { tenantId, travelPackageId },
          select: { id: true, clientId: true, role: true, createdAt: true, client: { select: { fullName: true } } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize,
        }) as Promise<Participant[]>,
        tx.travelPackageParticipant.count({ where: { tenantId, travelPackageId } }) as Promise<number>,
        serviceColumnsForPackage(tx, tenantId, travelPackageId),
      ]);
      if (participants.length === 0) return { items: [], total, page, pageSize, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize), serviceColumns };

      const participantIds = participants.map((participant) => participant.id);
      const assignments = (await tx.operationalRequirementPassenger.findMany({
        where: { tenantId, travelPackageId, travelPackageParticipantId: { in: participantIds } },
        select: { travelPackageParticipantId: true, operationalRequirementId: true, operationalRequirement: { select: { id: true, status: true, servicePurposeCode: true, servicePurposeName: true } } },
      })) as Assignment[];
      const requirementIds = [...new Set(assignments.map((assignment) => assignment.operationalRequirementId))];
      const fulfillmentPassengers: FulfillmentPassenger[] = requirementIds.length === 0 ? [] : (await tx.operationalFulfillmentPassenger.findMany({
        where: { tenantId, travelPackageId, travelPackageParticipantId: { in: participantIds }, operationalFulfillment: { operationalRequirementId: { in: requirementIds }, status: { not: "CANCELLED" } } },
        select: { travelPackageParticipantId: true, operationalFulfillment: { select: { operationalRequirementId: true, status: true } } },
      })) as FulfillmentPassenger[];
      const coverage = new Set(fulfillmentPassengers.filter((row) => row.operationalFulfillment.status === "CONFIRMED").map((row) => assignmentKey(row.operationalFulfillment.operationalRequirementId, row.travelPackageParticipantId)));
      const activeFulfillment = new Set(fulfillmentPassengers.filter((row) => ["DRAFT", "RESERVED", "PURCHASED"].includes(row.operationalFulfillment.status)).map((row) => assignmentKey(row.operationalFulfillment.operationalRequirementId, row.travelPackageParticipantId)));
      const matrixByParticipant = matrixIndex(participantIds, assignments, coverage, activeFulfillment);
      return {
        items: participants.map((participant) => matrixParticipant(participant, matrixByParticipant.get(participant.id)!, serviceColumns)),
        total, page, pageSize, totalPages: Math.ceil(total / pageSize), serviceColumns,
      };
    });
  }

  private async requireTravelPackage(tx: Tx, tenantId: string, travelPackageId: string) {
    const travelPackage = await tx.travelPackage.findFirst({ where: { id: travelPackageId, tenantId }, select: { id: true } });
    if (!travelPackage) throw new NotFoundException("OPERATIONAL_READINESS_TRAVEL_PACKAGE_NOT_FOUND");
  }

  private withTransaction<T>(tenantId: string, work: (tx: Tx) => Promise<T>) { return runTenantTransaction(this.database, tenantId, work); }
}

function aggregateReadiness(tx: Tx, tenantId: string, travelPackageId: string, now: Date, dueSoonAt: Date) {
  return tx.$queryRaw<ConsolidatedReadinessRow[]>`
    WITH all_assignments AS MATERIALIZED (
      SELECT rp."operationalRequirementId" AS "requirementId", rp."travelPackageParticipantId" AS "participantId", r.status,
        r.critical, r."operationalDeadlineAt", r."servicePurposeCode", r."servicePurposeName"
      FROM "operational_requirement_passengers" rp
      JOIN "operational_requirements" r ON r.id = rp."operationalRequirementId" AND r."tenantId" = rp."tenantId" AND r."travelPackageId" = rp."travelPackageId"
      WHERE rp."tenantId" = ${tenantId} AND rp."travelPackageId" = ${travelPackageId}
    ), applicable_assignments AS MATERIALIZED (
      SELECT * FROM all_assignments WHERE status NOT IN ('CANCELLED', 'NOT_APPLICABLE')
    ), confirmed_coverage AS MATERIALIZED (
      SELECT DISTINCT a."requirementId", a."participantId"
      FROM applicable_assignments a
      JOIN "operational_fulfillments" f ON f."operationalRequirementId" = a."requirementId" AND f."tenantId" = ${tenantId} AND f."travelPackageId" = ${travelPackageId} AND f.status = 'CONFIRMED'
      JOIN "operational_fulfillment_passengers" fp ON fp."operationalFulfillmentId" = f.id AND fp."tenantId" = ${tenantId} AND fp."travelPackageId" = ${travelPackageId} AND fp."travelPackageParticipantId" = a."participantId"
    ), assignment_state AS MATERIALIZED (
      SELECT a.*, c."requirementId" IS NOT NULL AS covered
      FROM applicable_assignments a LEFT JOIN confirmed_coverage c ON c."requirementId" = a."requirementId" AND c."participantId" = a."participantId"
    ), participant_summary AS (
      SELECT "participantId", COUNT(*)::int AS total, COUNT(*) FILTER (WHERE covered)::int AS fulfilled
      FROM assignment_state GROUP BY "participantId"
    ), service_summary AS (
      SELECT "servicePurposeCode", MIN("servicePurposeName") AS "servicePurposeName", COUNT(*)::int AS "totalAssignments", COUNT(*) FILTER (WHERE covered)::int AS "fulfilledAssignments"
      FROM assignment_state GROUP BY "servicePurposeCode"
    )
    SELECT
      (SELECT COUNT(*)::int FROM assignment_state) AS "totalAssignments",
      (SELECT COUNT(*) FILTER (WHERE covered)::int FROM assignment_state) AS "fulfilledAssignments",
      (SELECT COUNT(DISTINCT "participantId")::int FROM assignment_state) AS "participantCountWithRequirements",
      (SELECT COUNT(*)::int FROM participant_summary WHERE total > 0 AND total = fulfilled) AS "completePassengerCount",
      (SELECT COUNT(*)::int FROM "travel_package_participants" p WHERE p."tenantId" = ${tenantId} AND p."travelPackageId" = ${travelPackageId}) AS "totalRosterPassengerCount",
      (SELECT COUNT(*) FILTER (WHERE critical)::int FROM assignment_state) AS "criticalAssignmentCount",
      (SELECT COUNT(*) FILTER (WHERE critical AND NOT covered)::int FROM assignment_state) AS "criticalPending",
      (SELECT COUNT(*) FILTER (WHERE critical AND NOT covered AND "operationalDeadlineAt" < ${now})::int FROM assignment_state) AS "criticalOverdue",
      (SELECT COUNT(*) FILTER (WHERE critical AND NOT covered AND "operationalDeadlineAt" <= ${dueSoonAt})::int FROM assignment_state) AS "criticalDueSoon",
      (SELECT COUNT(*) FILTER (WHERE NOT critical AND NOT covered)::int FROM assignment_state) AS "nonCriticalPending",
      (SELECT COUNT(DISTINCT a."requirementId") FILTER (WHERE a.status = 'FULFILLED' AND c."requirementId" IS NULL)::int FROM all_assignments a LEFT JOIN confirmed_coverage c ON c."requirementId" = a."requirementId" AND c."participantId" = a."participantId") AS "inconsistentFulfilledRequirementCount",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('servicePurposeCode', "servicePurposeCode", 'servicePurposeName', "servicePurposeName", 'totalAssignments', "totalAssignments", 'fulfilledAssignments', "fulfilledAssignments") ORDER BY "servicePurposeName" ASC, "servicePurposeCode" ASC) FROM service_summary), '[]'::jsonb) AS services
  `;
}

function serviceColumnsForPackage(tx: Tx, tenantId: string, travelPackageId: string) {
  return tx.$queryRaw<ServiceColumn[]>`
    SELECT "servicePurposeCode", MIN("servicePurposeName") AS "servicePurposeName"
    FROM "operational_requirements" WHERE "tenantId" = ${tenantId} AND "travelPackageId" = ${travelPackageId}
    GROUP BY "servicePurposeCode" ORDER BY MIN("servicePurposeName") ASC, "servicePurposeCode" ASC
  `;
}

type MatrixServiceState = { assignmentCount: number; applicableCount: number; fulfilledCount: number; onlyNotApplicable: boolean; inProgress: boolean };
type MatrixParticipantState = { applicableCount: number; fulfilledCount: number; services: Map<string, MatrixServiceState> };

function matrixIndex(participantIds: string[], assignments: Assignment[], coverage: Set<string>, activeFulfillment: Set<string>) {
  const result = new Map(participantIds.map((id) => [id, { applicableCount: 0, fulfilledCount: 0, services: new Map<string, MatrixServiceState>() }]));
  for (const assignment of assignments) {
    const participant = result.get(assignment.travelPackageParticipantId);
    if (!participant) continue;
    const servicePurposeCode = assignment.operationalRequirement.servicePurposeCode;
    const service = participant.services.get(servicePurposeCode) ?? { assignmentCount: 0, applicableCount: 0, fulfilledCount: 0, onlyNotApplicable: true, inProgress: false };
    service.assignmentCount += 1;
    const applicable = isApplicable(assignment.operationalRequirement.status);
    if (assignment.operationalRequirement.status !== "NOT_APPLICABLE") service.onlyNotApplicable = false;
    if (applicable) {
      participant.applicableCount += 1;
      service.applicableCount += 1;
      const assignmentCovered = coverage.has(assignmentKey(assignment.operationalRequirementId, assignment.travelPackageParticipantId));
      if (assignmentCovered) { participant.fulfilledCount += 1; service.fulfilledCount += 1; }
      if (assignment.operationalRequirement.status === "IN_PROGRESS" || activeFulfillment.has(assignmentKey(assignment.operationalRequirementId, assignment.travelPackageParticipantId))) service.inProgress = true;
    }
    participant.services.set(servicePurposeCode, service);
  }
  return result;
}

function matrixParticipant(participant: Participant, state: MatrixParticipantState, columns: ServiceColumn[]) {
  return {
    travelPackageParticipantId: participant.id, clientId: participant.clientId, fullName: participant.client.fullName, role: participant.role,
    progressPercent: state.applicableCount === 0 ? null : percent(state.fulfilledCount, state.applicableCount),
    isOperationallyComplete: state.applicableCount > 0 && state.fulfilledCount === state.applicableCount,
    requirementCount: state.applicableCount, fulfilledRequirementCount: state.fulfilledCount,
    serviceCells: columns.map((column) => cellFor(state.services.get(column.servicePurposeCode), column.servicePurposeCode)),
  };
}

function cellFor(state: MatrixServiceState | undefined, servicePurposeCode: string) {
  if (!state) return { servicePurposeCode, status: "NONE" };
  if (state.applicableCount === 0) return { servicePurposeCode, status: state.onlyNotApplicable ? "NOT_APPLICABLE" : "NONE" };
  if (state.fulfilledCount === state.applicableCount) return { servicePurposeCode, status: "FULFILLED" };
  return { servicePurposeCode, status: state.inProgress ? "IN_PROGRESS" : "PENDING" };
}

function isApplicable(status: string) { return status !== "CANCELLED" && status !== "NOT_APPLICABLE"; }
function assignmentKey(requirementId: string, participantId: string) { return `${requirementId}\u0000${participantId}`; }
function positiveInteger(value: number | undefined, fallback: number) { return Number.isInteger(value) && value! > 0 ? value! : fallback; }
function matrixPageSize(value: number | undefined) { if (value === undefined) return 20; if (!Number.isInteger(value) || value < 1 || value > 25) throw new BadRequestException("OPERATIONAL_READINESS_PAGE_SIZE_INVALID"); return value; }
function percent(numerator: number, denominator: number) { return denominator === 0 ? null : Number(((numerator / denominator) * 100).toFixed(2)); }
function numberValue(value: unknown) { return typeof value === "number" ? value : Number(value ?? 0); }
function serviceRows(value: unknown): ServiceRow[] { const parsed = typeof value === "string" ? JSON.parse(value) : value; return Array.isArray(parsed) ? parsed as ServiceRow[] : []; }
function zeroReadiness(): ConsolidatedReadinessRow { return { totalAssignments: 0, fulfilledAssignments: 0, participantCountWithRequirements: 0, completePassengerCount: 0, totalRosterPassengerCount: 0, criticalAssignmentCount: 0, criticalPending: 0, criticalOverdue: 0, criticalDueSoon: 0, nonCriticalPending: 0, inconsistentFulfilledRequirementCount: 0, services: [] }; }
function readinessState(risk: RiskRow) { if (numberValue(risk.criticalAssignmentCount) === 0) return "NO_CRITICAL_REQUIREMENTS"; if (numberValue(risk.criticalPending) === 0) return "READY"; return numberValue(risk.criticalDueSoon) > 0 ? "AT_RISK" : "NOT_READY"; }
