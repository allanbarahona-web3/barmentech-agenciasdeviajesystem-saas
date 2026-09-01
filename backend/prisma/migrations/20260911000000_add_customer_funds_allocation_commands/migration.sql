CREATE TYPE "CustomerFundsAllocationCommandStatus" AS ENUM ('PENDING', 'COMMITTED');

CREATE TABLE "customer_funds_allocation_commands" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "deduplicationKey" VARCHAR(200) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" "CustomerFundsAllocationCommandStatus" NOT NULL DEFAULT 'PENDING',
    "resultSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_funds_allocation_commands_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_funds_allocation_commands_requestHash_length" CHECK (char_length("requestHash") = 64),
    CONSTRAINT "customer_funds_allocation_commands_commit_state" CHECK (
        ("status" = 'PENDING' AND "resultSnapshot" IS NULL AND "committedAt" IS NULL)
        OR
        ("status" = 'COMMITTED' AND "resultSnapshot" IS NOT NULL AND "committedAt" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "customer_funds_allocation_commands_tenantId_deduplicationKey_key"
ON "customer_funds_allocation_commands"("tenantId", "deduplicationKey");

CREATE UNIQUE INDEX "customer_funds_allocation_commands_id_tenantId_key"
ON "customer_funds_allocation_commands"("id", "tenantId");

CREATE INDEX "customer_funds_allocation_commands_tenantId_customerId_currencyCode_createdAt_idx"
ON "customer_funds_allocation_commands"("tenantId", "customerId", "currencyCode", "createdAt");

ALTER TABLE "customer_funds_allocation_commands"
ADD CONSTRAINT "customer_funds_allocation_commands_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_funds_allocation_commands"
ADD CONSTRAINT "customer_funds_allocation_commands_customerId_tenantId_fkey"
FOREIGN KEY ("customerId", "tenantId") REFERENCES "Client"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
