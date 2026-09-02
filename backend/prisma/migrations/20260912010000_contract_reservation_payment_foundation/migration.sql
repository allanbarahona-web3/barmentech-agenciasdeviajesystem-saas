ALTER TABLE "payments"
ADD COLUMN "purpose" "PaymentPurpose" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN "contractId" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedByUserId" TEXT,
ADD COLUMN "reviewedByName" TEXT,
ADD COLUMN "rejectionReason" VARCHAR(500);

ALTER TABLE "payments"
ADD CONSTRAINT "payments_unconfirmed_funds_unavailable" CHECK (
    "status" NOT IN ('PENDING_VERIFICATION', 'REJECTED')
    OR "availableAmount" = 0
),
ADD CONSTRAINT "payments_contract_reservation_source" CHECK (
    "purpose" <> 'CONTRACT_RESERVATION'
    OR "contractId" IS NOT NULL
),
ADD CONSTRAINT "payments_contract_reservation_review_state" CHECK (
    "purpose" <> 'CONTRACT_RESERVATION'
    OR (
        "status" = 'PENDING_VERIFICATION'
        AND "reviewedAt" IS NULL
        AND "reviewedByUserId" IS NULL
        AND "reviewedByName" IS NULL
        AND "rejectionReason" IS NULL
    )
    OR (
        "status" = 'REJECTED'
        AND "reviewedAt" IS NOT NULL
        AND "reviewedByUserId" IS NOT NULL
        AND "reviewedByName" IS NOT NULL
        AND "rejectionReason" IS NOT NULL
    )
    OR (
        "status" IN ('RECEIVED', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED')
        AND "reviewedAt" IS NOT NULL
        AND "reviewedByUserId" IS NOT NULL
        AND "reviewedByName" IS NOT NULL
        AND "rejectionReason" IS NULL
    )
    OR "status" = 'CANCELLED'
);

CREATE UNIQUE INDEX "Contract_id_tenantId_key"
ON "Contract"("id", "tenantId");

CREATE INDEX "payments_tenantId_contractId_idx"
ON "payments"("tenantId", "contractId");

CREATE INDEX "payments_tenantId_purpose_status_idx"
ON "payments"("tenantId", "purpose", "status");

CREATE UNIQUE INDEX "payments_active_contract_reservation_key"
ON "payments"("tenantId", "contractId")
WHERE "purpose" = 'CONTRACT_RESERVATION'
  AND "status" NOT IN ('REJECTED', 'CANCELLED');

ALTER TABLE "payments"
ADD CONSTRAINT "payments_contractId_tenantId_fkey"
FOREIGN KEY ("contractId", "tenantId") REFERENCES "Contract"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "payment_evidence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_evidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_evidence_size_positive" CHECK ("size" > 0)
);

CREATE UNIQUE INDEX "payment_evidence_objectKey_key"
ON "payment_evidence"("objectKey");

CREATE INDEX "payment_evidence_tenantId_paymentId_idx"
ON "payment_evidence"("tenantId", "paymentId");

CREATE INDEX "payment_evidence_tenantId_createdAt_idx"
ON "payment_evidence"("tenantId", "createdAt");

ALTER TABLE "payment_evidence"
ADD CONSTRAINT "payment_evidence_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_evidence"
ADD CONSTRAINT "payment_evidence_paymentId_tenantId_fkey"
FOREIGN KEY ("paymentId", "tenantId") REFERENCES "payments"("id", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;
