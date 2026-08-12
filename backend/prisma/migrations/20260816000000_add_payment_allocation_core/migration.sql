CREATE TYPE "PaymentAllocationStatus" AS ENUM ('ACTIVE', 'REVERSED');

CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "accountReceivableId" TEXT NOT NULL,
    "allocationDeduplicationKey" VARCHAR(200) NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "status" "PaymentAllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "allocatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_allocations_amount_positive" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "payments_id_tenantId_key" ON "payments"("id", "tenantId");
CREATE UNIQUE INDEX "account_receivables_id_tenantId_key" ON "account_receivables"("id", "tenantId");
CREATE UNIQUE INDEX "payment_allocations_tenantId_allocationDeduplicationKey_key" ON "payment_allocations"("tenantId", "allocationDeduplicationKey");
CREATE INDEX "payment_allocations_tenantId_paymentId_status_idx" ON "payment_allocations"("tenantId", "paymentId", "status");
CREATE INDEX "payment_allocations_tenantId_accountReceivableId_status_idx" ON "payment_allocations"("tenantId", "accountReceivableId", "status");
CREATE INDEX "payment_allocations_tenantId_allocatedAt_idx" ON "payment_allocations"("tenantId", "allocatedAt");

ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_tenantId_fkey" FOREIGN KEY ("paymentId", "tenantId") REFERENCES "payments"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_accountReceivableId_tenantId_fkey" FOREIGN KEY ("accountReceivableId", "tenantId") REFERENCES "account_receivables"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
