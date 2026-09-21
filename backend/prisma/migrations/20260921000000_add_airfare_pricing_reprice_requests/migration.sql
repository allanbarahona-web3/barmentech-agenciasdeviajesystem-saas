-- AIRFARE-PRICING-AUTO-01A: durable, tenant-safe handoff for later AIRFARE repricing.

CREATE TYPE "AirfarePricingRepriceRequestStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "airfare_pricing_reprice_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "costingProjectId" TEXT NOT NULL,
    "costComponentId" TEXT NOT NULL,
    "airfareDailyAuthorityId" TEXT NOT NULL,
    "airfareDailyAuthorityRevisionId" TEXT NOT NULL,
    "costSnapshotId" TEXT NOT NULL,
    "revisionKind" "AirfareDailyAuthorityRevisionKind" NOT NULL,
    "sourceActorUserId" TEXT NOT NULL,
    "sourceActorName" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authoritativeTotalAmount" DECIMAL(19,5) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "AirfarePricingRepriceRequestStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3),
    "claimToken" VARCHAR(100),
    "completedAt" TIMESTAMP(3),
    "failureCode" VARCHAR(100),
    "failureMessage" TEXT,
    "outcome" VARCHAR(50),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "airfare_pricing_reprice_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "airfare_pricing_reprice_requests_id_tenant_key"
ON "airfare_pricing_reprice_requests"("id", "tenantId");

CREATE UNIQUE INDEX "airfare_pricing_reprice_requests_tenant_revision_key"
ON "airfare_pricing_reprice_requests"("tenantId", "airfareDailyAuthorityRevisionId");

CREATE INDEX "airfare_pricing_reprice_requests_tenant_pending_idx"
ON "airfare_pricing_reprice_requests"("tenantId", "status", "availableAt", "id");

CREATE INDEX "airfare_pricing_reprice_requests_project_history_idx"
ON "airfare_pricing_reprice_requests"("tenantId", "costingProjectId", "triggeredAt" DESC, "id" DESC);

ALTER TABLE "airfare_pricing_reprice_requests"
ADD CONSTRAINT "airfare_pricing_reprice_requests_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "airfare_pricing_reprice_requests"
ADD CONSTRAINT "airfare_pricing_reprice_requests_project_tenant_fkey"
FOREIGN KEY ("costingProjectId", "tenantId") REFERENCES "costing_projects"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "airfare_pricing_reprice_requests"
ADD CONSTRAINT "airfare_pricing_reprice_requests_component_project_tenant_fkey"
FOREIGN KEY ("costComponentId", "tenantId", "costingProjectId") REFERENCES "cost_components"("id", "tenantId", "costingProjectId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "airfare_pricing_reprice_requests"
ADD CONSTRAINT "airfare_pricing_reprice_requests_authority_tenant_fkey"
FOREIGN KEY ("airfareDailyAuthorityId", "tenantId", "costingProjectId", "costComponentId") REFERENCES "airfare_daily_authorities"("id", "tenantId", "costingProjectId", "costComponentId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "airfare_pricing_reprice_requests"
ADD CONSTRAINT "airfare_pricing_reprice_requests_revision_authority_tenant_fkey"
FOREIGN KEY ("airfareDailyAuthorityRevisionId", "tenantId", "airfareDailyAuthorityId") REFERENCES "airfare_daily_authority_revisions"("id", "tenantId", "airfareDailyAuthorityId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "airfare_pricing_reprice_requests"
ADD CONSTRAINT "airfare_pricing_reprice_requests_snapshot_tenant_fkey"
FOREIGN KEY ("costSnapshotId", "tenantId", "costComponentId", "costingProjectId") REFERENCES "cost_snapshots"("id", "tenantId", "costComponentId", "costingProjectId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "airfare_pricing_reprice_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "airfare_pricing_reprice_requests" FORCE ROW LEVEL SECURITY;

CREATE POLICY airfare_pricing_reprice_requests_tenant_select ON "airfare_pricing_reprice_requests"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY airfare_pricing_reprice_requests_tenant_insert ON "airfare_pricing_reprice_requests"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY airfare_pricing_reprice_requests_tenant_update ON "airfare_pricing_reprice_requests"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY airfare_pricing_reprice_requests_tenant_delete ON "airfare_pricing_reprice_requests"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
