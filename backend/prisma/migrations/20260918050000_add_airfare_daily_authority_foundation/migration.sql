-- COST-AIR-DB-01: Travel-adapter daily AIRFARE authority anchors and immutable revisions.
-- The application runtime role must not be a superuser and must not have BYPASSRLS.

CREATE TYPE "AirfareDailyAuthorityRevisionKind" AS ENUM ('AGENT_INITIAL', 'ADMIN_OVERRIDE');

CREATE TABLE "airfare_daily_authorities" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "costingProjectId" TEXT NOT NULL,
    "costComponentId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "currentRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "airfare_daily_authorities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "airfare_daily_authority_revisions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "airfareDailyAuthorityId" TEXT NOT NULL,
    "costingProjectId" TEXT NOT NULL,
    "costComponentId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "kind" "AirfareDailyAuthorityRevisionKind" NOT NULL,
    "observedAmount" DECIMAL(19,5) NOT NULL,
    "appliedSnapshotId" TEXT NOT NULL,
    "sourceReference" TEXT,
    "sourceUrl" TEXT,
    "overrideReason" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "airfare_daily_authority_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "airfare_daily_authorities_id_tenant_key"
ON "airfare_daily_authorities"("id", "tenantId");

CREATE UNIQUE INDEX "airfare_daily_authorities_id_tenant_project_component_key"
ON "airfare_daily_authorities"("id", "tenantId", "costingProjectId", "costComponentId");

CREATE UNIQUE INDEX "airfare_daily_authorities_current_revision_tenant_key"
ON "airfare_daily_authorities"("currentRevisionId", "tenantId", "id");

CREATE UNIQUE INDEX "airfare_daily_authorities_tenant_component_business_date_key"
ON "airfare_daily_authorities"("tenantId", "costComponentId", "businessDate");

CREATE INDEX "airfare_daily_authorities_component_history_idx"
ON "airfare_daily_authorities"("tenantId", "costComponentId", "businessDate" DESC, "createdAt" DESC, "id" DESC);

CREATE INDEX "airfare_daily_authorities_project_history_idx"
ON "airfare_daily_authorities"("tenantId", "costingProjectId", "businessDate" DESC, "createdAt" DESC, "id" DESC);

CREATE UNIQUE INDEX "airfare_daily_authority_revisions_id_tenant_key"
ON "airfare_daily_authority_revisions"("id", "tenantId");

CREATE UNIQUE INDEX "airfare_daily_authority_revisions_id_tenant_authority_key"
ON "airfare_daily_authority_revisions"("id", "tenantId", "airfareDailyAuthorityId");

CREATE UNIQUE INDEX "airfare_daily_authority_revisions_tenant_authority_revision_key"
ON "airfare_daily_authority_revisions"("tenantId", "airfareDailyAuthorityId", "revisionNumber");

CREATE INDEX "airfare_daily_authority_revisions_history_idx"
ON "airfare_daily_authority_revisions"("tenantId", "airfareDailyAuthorityId", "revisionNumber" DESC, "id" DESC);

CREATE UNIQUE INDEX "cost_snapshots_id_tenant_component_project_key"
ON "cost_snapshots"("id", "tenantId", "costComponentId", "costingProjectId");

ALTER TABLE "airfare_daily_authorities"
ADD CONSTRAINT "airfare_daily_authorities_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "airfare_daily_authorities"
ADD CONSTRAINT "airfare_daily_authorities_project_tenant_fkey"
FOREIGN KEY ("costingProjectId", "tenantId") REFERENCES "costing_projects"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "airfare_daily_authorities"
ADD CONSTRAINT "airfare_daily_authorities_component_project_tenant_fkey"
FOREIGN KEY ("costComponentId", "tenantId", "costingProjectId") REFERENCES "cost_components"("id", "tenantId", "costingProjectId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "airfare_daily_authority_revisions"
ADD CONSTRAINT "airfare_daily_authority_revisions_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "airfare_daily_authority_revisions"
ADD CONSTRAINT "airfare_daily_authority_revisions_authority_tenant_fkey"
FOREIGN KEY ("airfareDailyAuthorityId", "tenantId", "costingProjectId", "costComponentId") REFERENCES "airfare_daily_authorities"("id", "tenantId", "costingProjectId", "costComponentId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "airfare_daily_authority_revisions"
ADD CONSTRAINT "airfare_daily_authority_revisions_snapshot_tenant_fkey"
FOREIGN KEY ("appliedSnapshotId", "tenantId", "costComponentId", "costingProjectId") REFERENCES "cost_snapshots"("id", "tenantId", "costComponentId", "costingProjectId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "airfare_daily_authorities"
ADD CONSTRAINT "airfare_daily_authorities_current_revision_tenant_fkey"
FOREIGN KEY ("currentRevisionId", "tenantId", "id") REFERENCES "airfare_daily_authority_revisions"("id", "tenantId", "airfareDailyAuthorityId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "airfare_daily_authorities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "airfare_daily_authorities" FORCE ROW LEVEL SECURITY;
ALTER TABLE "airfare_daily_authority_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "airfare_daily_authority_revisions" FORCE ROW LEVEL SECURITY;

CREATE POLICY airfare_daily_authorities_tenant_select ON "airfare_daily_authorities"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY airfare_daily_authorities_tenant_insert ON "airfare_daily_authorities"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY airfare_daily_authorities_tenant_update ON "airfare_daily_authorities"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY airfare_daily_authority_revisions_tenant_select ON "airfare_daily_authority_revisions"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY airfare_daily_authority_revisions_tenant_insert ON "airfare_daily_authority_revisions"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
