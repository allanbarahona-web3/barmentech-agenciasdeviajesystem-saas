import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { CostingProjectCurrentCostReader } from "../cost-engine/costing-project-current-cost-reader";
import { pricingAmountsEqual } from "../pricing/pricing-v1-calculator";
import { PricingService } from "../pricing/pricing.service";
import { PrismaService } from "../prisma/prisma.service";
import { TravelPricingService } from "../travel-pricing/travel-pricing.service";
import { runTenantTransaction } from "../tenant/tenant-transaction";

const SYSTEM_ACTOR = { userId: "SYSTEM", name: "Ajuste automático por tarifa aérea" };
const MAX_ATTEMPTS = 3;
const LEASE_MS = 5 * 60 * 1000;

type Request = {
  id: string; tenantId: string; costingProjectId: string; costComponentId: string;
  airfareDailyAuthorityId: string; airfareDailyAuthorityRevisionId: string; costSnapshotId: string;
  revisionKind: "AGENT_INITIAL" | "ADMIN_OVERRIDE"; authoritativeTotalAmount: string; currency: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"; attemptCount: number;
  leaseUntil: Date | null; claimToken: string | null; outcome: string | null; pricingCalculationVersionId: string | null;
};
type Tx = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  airfarePricingRepriceRequest: Record<string, (args: any) => Promise<any>>;
};
type Database = { $transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> };

@Injectable()
export class AirfarePricingRepriceProcessorService {
  private readonly database: Database;

  constructor(
    prisma: PrismaService,
    private readonly currentCosts: CostingProjectCurrentCostReader,
    private readonly pricing: PricingService,
    private readonly travelPricing: TravelPricingService,
  ) { this.database = prisma as unknown as Database; }

  async process(tenantId: string, requestId: string) {
    const claim = await this.claim(tenantId, requestId);
    if (claim.kind !== "CLAIMED") return claim;
    const request = claim.request;
    try {
      const currentCost = await this.readCurrentCost(tenantId, request.costingProjectId);
      if (!pricingAmountsEqual(String(request.authoritativeTotalAmount), currentCost.authoritativeTotalCost) || request.currency !== currentCost.baseCurrency) {
        return this.complete(request, "SUPERSEDED");
      }
      if (!(await this.isCurrentRevision(request))) return this.complete(request, "SUPERSEDED");

      const publication = await this.travelPricing.getPublicationContext(tenantId, request.costingProjectId);
      if (publication.commercialPriceStatus !== "PRICING_PUBLISHED" || !publication.latestPublication || publication.currentCommercialPrice === null) {
        return this.complete(request, "INELIGIBLE");
      }
      if (!pricingAmountsEqual(publication.currentCommercialPrice, publication.latestPublication.publishedPrice)) {
        return this.complete(request, "MANUAL_REVIEW_REQUIRED");
      }
      if (publication.currency !== request.currency || publication.baseCurrency !== request.currency) return this.complete(request, "INELIGIBLE");

      let versionId = request.pricingCalculationVersionId;
      if (!versionId) {
        const draft = await this.pricing.createAutomaticDraftIfHigher(
          tenantId, request.costingProjectId, String(request.authoritativeTotalAmount), publication.latestPublication.publishedPrice, SYSTEM_ACTOR,
        );
        if (!draft) return this.complete(request, "NO_INCREASE");
        versionId = draft.id;
        await this.attachVersion(request, versionId);
      }
      const version = await this.pricing.getCalculation(tenantId, versionId);
      if (version.status === "DRAFT") await this.pricing.approveCalculation(tenantId, versionId, SYSTEM_ACTOR);
      const published = await this.travelPricing.publish(tenantId, versionId, SYSTEM_ACTOR, true);
      return this.complete(request, "PUBLISHED", versionId, published.publication.id);
    } catch (error) {
      if (message(error) === "AIRFARE_REPRICE_REQUEST_SUPERSEDED") return this.complete(request, "SUPERSEDED");
      if (isIneligible(error)) return this.complete(request, "INELIGIBLE");
      if (isDomainError(error)) return this.complete(request, "MANUAL_REVIEW_REQUIRED", request.pricingCalculationVersionId);
      return this.fail(request, error);
    }
  }

  private async claim(tenantId: string, requestId: string): Promise<any> {
    return this.withTransaction(tenantId, async (tx) => {
      const rows = await tx.$queryRaw<Request[]>`
        SELECT * FROM "airfare_pricing_reprice_requests"
        WHERE "id" = ${requestId} AND "tenantId" = ${tenantId} FOR UPDATE
      `;
      const request = rows[0];
      if (!request) throw new NotFoundException("AIRFARE repricing request not found.");
      if (request.status === "COMPLETED" || request.status === "FAILED") return { kind: "TERMINAL", status: request.status, outcome: request.outcome };
      if (request.status === "PROCESSING" && request.leaseUntil && request.leaseUntil > new Date()) return { kind: "IN_PROGRESS" };
      if (request.attemptCount >= MAX_ATTEMPTS) {
        await tx.airfarePricingRepriceRequest.updateMany({ where: { id: request.id, tenantId }, data: { status: "FAILED", outcome: "MANUAL_REVIEW_REQUIRED", completedAt: new Date(), failureCode: "RETRY_EXHAUSTED" } });
        return { kind: "TERMINAL", status: "FAILED", outcome: "MANUAL_REVIEW_REQUIRED" };
      }
      const claimToken = randomUUID(); const now = new Date();
      await tx.airfarePricingRepriceRequest.updateMany({ where: { id: request.id, tenantId }, data: { status: "PROCESSING", attemptCount: request.attemptCount + 1, claimedAt: now, leaseUntil: new Date(now.getTime() + LEASE_MS), claimToken } });
      return { kind: "CLAIMED", request: { ...request, attemptCount: request.attemptCount + 1, claimToken } };
    });
  }

  private isCurrentRevision(request: Request) {
    return this.withTransaction(request.tenantId, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ currentRevisionId: string | null }>>`
        SELECT "currentRevisionId" FROM "airfare_daily_authorities"
        WHERE "id" = ${request.airfareDailyAuthorityId} AND "tenantId" = ${request.tenantId}
          AND "costingProjectId" = ${request.costingProjectId} AND "costComponentId" = ${request.costComponentId}
      `;
      return rows[0]?.currentRevisionId === request.airfareDailyAuthorityRevisionId;
    });
  }

  private readCurrentCost(tenantId: string, costingProjectId: string) {
    return this.withTransaction(tenantId, (tx) => this.currentCosts.read(tx, tenantId, costingProjectId));
  }

  private attachVersion(request: Request, pricingCalculationVersionId: string) {
    return this.updateOwned(request, { pricingCalculationVersionId });
  }

  private complete(request: Request, outcome: string, pricingCalculationVersionId?: string, _publicationId?: string) {
    return this.updateOwned(request, { status: "COMPLETED", outcome, completedAt: new Date(), leaseUntil: null, claimToken: null, ...(pricingCalculationVersionId ? { pricingCalculationVersionId } : {}) })
      .then(() => ({ kind: "COMPLETED", outcome }));
  }

  private async fail(request: Request, error: unknown) {
    const retry = request.attemptCount < MAX_ATTEMPTS;
    const data = retry
      ? { status: "PENDING", availableAt: new Date(Date.now() + 1000 * request.attemptCount), leaseUntil: null, claimToken: null, failureCode: errorCode(error), failureMessage: message(error) }
      : { status: "FAILED", outcome: "MANUAL_REVIEW_REQUIRED", completedAt: new Date(), leaseUntil: null, claimToken: null, failureCode: errorCode(error), failureMessage: message(error) };
    await this.updateOwned(request, data);
    return { kind: retry ? "RETRY_SCHEDULED" : "FAILED" };
  }

  private updateOwned(request: Request, data: Record<string, unknown>) {
    return this.withTransaction(request.tenantId, async (tx) => {
      const updated = await tx.airfarePricingRepriceRequest.updateMany({ where: { id: request.id, tenantId: request.tenantId, status: "PROCESSING", claimToken: request.claimToken }, data });
      if (updated.count !== 1) throw new ConflictException("AIRFARE_REPRICE_REQUEST_CLAIM_LOST");
    });
  }

  private withTransaction<T>(tenantId: string, work: (tx: Tx) => Promise<T>) { return runTenantTransaction(this.database, tenantId, work); }
}

function message(error: unknown) { return error instanceof Error ? error.message.slice(0, 500) : "AIRFARE_REPRICE_PROCESSING_FAILED"; }
function errorCode(error: unknown) { return typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code).slice(0, 100) : "AIRFARE_REPRICE_PROCESSING_FAILED"; }
function isDomainError(error: unknown) { return error instanceof ConflictException || error instanceof BadRequestException || error instanceof NotFoundException; }
function isIneligible(error: unknown) { return /Pricing configuration not found|Pricing configuration is archived/i.test(message(error)); }
