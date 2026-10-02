-- OPERATIONS-O2-UX5.1-DB: source idempotency and durable, source-neutral
-- intake events. This migration does not materialize or process any work.

CREATE TYPE "OperationsIntakeOutboxStatus" AS ENUM (
    'PENDING', 'PROCESSING', 'PROCESSED', 'FAILED'
);

CREATE TABLE "operations_intake_outbox_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "travelPackageId" TEXT NOT NULL,
    "eventType" VARCHAR(100) NOT NULL,
    "eventVersion" INTEGER NOT NULL DEFAULT 1,
    "sourceType" VARCHAR(80) NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceLineId" TEXT NOT NULL,
    "sourceVersionId" TEXT,
    "status" "OperationsIntakeOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maximumAttempts" INTEGER NOT NULL DEFAULT 5,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" VARCHAR(100),
    "processedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "lastError" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operations_intake_outbox_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operations_intake_outbox_event_type_nonempty_chk"
      CHECK (char_length(btrim("eventType")) > 0),
    CONSTRAINT "operations_intake_outbox_source_type_nonempty_chk"
      CHECK (char_length(btrim("sourceType")) > 0),
    CONSTRAINT "operations_intake_outbox_source_id_nonempty_chk"
      CHECK (char_length(btrim("sourceId")) > 0),
    CONSTRAINT "operations_intake_outbox_source_line_id_nonempty_chk"
      CHECK (char_length(btrim("sourceLineId")) > 0),
    CONSTRAINT "operations_intake_outbox_attempt_count_chk"
      CHECK ("attemptCount" >= 0),
    CONSTRAINT "operations_intake_outbox_maximum_attempts_chk"
      CHECK ("maximumAttempts" > 0)
);

-- A commercial line has exactly one logical approval notification. Source
-- version is metadata, not a new idempotency identity for this first source.
CREATE UNIQUE INDEX "operations_intake_outbox_source_event_key"
ON "operations_intake_outbox_events"(
    "tenantId", "eventType", "sourceType", "sourceId", "sourceLineId"
);

CREATE INDEX "operations_intake_outbox_tenant_status_available_idx"
ON "operations_intake_outbox_events"(
    "tenantId", "status", "availableAt", "createdAt"
);

CREATE INDEX "operations_intake_outbox_status_available_idx"
ON "operations_intake_outbox_events"(
    "status", "availableAt", "createdAt"
);

CREATE INDEX "operations_intake_outbox_source_lookup_idx"
ON "operations_intake_outbox_events"(
    "tenantId", "travelPackageId", "sourceType", "sourceId", "sourceLineId"
);

-- Source-derived requirements are idempotent at the database boundary. The
-- predicate leaves historical/manual/null-source rows entirely unaffected.
CREATE UNIQUE INDEX "operational_requirements_source_identity_unique_idx"
ON "operational_requirements"(
    "tenantId", "travelPackageId", "sourceType", "sourceId", "sourceLineId"
)
WHERE "sourceType" IS NOT NULL
  AND "sourceId" IS NOT NULL
  AND "sourceLineId" IS NOT NULL
  AND "sourceType" <> 'MANUAL';

ALTER TABLE "operations_intake_outbox_events"
ADD CONSTRAINT "operations_intake_outbox_events_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operations_intake_outbox_events"
ADD CONSTRAINT "operations_intake_outbox_events_travel_tenant_fkey"
FOREIGN KEY ("travelPackageId", "tenantId")
REFERENCES "TravelPackage"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operations_intake_outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "operations_intake_outbox_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY operations_intake_outbox_events_tenant_select
ON "operations_intake_outbox_events"
FOR SELECT
USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY operations_intake_outbox_events_tenant_insert
ON "operations_intake_outbox_events"
FOR INSERT
WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY operations_intake_outbox_events_tenant_update
ON "operations_intake_outbox_events"
FOR UPDATE
USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY operations_intake_outbox_events_tenant_delete
ON "operations_intake_outbox_events"
FOR DELETE
USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
