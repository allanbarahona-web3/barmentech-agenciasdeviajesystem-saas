-- COST-DB-01C: Cost Engine evidence and structural audit foundation.
-- The application runtime role must not be a superuser and must not have BYPASSRLS.

CREATE TABLE "cost_evidence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "costSnapshotId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "contentHash" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedByUserId" TEXT NOT NULL,
    "uploadedByName" TEXT NOT NULL,

    CONSTRAINT "cost_evidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cost_audit_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "costingProjectId" TEXT NOT NULL,
    "costComponentId" TEXT,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cost_evidence_objectKey_key"
ON "cost_evidence"("objectKey");

CREATE UNIQUE INDEX "cost_evidence_id_tenant_key"
ON "cost_evidence"("id", "tenantId");

CREATE INDEX "cost_evidence_tenant_snapshot_idx"
ON "cost_evidence"("tenantId", "costSnapshotId");

CREATE UNIQUE INDEX "cost_audit_events_id_tenant_key"
ON "cost_audit_events"("id", "tenantId");

CREATE INDEX "cost_audit_events_project_history_idx"
ON "cost_audit_events"("tenantId", "costingProjectId", "createdAt", "id");

CREATE INDEX "cost_audit_events_component_history_idx"
ON "cost_audit_events"("tenantId", "costComponentId", "createdAt", "id");

ALTER TABLE "cost_evidence"
ADD CONSTRAINT "cost_evidence_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cost_evidence"
ADD CONSTRAINT "cost_evidence_snapshot_tenant_fkey"
FOREIGN KEY ("costSnapshotId", "tenantId") REFERENCES "cost_snapshots"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cost_audit_events"
ADD CONSTRAINT "cost_audit_events_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cost_audit_events"
ADD CONSTRAINT "cost_audit_events_project_tenant_fkey"
FOREIGN KEY ("costingProjectId", "tenantId") REFERENCES "costing_projects"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cost_audit_events"
ADD CONSTRAINT "cost_audit_events_component_project_tenant_fkey"
FOREIGN KEY ("costComponentId", "tenantId", "costingProjectId") REFERENCES "cost_components"("id", "tenantId", "costingProjectId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cost_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_evidence" FORCE ROW LEVEL SECURITY;
ALTER TABLE "cost_audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_audit_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY cost_evidence_tenant_select ON "cost_evidence"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY cost_evidence_tenant_insert ON "cost_evidence"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY cost_audit_events_tenant_select ON "cost_audit_events"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY cost_audit_events_tenant_insert ON "cost_audit_events"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
