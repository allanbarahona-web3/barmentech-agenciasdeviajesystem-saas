CREATE TYPE "PaymentStatus" AS ENUM ('RECEIVED', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED', 'CANCELLED');

CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "registrationDeduplicationKey" VARCHAR(200) NOT NULL,
    "customerId" TEXT,
    "payerDisplayName" TEXT NOT NULL,
    "payerIdentificationType" VARCHAR(4),
    "payerIdentificationNumber" VARCHAR(30),
    "currencyCode" VARCHAR(3) NOT NULL,
    "receivedAmount" DECIMAL(18,4) NOT NULL,
    "availableAmount" DECIMAL(18,4) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "paymentMethod" VARCHAR(50) NOT NULL,
    "externalReference" VARCHAR(150),
    "description" VARCHAR(500),
    "status" "PaymentStatus" NOT NULL DEFAULT 'RECEIVED',
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payments_received_amount_positive" CHECK ("receivedAmount" > 0),
    CONSTRAINT "payments_available_amount_nonnegative" CHECK ("availableAmount" >= 0),
    CONSTRAINT "payments_available_not_above_received" CHECK ("availableAmount" <= "receivedAmount")
);

CREATE UNIQUE INDEX "payments_tenantId_registrationDeduplicationKey_key" ON "payments"("tenantId", "registrationDeduplicationKey");
CREATE INDEX "payments_tenantId_status_receivedAt_idx" ON "payments"("tenantId", "status", "receivedAt");
CREATE INDEX "payments_tenantId_customerId_idx" ON "payments"("tenantId", "customerId");
CREATE INDEX "payments_tenantId_receivedAt_idx" ON "payments"("tenantId", "receivedAt");
CREATE INDEX "payments_tenantId_externalReference_idx" ON "payments"("tenantId", "externalReference");

ALTER TABLE "payments" ADD CONSTRAINT "payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
