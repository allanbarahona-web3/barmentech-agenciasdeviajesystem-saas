import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  FINANCE_ELIGIBILITY_READER,
  type CommercialSourceRef,
  type FinanceEligibilityReader,
} from "../../finance/eligibility-read/finance-eligibility-reader.port";
import { measureOperationsTimingStage } from "../../common/performance/operations-timing";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import { commercialSourceRefKey, requirementToCommercialSourceRef } from "../requirement-finance-source";
import { ListOperationalWorkItemsDto } from "./dto/list-operational-work-items.dto";

type Tx = any;
type Db = { $transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> };
type WorkItemPageRow = {
  id: string; travelPackageId: string; servicePurposeCode: string; servicePurposeName: string; description: string;
  status: string; critical: boolean; operationalDeadlineAt: Date | null; assignedToUserId: string | null; assignedToName: string | null;
  sourceType: string | null; sourceId: string | null; sourceLineId: string | null; sourceVersionId: string | null;
  sourcePassengerGroupId: string | null; sourcePassengerGroupName: string | null; soldValueScope: string; soldAmount: Prisma.Decimal | null;
  soldCurrency: string | null; createdAt: Date; updatedAt: Date; total: number | bigint; totalPassengers: number | bigint;
};
type WorkItemEnrichmentRow = {
  id: string; fulfilledPassengerCount: number | bigint; fulfillmentCount: number | bigint; confirmedFulfillmentCount: number | bigint;
  purchaseCount: number | bigint; evidenceCount: number | bigint; passengerPreview: unknown; coveredParticipantIds: unknown;
};

@Injectable()
export class OperationalWorkItemsService {
  private readonly db: Db;

  constructor(
    prisma: PrismaService,
    @Inject(FINANCE_ELIGIBILITY_READER) private readonly finance: FinanceEligibilityReader,
  ) {
    this.db = prisma as unknown as Db;
  }

  async list(tenantId: string, travelPackageId: string, input: ListOperationalWorkItemsDto) {
    const now = new Date();
    const dueSoon = new Date(now.getTime() + 72 * 60 * 60 * 1000);

    return runTenantTransaction(this.db, tenantId, async (tx) => {
      // Keep the established not-found contract, but perform it once in the shared Operations transaction.
      const trip = await tx.travelPackage.findFirst({ where: { id: travelPackageId, tenantId }, select: { id: true } });
      if (!trip) throw new NotFoundException("OPERATIONAL_WORK_ITEMS_TRAVEL_PACKAGE_NOT_FOUND");

      // One query owns both the filtered page and its total. All filters remain before OFFSET/LIMIT.
      const queryRows: WorkItemPageRow[] = await workItemPage(tx, tenantId, travelPackageId, input, now, dueSoon);
      const total = queryRows.length ? numberValue(queryRows[0].total) : 0;
      const rows = queryRows.filter((row): row is WorkItemPageRow & { id: string } => Boolean(row.id));
      const ids = rows.map((row) => row.id);
      // One bounded query provides every remaining Operations-owned count and preview for this page.
      const enrichmentRows: WorkItemEnrichmentRow[] = ids.length
        ? await workItemEnrichment(tx, tenantId, travelPackageId, ids)
        : [];
      const enrichmentByRequirementId = new Map<string, WorkItemEnrichmentRow>(
        enrichmentRows.map((row) => [row.id, row]),
      );

      const sourceByRequirementId = new Map<string, CommercialSourceRef>();
      for (const row of rows) {
        const source = requirementToCommercialSourceRef(row);
        if (source) sourceByRequirementId.set(row.id, source);
      }
      const uniqueSources = new Map<string, CommercialSourceRef>();
      for (const source of sourceByRequirementId.values()) uniqueSources.set(commercialSourceRefKey(source), source);
      // Finance stays behind its own tenant-safe read boundary and is called once for the deduplicated page sources.
      const eligibility = uniqueSources.size
        ? await measureOperationsTimingStage("work_items.finance_eligibility", () => safeEligibilityRead(this.finance, tenantId, [...uniqueSources.values()]))
        : [];
      const financeBySourceKey = new Map(eligibility.map((result: any) => [commercialSourceRefKey(result.source), result]));

      return {
        items: rows.map((row) => {
          const enrichment = enrichmentByRequirementId.get(row.id) ?? zeroEnrichment(row.id);
          const source = sourceByRequirementId.get(row.id);
          const finance = source ? financeBySourceKey.get(commercialSourceRefKey(source)) : null;
          return {
            id: row.id, travelPackageId: row.travelPackageId, servicePurposeCode: row.servicePurposeCode, servicePurposeName: row.servicePurposeName,
            description: row.description, status: row.status, critical: row.critical, operationalDeadlineAt: row.operationalDeadlineAt,
            assignedTo: row.assignedToUserId ? { userId: row.assignedToUserId, name: row.assignedToName } : null,
            passengers: { total: numberValue(row.totalPassengers), preview: passengerPreview(enrichment.passengerPreview) },
            sourceGroup: row.sourcePassengerGroupName ? { id: row.sourcePassengerGroupId, name: row.sourcePassengerGroupName } : null,
            coverage: { fulfilledPassengerCount: numberValue(enrichment.fulfilledPassengerCount), totalPassengerCount: numberValue(row.totalPassengers) },
            participantCoverageStatus: input.participantId ? (coveredParticipantIds(enrichment.coveredParticipantIds).includes(input.participantId) ? "FULFILLED" : "PENDING") : null,
            soldContext: { scope: row.soldValueScope, amount: row.soldAmount?.toFixed() ?? null, currency: row.soldCurrency },
            finance: financeState(finance),
            management: {
              fulfillmentCount: numberValue(enrichment.fulfillmentCount), confirmedFulfillmentCount: numberValue(enrichment.confirmedFulfillmentCount),
              purchaseCount: numberValue(enrichment.purchaseCount), evidenceCount: numberValue(enrichment.evidenceCount),
            },
            createdAt: row.createdAt, updatedAt: row.updatedAt,
          };
        }),
        total, page: input.page, pageSize: input.pageSize, totalPages: total ? Math.ceil(total / input.pageSize) : 0,
      };
    });
  }
}

function workItemPage(tx: Tx, tenantId: string, travelPackageId: string, input: ListOperationalWorkItemsDto, now: Date, dueSoon: Date) {
  const filters = workItemFilters(tenantId, travelPackageId, input, now, dueSoon);
  const effectiveFilters = effectiveStatusFilters(input);
  return tx.$queryRaw<WorkItemPageRow[]>`
    WITH requirement_coverage AS MATERIALIZED (
      SELECT rp."operationalRequirementId" AS id, COUNT(*)::int AS "totalPassengers",
        COUNT(DISTINCT fp."travelPackageParticipantId") FILTER (WHERE f.status = 'CONFIRMED')::int AS "fulfilledPassengerCount",
        COUNT(DISTINCT f.id)::int AS "fulfillmentCount"
      FROM "operational_requirement_passengers" rp
      LEFT JOIN "operational_fulfillments" f ON f."tenantId" = rp."tenantId" AND f."travelPackageId" = rp."travelPackageId" AND f."operationalRequirementId" = rp."operationalRequirementId"
      LEFT JOIN "operational_fulfillment_passengers" fp ON fp."operationalFulfillmentId" = f.id AND fp."tenantId" = f."tenantId" AND fp."travelPackageId" = f."travelPackageId" AND fp."travelPackageParticipantId" = rp."travelPackageParticipantId"
      WHERE rp."tenantId" = ${tenantId} AND rp."travelPackageId" = ${travelPackageId}
      GROUP BY rp."operationalRequirementId"
    ), effective AS MATERIALIZED (
      SELECT r.id, r."travelPackageId", r."servicePurposeCode", r."servicePurposeName", r.description,
        CASE WHEN r.status IN ('CANCELLED', 'NOT_APPLICABLE') THEN r.status::text
          WHEN COALESCE(coverage."totalPassengers", 0) > 0 AND COALESCE(coverage."fulfilledPassengerCount", 0) = coverage."totalPassengers" THEN 'FULFILLED'
          WHEN r.status = 'IN_PROGRESS' OR COALESCE(coverage."fulfillmentCount", 0) > 0 THEN 'IN_PROGRESS'
          ELSE 'PENDING' END AS status,
        r.critical, r."operationalDeadlineAt", r."assignedToUserId", r."assignedToName", r."sourceType", r."sourceId", r."sourceLineId",
        r."sourceVersionId", r."sourcePassengerGroupId", r."sourcePassengerGroupName", r."soldValueScope"::text AS "soldValueScope",
        r."soldAmount", r."soldCurrency", r."createdAt", r."updatedAt",
        COALESCE(coverage."totalPassengers", 0)::int AS "totalPassengers"
      FROM "operational_requirements" r
      LEFT JOIN requirement_coverage coverage ON coverage.id = r.id
      WHERE ${Prisma.join(filters, " AND ")}
    ), filtered AS MATERIALIZED (
      SELECT * FROM effective WHERE ${Prisma.join(effectiveFilters, " AND ")}
    ), page AS (
      SELECT * FROM filtered ORDER BY critical DESC, "operationalDeadlineAt" ASC, "createdAt" ASC, id ASC
      OFFSET ${(input.page - 1) * input.pageSize} LIMIT ${input.pageSize}
    )
    SELECT page.*, totals.total
    FROM (SELECT COUNT(*)::int AS total FROM filtered) totals
    LEFT JOIN page ON true
  `;
}

function workItemFilters(tenantId: string, travelPackageId: string, input: ListOperationalWorkItemsDto, now: Date, dueSoon: Date): Prisma.Sql[] {
  const filters = [Prisma.sql`r."tenantId" = ${tenantId}`, Prisma.sql`r."travelPackageId" = ${travelPackageId}`];
  if (input.servicePurposeCode) filters.push(Prisma.sql`r."servicePurposeCode" = ${input.servicePurposeCode}`);
  if (input.participantId) filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "operational_requirement_passengers" rp WHERE rp."tenantId" = ${tenantId} AND rp."travelPackageId" = ${travelPackageId} AND rp."operationalRequirementId" = r.id AND rp."travelPackageParticipantId" = ${input.participantId})`);
  if (input.passengerGroupId) filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "operational_requirement_passengers" rp JOIN "passenger_group_members" pgm ON pgm."tenantId" = rp."tenantId" AND pgm."travelPackageId" = rp."travelPackageId" AND pgm."travelPackageParticipantId" = rp."travelPackageParticipantId" JOIN "passenger_groups" pg ON pg.id = pgm."passengerGroupId" AND pg."tenantId" = pgm."tenantId" AND pg."travelPackageId" = pgm."travelPackageId" WHERE rp."tenantId" = ${tenantId} AND rp."travelPackageId" = ${travelPackageId} AND rp."operationalRequirementId" = r.id AND pgm."passengerGroupId" = ${input.passengerGroupId} AND pg.status = 'ACTIVE')`);
  if (input.assignedToUserId) filters.push(Prisma.sql`r."assignedToUserId" = ${input.assignedToUserId}`);
  if (input.unassigned === "true") filters.push(Prisma.sql`r."assignedToUserId" IS NULL`);
  if (input.critical !== undefined) filters.push(Prisma.sql`r.critical = ${input.critical === "true"}`);
  const search = input.search?.trim();
  if (search) {
    const pattern = `%${search}%`;
    filters.push(Prisma.sql`(r."servicePurposeName" ILIKE ${pattern} OR r.description ILIKE ${pattern})`);
  }
  if (input.deadlineState === "OVERDUE") filters.push(Prisma.sql`r."operationalDeadlineAt" < ${now}`);
  if (input.deadlineState === "DUE_SOON") filters.push(Prisma.sql`r."operationalDeadlineAt" >= ${now} AND r."operationalDeadlineAt" <= ${dueSoon}`);
  if (input.deadlineState === "FUTURE") filters.push(Prisma.sql`r."operationalDeadlineAt" > ${dueSoon}`);
  if (input.deadlineState === "NONE") filters.push(Prisma.sql`r."operationalDeadlineAt" IS NULL`);
  return filters;
}

function effectiveStatusFilters(input: ListOperationalWorkItemsDto): Prisma.Sql[] {
  if (input.active === "true") return [Prisma.sql`status IN ('PENDING', 'IN_PROGRESS')`];
  if (input.status) return [Prisma.sql`status = ${input.status}`];
  return [Prisma.sql`true`];
}

function workItemEnrichment(tx: Tx, tenantId: string, travelPackageId: string, ids: string[]) {
  return tx.$queryRaw<WorkItemEnrichmentRow[]>`
    SELECT r.id,
      (SELECT COUNT(DISTINCT fp."travelPackageParticipantId")::int FROM "operational_fulfillments" f JOIN "operational_fulfillment_passengers" fp ON fp."operationalFulfillmentId" = f.id AND fp."tenantId" = f."tenantId" AND fp."travelPackageId" = f."travelPackageId" WHERE f."tenantId" = ${tenantId} AND f."travelPackageId" = ${travelPackageId} AND f."operationalRequirementId" = r.id AND f.status = 'CONFIRMED') AS "fulfilledPassengerCount",
      (SELECT COUNT(*)::int FROM "operational_fulfillments" f WHERE f."tenantId" = ${tenantId} AND f."travelPackageId" = ${travelPackageId} AND f."operationalRequirementId" = r.id) AS "fulfillmentCount",
      (SELECT COUNT(*)::int FROM "operational_fulfillments" f WHERE f."tenantId" = ${tenantId} AND f."travelPackageId" = ${travelPackageId} AND f."operationalRequirementId" = r.id AND f.status = 'CONFIRMED') AS "confirmedFulfillmentCount",
      (SELECT COUNT(*)::int FROM "operational_purchases" p JOIN "operational_fulfillments" f ON f.id = p."operationalFulfillmentId" AND f."tenantId" = p."tenantId" AND f."travelPackageId" = p."travelPackageId" WHERE p."tenantId" = ${tenantId} AND p."travelPackageId" = ${travelPackageId} AND f."operationalRequirementId" = r.id) AS "purchaseCount",
      (SELECT COUNT(*)::int FROM "operational_evidence" e JOIN "operational_fulfillments" f ON f.id = e."operationalFulfillmentId" AND f."tenantId" = e."tenantId" AND f."travelPackageId" = e."travelPackageId" WHERE e."tenantId" = ${tenantId} AND e."travelPackageId" = ${travelPackageId} AND f."operationalRequirementId" = r.id) AS "evidenceCount",
      COALESCE((SELECT jsonb_agg(DISTINCT fp."travelPackageParticipantId") FROM "operational_fulfillments" f JOIN "operational_fulfillment_passengers" fp ON fp."operationalFulfillmentId" = f.id AND fp."tenantId" = f."tenantId" AND fp."travelPackageId" = f."travelPackageId" WHERE f."tenantId" = ${tenantId} AND f."travelPackageId" = ${travelPackageId} AND f."operationalRequirementId" = r.id AND f.status = 'CONFIRMED'), '[]'::jsonb) AS "coveredParticipantIds",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('travelPackageParticipantId', preview."travelPackageParticipantId", 'clientId', preview."clientId", 'fullName', preview."fullName", 'role', preview.role) ORDER BY preview."createdAt" ASC, preview.id ASC) FROM (SELECT rp."travelPackageParticipantId", p."clientId", c."fullName", p.role, rp."createdAt", rp.id FROM "operational_requirement_passengers" rp JOIN "travel_package_participants" p ON p.id = rp."travelPackageParticipantId" AND p."tenantId" = rp."tenantId" AND p."travelPackageId" = rp."travelPackageId" JOIN "Client" c ON c.id = p."clientId" AND c."tenantId" = p."tenantId" WHERE rp."tenantId" = ${tenantId} AND rp."travelPackageId" = ${travelPackageId} AND rp."operationalRequirementId" = r.id ORDER BY rp."createdAt" ASC, rp.id ASC LIMIT 2) preview), '[]'::jsonb) AS "passengerPreview"
    FROM "operational_requirements" r
    WHERE r."tenantId" = ${tenantId} AND r."travelPackageId" = ${travelPackageId} AND r.id IN (${Prisma.join(ids)})
    ORDER BY r.id ASC
  `;
}

function financeState(result: any) {
  if (!result) return { state: "UNAVAILABLE", reason: null };
  if (result.eligibility === "BLOCKED") return { state: "BLOCKED", reason: result.reason ?? null };
  if (result.eligibility === "ELIGIBLE") return { state: "ELIGIBLE", reason: result.reason ?? null };
  return { state: "UNAVAILABLE", reason: result.reason ?? null };
}
function zeroEnrichment(id: string): WorkItemEnrichmentRow { return { id, fulfilledPassengerCount: 0, fulfillmentCount: 0, confirmedFulfillmentCount: 0, purchaseCount: 0, evidenceCount: 0, passengerPreview: [], coveredParticipantIds: [] }; }
function numberValue(value: number | bigint | null | undefined): number { return typeof value === "bigint" ? Number(value) : Number(value ?? 0); }
function passengerPreview(value: unknown) { const parsed = typeof value === "string" ? JSON.parse(value) : value; return Array.isArray(parsed) ? parsed : []; }
function coveredParticipantIds(value: unknown): string[] { const parsed = typeof value === "string" ? JSON.parse(value) : value; return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []; }
async function safeEligibilityRead(reader: FinanceEligibilityReader, tenantId: string, sources: readonly CommercialSourceRef[]) { try { return await reader.readMany({ tenantId, sources }); } catch { return []; } }
