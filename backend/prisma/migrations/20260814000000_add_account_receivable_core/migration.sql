CREATE TYPE "AccountReceivableStatus" AS ENUM ('OPEN', 'PARTIALLY_SETTLED', 'SETTLED', 'CANCELLED');

CREATE TABLE "account_receivables" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceType" VARCHAR(100) NOT NULL,
    "sourceId" VARCHAR(100) NOT NULL,
    "sourceNumber" VARCHAR(100),
    "sourceDocumentType" VARCHAR(50),
    "customerId" TEXT,
    "debtorDisplayName" TEXT NOT NULL,
    "debtorIdentificationType" VARCHAR(4),
    "debtorIdentificationNumber" VARCHAR(30),
    "currencyCode" VARCHAR(3) NOT NULL,
    "originalAmount" DECIMAL(18,4) NOT NULL,
    "outstandingAmount" DECIMAL(18,4) NOT NULL,
    "dueDate" DATE NOT NULL,
    "paymentTermDays" INTEGER,
    "status" "AccountReceivableStatus" NOT NULL DEFAULT 'OPEN',
    "recognizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "account_receivables_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "account_receivables_original_amount_nonnegative" CHECK ("originalAmount" >= 0),
    CONSTRAINT "account_receivables_outstanding_amount_nonnegative" CHECK ("outstandingAmount" >= 0),
    CONSTRAINT "account_receivables_outstanding_not_above_original" CHECK ("outstandingAmount" <= "originalAmount")
);

CREATE UNIQUE INDEX "account_receivables_tenantId_sourceType_sourceId_key" ON "account_receivables"("tenantId", "sourceType", "sourceId");
CREATE INDEX "account_receivables_tenantId_status_dueDate_idx" ON "account_receivables"("tenantId", "status", "dueDate");
CREATE INDEX "account_receivables_tenantId_customerId_idx" ON "account_receivables"("tenantId", "customerId");
CREATE INDEX "account_receivables_tenantId_dueDate_idx" ON "account_receivables"("tenantId", "dueDate");
CREATE INDEX "account_receivables_tenantId_recognizedAt_idx" ON "account_receivables"("tenantId", "recognizedAt");
CREATE INDEX "account_receivables_tenantId_sourceNumber_idx" ON "account_receivables"("tenantId", "sourceNumber");

ALTER TABLE "account_receivables" ADD CONSTRAINT "account_receivables_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
