-- COST-DB-01B: Cost Engine monetary history and generic applicability.
-- The application runtime role must not be a superuser and must not have BYPASSRLS.

ALTER TABLE "cost_components"
ADD COLUMN "currentSnapshotId" TEXT;

CREATE TABLE "cost_snapshots" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "costingProjectId" TEXT NOT NULL,
    "costComponentId" TEXT NOT NULL,
    "amount" DECIMAL(19,5) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedByUserId" TEXT NOT NULL,
    "capturedByName" TEXT NOT NULL,
    "sourceReference" TEXT,
    "sourceUrl" TEXT,
    "reason" TEXT,

    CONSTRAINT "cost_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cost_snapshots_sequence_positive_chk" CHECK ("sequence" > 0)
);

CREATE TABLE "cost_applicabilities" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "costComponentId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeKey" TEXT,
    "label" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_applicabilities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cost_components_id_tenant_project_key"
ON "cost_components"("id", "tenantId", "costingProjectId");

CREATE UNIQUE INDEX "cost_components_current_snapshot_tenant_key"
ON "cost_components"("currentSnapshotId", "tenantId", "id");

CREATE UNIQUE INDEX "cost_snapshots_id_tenant_key"
ON "cost_snapshots"("id", "tenantId");

CREATE UNIQUE INDEX "cost_snapshots_id_tenant_component_key"
ON "cost_snapshots"("id", "tenantId", "costComponentId");

CREATE UNIQUE INDEX "cost_snapshots_tenant_component_sequence_key"
ON "cost_snapshots"("tenantId", "costComponentId", "sequence");

CREATE INDEX "cost_snapshots_component_history_idx"
ON "cost_snapshots"("tenantId", "costComponentId", "capturedAt", "id");

CREATE INDEX "cost_snapshots_project_history_idx"
ON "cost_snapshots"("tenantId", "costingProjectId", "capturedAt", "id");

CREATE UNIQUE INDEX "cost_applicabilities_id_tenant_key"
ON "cost_applicabilities"("id", "tenantId");

CREATE INDEX "cost_applicabilities_tenant_component_idx"
ON "cost_applicabilities"("tenantId", "costComponentId");

ALTER TABLE "cost_snapshots"
ADD CONSTRAINT "cost_snapshots_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cost_snapshots"
ADD CONSTRAINT "cost_snapshots_project_tenant_fkey"
FOREIGN KEY ("costingProjectId", "tenantId") REFERENCES "costing_projects"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cost_snapshots"
ADD CONSTRAINT "cost_snapshots_component_project_tenant_fkey"
FOREIGN KEY ("costComponentId", "tenantId", "costingProjectId") REFERENCES "cost_components"("id", "tenantId", "costingProjectId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cost_applicabilities"
ADD CONSTRAINT "cost_applicabilities_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cost_applicabilities"
ADD CONSTRAINT "cost_applicabilities_component_tenant_fkey"
FOREIGN KEY ("costComponentId", "tenantId") REFERENCES "cost_components"("id", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cost_components"
ADD CONSTRAINT "cost_components_current_snapshot_tenant_fkey"
FOREIGN KEY ("currentSnapshotId", "tenantId", "id") REFERENCES "cost_snapshots"("id", "tenantId", "costComponentId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cost_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_snapshots" FORCE ROW LEVEL SECURITY;
ALTER TABLE "cost_applicabilities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_applicabilities" FORCE ROW LEVEL SECURITY;

CREATE POLICY cost_snapshots_tenant_select ON "cost_snapshots"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY cost_snapshots_tenant_insert ON "cost_snapshots"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY cost_applicabilities_tenant_select ON "cost_applicabilities"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY cost_applicabilities_tenant_insert ON "cost_applicabilities"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY cost_applicabilities_tenant_update ON "cost_applicabilities"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY cost_applicabilities_tenant_delete ON "cost_applicabilities"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
