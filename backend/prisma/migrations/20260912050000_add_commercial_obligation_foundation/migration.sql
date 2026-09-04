CREATE TYPE "CommercialObligationStatus" AS ENUM ('OPEN', 'PARTIALLY_SETTLED', 'SETTLED', 'CANCELLED');

CREATE TABLE "commercial_obligations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sourceType" VARCHAR(100) NOT NULL,
    "sourceId" VARCHAR(100) NOT NULL,
    "sourceReference" VARCHAR(100),
    "currencyCode" VARCHAR(3) NOT NULL,
    "originalAmount" DECIMAL(19,5) NOT NULL,
    "outstandingAmount" DECIMAL(19,5) NOT NULL,
    "dueDate" DATE,
    "status" "CommercialObligationStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "commercial_obligations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "commercial_obligations_original_amount_nonnegative" CHECK ("originalAmount" >= 0),
    CONSTRAINT "commercial_obligations_outstanding_amount_nonnegative" CHECK ("outstandingAmount" >= 0),
    CONSTRAINT "commercial_obligations_outstanding_not_above_original" CHECK ("outstandingAmount" <= "originalAmount")
);

CREATE TABLE "commercial_obligation_allocations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "commercialObligationId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "allocationDeduplicationKey" VARCHAR(200) NOT NULL,
    "amount" DECIMAL(19,5) NOT NULL,
    "status" "PaymentAllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "allocatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_obligation_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "commercial_obligation_allocations_amount_positive" CHECK ("amount" > 0)
);

CREATE TABLE "commercial_obligation_allocation_reversals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "commercialObligationAllocationId" TEXT NOT NULL,
    "reversalDeduplicationKey" VARCHAR(200) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "reversedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_obligation_allocation_reversals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commercial_obligations_tenantId_sourceType_sourceId_key"
ON "commercial_obligations"("tenantId", "sourceType", "sourceId");

CREATE UNIQUE INDEX "commercial_obligations_id_tenantId_key"
ON "commercial_obligations"("id", "tenantId");

CREATE INDEX "commercial_obligations_tenantId_customerId_status_idx"
ON "commercial_obligations"("tenantId", "customerId", "status");

CREATE INDEX "commercial_obligations_tenantId_customerId_currencyCode_idx"
ON "commercial_obligations"("tenantId", "customerId", "currencyCode");

CREATE INDEX "commercial_obligations_tenantId_status_dueDate_idx"
ON "commercial_obligations"("tenantId", "status", "dueDate");

CREATE UNIQUE INDEX "commercial_obligation_allocations_tenant_dedup_key"
ON "commercial_obligation_allocations"("tenantId", "allocationDeduplicationKey");

CREATE UNIQUE INDEX "commercial_obligation_allocations_id_tenantId_key"
ON "commercial_obligation_allocations"("id", "tenantId");

CREATE INDEX "commercial_obligation_allocations_tenant_obligation_idx"
ON "commercial_obligation_allocations"("tenantId", "commercialObligationId", "status");

CREATE INDEX "commercial_obligation_allocations_tenant_payment_idx"
ON "commercial_obligation_allocations"("tenantId", "paymentId", "status");

CREATE INDEX "commercial_obligation_allocations_tenant_allocated_idx"
ON "commercial_obligation_allocations"("tenantId", "allocatedAt");

CREATE UNIQUE INDEX "commercial_obligation_reversals_tenant_dedup_key"
ON "commercial_obligation_allocation_reversals"("tenantId", "reversalDeduplicationKey");

CREATE UNIQUE INDEX "commercial_obligation_reversals_tenant_allocation_key"
ON "commercial_obligation_allocation_reversals"("tenantId", "commercialObligationAllocationId");

CREATE UNIQUE INDEX "commercial_obligation_reversals_allocation_tenant_key"
ON "commercial_obligation_allocation_reversals"("commercialObligationAllocationId", "tenantId");

CREATE INDEX "commercial_obligation_reversals_tenant_reversed_idx"
ON "commercial_obligation_allocation_reversals"("tenantId", "reversedAt");

ALTER TABLE "commercial_obligations"
ADD CONSTRAINT "commercial_obligations_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "commercial_obligations"
ADD CONSTRAINT "commercial_obligations_customerId_tenantId_fkey"
FOREIGN KEY ("customerId", "tenantId") REFERENCES "Client"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "commercial_obligation_allocations"
ADD CONSTRAINT "commercial_obligation_allocations_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "commercial_obligation_allocations"
ADD CONSTRAINT "commercial_obligation_allocations_obligation_tenant_fkey"
FOREIGN KEY ("commercialObligationId", "tenantId") REFERENCES "commercial_obligations"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "commercial_obligation_allocations"
ADD CONSTRAINT "commercial_obligation_allocations_paymentId_tenantId_fkey"
FOREIGN KEY ("paymentId", "tenantId") REFERENCES "payments"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "commercial_obligation_allocation_reversals"
ADD CONSTRAINT "commercial_obligation_allocation_reversals_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "commercial_obligation_allocation_reversals"
ADD CONSTRAINT "commercial_obligation_allocation_reversals_allocation_fkey"
FOREIGN KEY ("commercialObligationAllocationId", "tenantId") REFERENCES "commercial_obligation_allocations"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;
