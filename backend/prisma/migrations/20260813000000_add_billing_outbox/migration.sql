CREATE TYPE "BillingOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

CREATE TABLE "billing_outbox_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventType" VARCHAR(150) NOT NULL,
    "eventVersion" INTEGER NOT NULL DEFAULT 1,
    "aggregateType" VARCHAR(100) NOT NULL,
    "aggregateId" VARCHAR(100) NOT NULL,
    "correlationId" VARCHAR(100),
    "causationId" VARCHAR(100),
    "deduplicationKey" VARCHAR(200),
    "payload" JSONB NOT NULL,
    "status" "BillingOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maximumAttempts" INTEGER NOT NULL DEFAULT 5,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" VARCHAR(100),
    "processedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "billing_outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_outbox_events_tenantId_deduplicationKey_key" ON "billing_outbox_events"("tenantId", "deduplicationKey");
CREATE INDEX "billing_outbox_events_tenantId_status_availableAt_idx" ON "billing_outbox_events"("tenantId", "status", "availableAt");
CREATE INDEX "billing_outbox_events_status_availableAt_idx" ON "billing_outbox_events"("status", "availableAt");
CREATE INDEX "billing_outbox_events_tenantId_aggregateType_aggregateId_idx" ON "billing_outbox_events"("tenantId", "aggregateType", "aggregateId");
CREATE INDEX "billing_outbox_events_tenantId_eventType_idx" ON "billing_outbox_events"("tenantId", "eventType");
CREATE INDEX "billing_outbox_events_tenantId_createdAt_idx" ON "billing_outbox_events"("tenantId", "createdAt");
CREATE INDEX "billing_outbox_events_lockedAt_idx" ON "billing_outbox_events"("lockedAt");

ALTER TABLE "billing_outbox_events" ADD CONSTRAINT "billing_outbox_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
