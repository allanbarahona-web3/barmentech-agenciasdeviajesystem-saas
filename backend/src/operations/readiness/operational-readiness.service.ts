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
type AggregateRow = {
  totalAssignments: number; fulfilledAssignments: number; participantCountWithRequirements: number; completePassengerCount: number; totalRosterPassengerCount: number;
};
type ServiceRow = { servicePurposeCode: string; servicePurposeName: string; totalAssignments: number; fulfilledAssignments: number };
type RiskRow = { criticalAssignmentCount: number; criticalPending: number; criticalOverdue: number; criticalDueSoon: number; nonCriticalPending: number };
type InconsistencyRow = { inconsistentFulfilledRequirementCount: number };
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
      const [overallRows, serviceRows, riskRows, inconsistencyRows] = await Promise.all([
        aggregateOverall(tx, tenantId, travelPackageId),
        aggregateServices(tx, tenantId, travelPackageId),
        aggregateRisk(tx, tenantId, travelPackageId, now, dueSoonAt),
        aggregateInconsistencies(tx, tenantId, travelPackageId),
      ]);
      const overall = overallRows[0] ?? zeroOverall();
      const risk = riskRows[0] ?? zeroRisk();
      const totalAssignments = numberValue(overall.totalAssignments);
      const fulfilledAssignments = numberValue(overall.fulfilledAssignments);
      const pendingAssignments = totalAssignments - fulfilledAssignments;
      return {
        overall: {
          totalAssignments, fulfilledAssignments, pendingAssignments,
          progressPercent: percent(fulfilledAssignments, totalAssignments),
          completePassengerCount: numberValue(overall.completePassengerCount),
          participantCountWithRequirements: numberValue(overall.participantCountWithRequirements),
          totalRosterPassengerCount: numberValue(overall.totalRosterPassengerCount),
        },
        readinessState: readinessState(risk),
        critical: { pending: numberValue(risk.criticalPending), dueSoon: numberValue(risk.criticalDueSoon), overdue: numberValue(risk.criticalOverdue) },
        riskSummary: {
          criticalPending: numberValue(risk.criticalPending), criticalOverdue: numberValue(risk.criticalOverdue),
          criticalDueSoon: numberValue(risk.criticalDueSoon), nonCriticalPending: numberValue(risk.nonCriticalPending),
        },
        services: serviceRows.map((service) => {
          const total = numberValue(service.totalAssignments), fulfilled = numberValue(service.fulfilledAssignments);
          return { servicePurposeCode: service.servicePurposeCode, servicePurposeName: service.servicePurposeName, totalAssignments: total, fulfilledAssignments: fulfilled, pendingAssignments: total - fulfilled, progressPercent: percent(fulfilled, total) };
        }),
        inconsistency: { fulfilledRequirementWithoutCoverageCount: numberValue(inconsistencyRows[0]?.inconsistentFulfilledRequirementCount) },
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
      const assignmentsByParticipant = groupBy(assignments, (assignment) => assignment.travelPackageParticipantId);
      return {
        items: participants.map((participant) => matrixParticipant(participant, assignmentsByParticipant.get(participant.id) ?? [], serviceColumns, coverage, activeFulfillment)),
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

function aggregateOverall(tx: Tx, tenantId: string, travelPackageId: string) {
  return tx.$queryRaw<AggregateRow[]>`
    WITH assignments AS (
      SELECT rp."operationalRequirementId" AS "requirementId", rp."travelPackageParticipantId" AS "participantId"
      FROM "operational_requirement_passengers" rp
      JOIN "operational_requirements" r ON r.id = rp."operationalRequirementId" AND r."tenantId" = rp."tenantId" AND r."travelPackageId" = rp."travelPackageId"
      WHERE rp."tenantId" = ${tenantId} AND rp."travelPackageId" = ${travelPackageId} AND r.status NOT IN ('CANCELLED', 'NOT_APPLICABLE')
    ), coverage AS (
      SELECT DISTINCT a."requirementId", a."participantId"
      FROM assignments a
      JOIN "operational_fulfillments" f ON f."operationalRequirementId" = a."requirementId" AND f."tenantId" = ${tenantId} AND f."travelPackageId" = ${travelPackageId} AND f.status = 'CONFIRMED'
      JOIN "operational_fulfillment_passengers" fp ON fp."operationalFulfillmentId" = f.id AND fp."tenantId" = ${tenantId} AND fp."travelPackageId" = ${travelPackageId} AND fp."travelPackageParticipantId" = a."participantId"
    ), per_participant AS (
      SELECT a."participantId", COUNT(*)::int AS total, COUNT(c."requirementId")::int AS fulfilled
      FROM assignments a LEFT JOIN coverage c ON c."requirementId" = a."requirementId" AND c."participantId" = a."participantId"
      GROUP BY a."participantId"
    )
    SELECT COUNT(*)::int AS "totalAssignments", COUNT(c."requirementId")::int AS "fulfilledAssignments", COUNT(DISTINCT a."participantId")::int AS "participantCountWithRequirements",
      COALESCE((SELECT COUNT(*)::int FROM per_participant WHERE total > 0 AND total = fulfilled), 0)::int AS "completePassengerCount",
      (SELECT COUNT(*)::int FROM "travel_package_participants" p WHERE p."tenantId" = ${tenantId} AND p."travelPackageId" = ${travelPackageId}) AS "totalRosterPassengerCount"
    FROM assignments a LEFT JOIN coverage c ON c."requirementId" = a."requirementId" AND c."participantId" = a."participantId"
  `;
}

function aggregateServices(tx: Tx, tenantId: string, travelPackageId: string) {
  return tx.$queryRaw<ServiceRow[]>`
    WITH assignments AS (
      SELECT rp."operationalRequirementId" AS "requirementId", rp."travelPackageParticipantId" AS "participantId", r."servicePurposeCode", r."servicePurposeName"
      FROM "operational_requirement_passengers" rp JOIN "operational_requirements" r ON r.id = rp."operationalRequirementId" AND r."tenantId" = rp."tenantId" AND r."travelPackageId" = rp."travelPackageId"
      WHERE rp."tenantId" = ${tenantId} AND rp."travelPackageId" = ${travelPackageId} AND r.status NOT IN ('CANCELLED', 'NOT_APPLICABLE')
    ), coverage AS (
      SELECT DISTINCT a."requirementId", a."participantId" FROM assignments a
      JOIN "operational_fulfillments" f ON f."operationalRequirementId" = a."requirementId" AND f."tenantId" = ${tenantId} AND f."travelPackageId" = ${travelPackageId} AND f.status = 'CONFIRMED'
      JOIN "operational_fulfillment_passengers" fp ON fp."operationalFulfillmentId" = f.id AND fp."tenantId" = ${tenantId} AND fp."travelPackageId" = ${travelPackageId} AND fp."travelPackageParticipantId" = a."participantId"
    )
    SELECT a."servicePurposeCode", MIN(a."servicePurposeName") AS "servicePurposeName", COUNT(*)::int AS "totalAssignments", COUNT(c."requirementId")::int AS "fulfilledAssignments"
    FROM assignments a LEFT JOIN coverage c ON c."requirementId" = a."requirementId" AND c."participantId" = a."participantId"
    GROUP BY a."servicePurposeCode" ORDER BY MIN(a."servicePurposeName") ASC, a."servicePurposeCode" ASC
  `;
}

function aggregateRisk(tx: Tx, tenantId: string, travelPackageId: string, now: Date, dueSoonAt: Date) {
  return tx.$queryRaw<RiskRow[]>`
    WITH assignments AS (
      SELECT rp."operationalRequirementId" AS "requirementId", rp."travelPackageParticipantId" AS "participantId", r.critical, r."operationalDeadlineAt"
      FROM "operational_requirement_passengers" rp JOIN "operational_requirements" r ON r.id = rp."operationalRequirementId" AND r."tenantId" = rp."tenantId" AND r."travelPackageId" = rp."travelPackageId"
      WHERE rp."tenantId" = ${tenantId} AND rp."travelPackageId" = ${travelPackageId} AND r.status NOT IN ('CANCELLED', 'NOT_APPLICABLE')
    ), coverage AS (
      SELECT DISTINCT a."requirementId", a."participantId" FROM assignments a
      JOIN "operational_fulfillments" f ON f."operationalRequirementId" = a."requirementId" AND f."tenantId" = ${tenantId} AND f."travelPackageId" = ${travelPackageId} AND f.status = 'CONFIRMED'
      JOIN "operational_fulfillment_passengers" fp ON fp."operationalFulfillmentId" = f.id AND fp."tenantId" = ${tenantId} AND fp."travelPackageId" = ${travelPackageId} AND fp."travelPackageParticipantId" = a."participantId"
    )
    SELECT COUNT(*) FILTER (WHERE a.critical)::int AS "criticalAssignmentCount",
      COUNT(*) FILTER (WHERE a.critical AND c."requirementId" IS NULL)::int AS "criticalPending",
      COUNT(*) FILTER (WHERE a.critical AND c."requirementId" IS NULL AND a."operationalDeadlineAt" < ${now})::int AS "criticalOverdue",
      COUNT(*) FILTER (WHERE a.critical AND c."requirementId" IS NULL AND a."operationalDeadlineAt" <= ${dueSoonAt})::int AS "criticalDueSoon",
      COUNT(*) FILTER (WHERE NOT a.critical AND c."requirementId" IS NULL)::int AS "nonCriticalPending"
    FROM assignments a LEFT JOIN coverage c ON c."requirementId" = a."requirementId" AND c."participantId" = a."participantId"
  `;
}

function aggregateInconsistencies(tx: Tx, tenantId: string, travelPackageId: string) {
  return tx.$queryRaw<InconsistencyRow[]>`
    WITH assignments AS (
      SELECT rp."operationalRequirementId" AS "requirementId", rp."travelPackageParticipantId" AS "participantId", r.status
      FROM "operational_requirement_passengers" rp JOIN "operational_requirements" r ON r.id = rp."operationalRequirementId" AND r."tenantId" = rp."tenantId" AND r."travelPackageId" = rp."travelPackageId"
      WHERE rp."tenantId" = ${tenantId} AND rp."travelPackageId" = ${travelPackageId}
    ), coverage AS (
      SELECT DISTINCT a."requirementId", a."participantId" FROM assignments a
      JOIN "operational_fulfillments" f ON f."operationalRequirementId" = a."requirementId" AND f."tenantId" = ${tenantId} AND f."travelPackageId" = ${travelPackageId} AND f.status = 'CONFIRMED'
      JOIN "operational_fulfillment_passengers" fp ON fp."operationalFulfillmentId" = f.id AND fp."tenantId" = ${tenantId} AND fp."travelPackageId" = ${travelPackageId} AND fp."travelPackageParticipantId" = a."participantId"
    )
    SELECT COUNT(DISTINCT a."requirementId") FILTER (WHERE a.status = 'FULFILLED' AND c."requirementId" IS NULL)::int AS "inconsistentFulfilledRequirementCount"
    FROM assignments a LEFT JOIN coverage c ON c."requirementId" = a."requirementId" AND c."participantId" = a."participantId"
  `;
}

function serviceColumnsForPackage(tx: Tx, tenantId: string, travelPackageId: string) {
  return tx.$queryRaw<ServiceColumn[]>`
    SELECT "servicePurposeCode", MIN("servicePurposeName") AS "servicePurposeName"
    FROM "operational_requirements" WHERE "tenantId" = ${tenantId} AND "travelPackageId" = ${travelPackageId}
    GROUP BY "servicePurposeCode" ORDER BY MIN("servicePurposeName") ASC, "servicePurposeCode" ASC
  `;
}

function matrixParticipant(participant: Participant, assignments: Assignment[], columns: ServiceColumn[], coverage: Set<string>, activeFulfillment: Set<string>) {
  const applicable = assignments.filter((assignment) => isApplicable(assignment.operationalRequirement.status));
  const fulfilled = applicable.filter((assignment) => coverage.has(assignmentKey(assignment.operationalRequirementId, participant.id)));
  const assignmentsByServicePurpose = groupBy(assignments, (assignment) => assignment.operationalRequirement.servicePurposeCode);
  return {
    travelPackageParticipantId: participant.id, clientId: participant.clientId, fullName: participant.client.fullName, role: participant.role,
    progressPercent: applicable.length === 0 ? null : percent(fulfilled.length, applicable.length),
    isOperationallyComplete: applicable.length > 0 && fulfilled.length === applicable.length,
    requirementCount: applicable.length, fulfilledRequirementCount: fulfilled.length,
    serviceCells: columns.map((column) => cellFor(assignmentsByServicePurpose.get(column.servicePurposeCode) ?? [], participant.id, column.servicePurposeCode, coverage, activeFulfillment)),
  };
}

function cellFor(assignments: Assignment[], participantId: string, servicePurposeCode: string, coverage: Set<string>, activeFulfillment: Set<string>) {
  if (assignments.length === 0) return { servicePurposeCode, status: "NONE" };
  const applicable = assignments.filter((assignment) => isApplicable(assignment.operationalRequirement.status));
  if (applicable.length === 0) return { servicePurposeCode, status: assignments.every((assignment) => assignment.operationalRequirement.status === "NOT_APPLICABLE") ? "NOT_APPLICABLE" : "NONE" };
  const fulfilled = applicable.filter((assignment) => coverage.has(assignmentKey(assignment.operationalRequirementId, participantId)));
  if (fulfilled.length === applicable.length) return { servicePurposeCode, status: "FULFILLED" };
  const inProgress = applicable.some((assignment) => assignment.operationalRequirement.status === "IN_PROGRESS" || activeFulfillment.has(assignmentKey(assignment.operationalRequirementId, participantId)));
  return { servicePurposeCode, status: inProgress ? "IN_PROGRESS" : "PENDING" };
}

function isApplicable(status: string) { return status !== "CANCELLED" && status !== "NOT_APPLICABLE"; }
function assignmentKey(requirementId: string, participantId: string) { return `${requirementId}\u0000${participantId}`; }
function groupBy<T>(rows: T[], key: (row: T) => string) { const result = new Map<string, T[]>(); for (const row of rows) { const bucket = result.get(key(row)); if (bucket) bucket.push(row); else result.set(key(row), [row]); } return result; }
function positiveInteger(value: number | undefined, fallback: number) { return Number.isInteger(value) && value! > 0 ? value! : fallback; }
function matrixPageSize(value: number | undefined) { if (value === undefined) return 20; if (!Number.isInteger(value) || value < 1 || value > 25) throw new BadRequestException("OPERATIONAL_READINESS_PAGE_SIZE_INVALID"); return value; }
function percent(numerator: number, denominator: number) { return denominator === 0 ? null : Number(((numerator / denominator) * 100).toFixed(2)); }
function numberValue(value: unknown) { return typeof value === "number" ? value : Number(value ?? 0); }
function zeroOverall(): AggregateRow { return { totalAssignments: 0, fulfilledAssignments: 0, participantCountWithRequirements: 0, completePassengerCount: 0, totalRosterPassengerCount: 0 }; }
function zeroRisk(): RiskRow { return { criticalAssignmentCount: 0, criticalPending: 0, criticalOverdue: 0, criticalDueSoon: 0, nonCriticalPending: 0 }; }
function readinessState(risk: RiskRow) { if (numberValue(risk.criticalAssignmentCount) === 0) return "NO_CRITICAL_REQUIREMENTS"; if (numberValue(risk.criticalPending) === 0) return "READY"; return numberValue(risk.criticalDueSoon) > 0 ? "AT_RISK" : "NOT_READY"; }
