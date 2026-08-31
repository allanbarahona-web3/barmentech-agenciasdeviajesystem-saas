CREATE TABLE "payment_allocation_reversals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentAllocationId" TEXT NOT NULL,
    "reversalDeduplicationKey" VARCHAR(200) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "reversedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_allocation_reversals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_allocations_id_tenantId_key" ON "payment_allocations"("id", "tenantId");
CREATE UNIQUE INDEX "payment_allocation_reversals_tenantId_reversalDeduplicationKey_key" ON "payment_allocation_reversals"("tenantId", "reversalDeduplicationKey");
CREATE UNIQUE INDEX "payment_allocation_reversals_tenantId_paymentAllocationId_key" ON "payment_allocation_reversals"("tenantId", "paymentAllocationId");
CREATE INDEX "payment_allocation_reversals_tenantId_reversedAt_idx" ON "payment_allocation_reversals"("tenantId", "reversedAt");

ALTER TABLE "payment_allocation_reversals" ADD CONSTRAINT "payment_allocation_reversals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_allocation_reversals" ADD CONSTRAINT "payment_allocation_reversals_paymentAllocationId_tenantId_fkey" FOREIGN KEY ("paymentAllocationId", "tenantId") REFERENCES "payment_allocations"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
