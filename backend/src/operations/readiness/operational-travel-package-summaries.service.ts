import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import { ListOperationalTravelPackageSummariesDto } from "./dto/list-operational-travel-package-summaries.dto";

const DUE_SOON_HOURS = 72;

type SummaryRow = {
  travelPackageId: string; packageCode: string; name: string; destination: string; departureDate: Date; returnDate: Date; status: string;
  passengerCount: number; totalAssignments: number; fulfilledAssignments: number; completePassengerCount: number;
  participantCountWithRequirements: number; criticalAssignmentCount: number; criticalPending: number; criticalDueSoon: number;
};
type Tx = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};
type Database = { $transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> };

@Injectable()
export class OperationalTravelPackageSummariesService {
  private readonly database: Database;
  constructor(prisma: PrismaService) { this.database = prisma as unknown as Database; }

  async list(tenantId: string, input: ListOperationalTravelPackageSummariesDto, now = new Date()) {
    const search = input.search?.trim() || null;
    const searchPattern = search ? `%${search}%` : null;
    const dueSoonAt = new Date(now.getTime() + DUE_SOON_HOURS * 60 * 60 * 1000);
    const offset = (input.page - 1) * input.pageSize;
    return this.withTransaction(tenantId, async (tx) => {
      const [totalRows, rows] = await Promise.all([
        tx.$queryRaw<Array<{ total: number }>>`
          SELECT COUNT(*)::integer AS "total" FROM "TravelPackage" travel_package
          WHERE travel_package."tenantId" = ${tenantId}
            AND travel_package."travelType" = CAST(${input.travelType} AS "TravelPackageType")
            AND (CAST(${searchPattern} AS TEXT) IS NULL OR travel_package."packageCode" ILIKE ${searchPattern} OR travel_package."name" ILIKE ${searchPattern})
        `,
        tx.$queryRaw<SummaryRow[]>`
          WITH selected_packages AS (
            SELECT travel_package."id", travel_package."packageCode", travel_package."name", travel_package."destination", travel_package."departureDate", travel_package."returnDate", travel_package."status"
            FROM "TravelPackage" travel_package
            WHERE travel_package."tenantId" = ${tenantId}
              AND travel_package."travelType" = CAST(${input.travelType} AS "TravelPackageType")
              AND (CAST(${searchPattern} AS TEXT) IS NULL OR travel_package."packageCode" ILIKE ${searchPattern} OR travel_package."name" ILIKE ${searchPattern})
            ORDER BY travel_package."departureDate" ASC, travel_package."id" ASC
            LIMIT ${input.pageSize} OFFSET ${offset}
          ), roster_counts AS (
            SELECT participant."travelPackageId", COUNT(*)::integer AS "passengerCount"
            FROM "travel_package_participants" participant INNER JOIN selected_packages selected ON selected."id" = participant."travelPackageId"
            WHERE participant."tenantId" = ${tenantId} GROUP BY participant."travelPackageId"
          ), assignments AS (
            SELECT requirement."travelPackageId", requirement.id AS "requirementId", passenger."travelPackageParticipantId" AS "participantId", requirement.critical, requirement."operationalDeadlineAt"
            FROM "operational_requirements" requirement
            INNER JOIN selected_packages selected ON selected."id" = requirement."travelPackageId"
            INNER JOIN "operational_requirement_passengers" passenger ON passenger."operationalRequirementId" = requirement.id AND passenger."tenantId" = requirement."tenantId" AND passenger."travelPackageId" = requirement."travelPackageId"
            WHERE requirement."tenantId" = ${tenantId} AND requirement.status NOT IN ('CANCELLED', 'NOT_APPLICABLE')
          ), coverage AS (
            SELECT DISTINCT assignment."travelPackageId", assignment."requirementId", assignment."participantId"
            FROM assignments assignment
            INNER JOIN "operational_fulfillments" fulfillment ON fulfillment."operationalRequirementId" = assignment."requirementId" AND fulfillment."tenantId" = ${tenantId} AND fulfillment."travelPackageId" = assignment."travelPackageId" AND fulfillment.status = 'CONFIRMED'
            INNER JOIN "operational_fulfillment_passengers" passenger ON passenger."operationalFulfillmentId" = fulfillment.id AND passenger."tenantId" = ${tenantId} AND passenger."travelPackageId" = assignment."travelPackageId" AND passenger."travelPackageParticipantId" = assignment."participantId"
          ), per_participant AS (
            SELECT assignment."travelPackageId", assignment."participantId", COUNT(*)::integer AS total, COUNT(coverage."requirementId")::integer AS fulfilled
            FROM assignments assignment LEFT JOIN coverage ON coverage."travelPackageId" = assignment."travelPackageId" AND coverage."requirementId" = assignment."requirementId" AND coverage."participantId" = assignment."participantId"
            GROUP BY assignment."travelPackageId", assignment."participantId"
          ), assignment_summary AS (
            SELECT assignment."travelPackageId", COUNT(*)::integer AS "totalAssignments", COUNT(coverage."requirementId")::integer AS "fulfilledAssignments", COUNT(DISTINCT assignment."participantId")::integer AS "participantCountWithRequirements",
              COUNT(*) FILTER (WHERE assignment.critical)::integer AS "criticalAssignmentCount",
              COUNT(*) FILTER (WHERE assignment.critical AND coverage."requirementId" IS NULL)::integer AS "criticalPending",
              COUNT(*) FILTER (WHERE assignment.critical AND coverage."requirementId" IS NULL AND assignment."operationalDeadlineAt" <= ${dueSoonAt})::integer AS "criticalDueSoon"
            FROM assignments assignment LEFT JOIN coverage ON coverage."travelPackageId" = assignment."travelPackageId" AND coverage."requirementId" = assignment."requirementId" AND coverage."participantId" = assignment."participantId"
            GROUP BY assignment."travelPackageId"
          ), complete_passengers AS (
            SELECT "travelPackageId", COUNT(*)::integer AS "completePassengerCount" FROM per_participant WHERE total > 0 AND total = fulfilled GROUP BY "travelPackageId"
          )
          SELECT selected."id" AS "travelPackageId", selected."packageCode", selected."name", selected."destination", selected."departureDate", selected."returnDate", selected."status",
            COALESCE(roster."passengerCount", 0)::integer AS "passengerCount", COALESCE(summary."totalAssignments", 0)::integer AS "totalAssignments", COALESCE(summary."fulfilledAssignments", 0)::integer AS "fulfilledAssignments",
            COALESCE(complete."completePassengerCount", 0)::integer AS "completePassengerCount", COALESCE(summary."participantCountWithRequirements", 0)::integer AS "participantCountWithRequirements",
            COALESCE(summary."criticalAssignmentCount", 0)::integer AS "criticalAssignmentCount", COALESCE(summary."criticalPending", 0)::integer AS "criticalPending", COALESCE(summary."criticalDueSoon", 0)::integer AS "criticalDueSoon"
          FROM selected_packages selected
          LEFT JOIN roster_counts roster ON roster."travelPackageId" = selected."id"
          LEFT JOIN assignment_summary summary ON summary."travelPackageId" = selected."id"
          LEFT JOIN complete_passengers complete ON complete."travelPackageId" = selected."id"
          ORDER BY selected."departureDate" ASC, selected."id" ASC
        `,
      ]);
      const total = Number(totalRows[0]?.total ?? 0);
      return { items: rows.map(toResponse), total, page: input.page, pageSize: input.pageSize, totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize) };
    });
  }

  private withTransaction<T>(tenantId: string, work: (tx: Tx) => Promise<T>) { return runTenantTransaction(this.database, tenantId, work); }
}

function toResponse(row: SummaryRow) {
  const totalAssignments = numberValue(row.totalAssignments);
  const fulfilledAssignments = numberValue(row.fulfilledAssignments);
  const criticalAssignmentCount = numberValue(row.criticalAssignmentCount);
  const criticalPending = numberValue(row.criticalPending);
  const criticalDueSoon = numberValue(row.criticalDueSoon);
  return {
    travelPackageId: row.travelPackageId, packageCode: row.packageCode, name: row.name, destination: row.destination, departureDate: row.departureDate, returnDate: row.returnDate, status: row.status, passengerCount: numberValue(row.passengerCount),
    operational: {
      progressPercent: totalAssignments === 0 ? null : Number(((fulfilledAssignments / totalAssignments) * 100).toFixed(2)),
      completePassengerCount: numberValue(row.completePassengerCount), participantCountWithRequirements: numberValue(row.participantCountWithRequirements),
      criticalPending, criticalDueSoon,
      readinessState: criticalAssignmentCount === 0 ? "NO_CRITICAL_REQUIREMENTS" : criticalPending === 0 ? "READY" : criticalDueSoon > 0 ? "AT_RISK" : "NOT_READY",
    },
  };
}
function numberValue(value: unknown) { return typeof value === "number" ? value : Number(value ?? 0); }
