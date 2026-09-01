CREATE TABLE "business_number_sequences" (
    "tenantId" TEXT NOT NULL,
    "sequenceKey" VARCHAR(100) NOT NULL,
    "year" INTEGER NOT NULL,
    "currentValue" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "business_number_sequences_pkey" PRIMARY KEY ("tenantId", "sequenceKey", "year"),
    CONSTRAINT "business_number_sequences_year_positive" CHECK ("year" > 0),
    CONSTRAINT "business_number_sequences_currentValue_nonnegative" CHECK ("currentValue" >= 0)
);

ALTER TABLE "business_number_sequences"
ADD CONSTRAINT "business_number_sequences_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payments"
ADD COLUMN "receiptNumber" VARCHAR(50);

WITH ranked_payments AS (
    SELECT
        "id",
        "tenantId",
        EXTRACT(YEAR FROM "createdAt")::INTEGER AS "receiptYear",
        ROW_NUMBER() OVER (
            PARTITION BY "tenantId", EXTRACT(YEAR FROM "createdAt")::INTEGER
            ORDER BY "createdAt" ASC, "id" ASC
        ) AS "receiptSequence"
    FROM "payments"
)
UPDATE "payments" AS payment
SET "receiptNumber" =
    'RCP-' || ranked_payments."receiptYear"::TEXT || '-' || LPAD(ranked_payments."receiptSequence"::TEXT, 6, '0')
FROM ranked_payments
WHERE payment."id" = ranked_payments."id"
  AND payment."tenantId" = ranked_payments."tenantId";

INSERT INTO "business_number_sequences" (
    "tenantId",
    "sequenceKey",
    "year",
    "currentValue",
    "createdAt",
    "updatedAt"
)
SELECT
    "tenantId",
    'FINANCE_RECEIPT',
    EXTRACT(YEAR FROM "createdAt")::INTEGER,
    COUNT(*)::BIGINT,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "payments"
GROUP BY "tenantId", EXTRACT(YEAR FROM "createdAt")::INTEGER;

ALTER TABLE "payments"
ALTER COLUMN "receiptNumber" SET NOT NULL;

CREATE UNIQUE INDEX "payments_tenantId_receiptNumber_key"
ON "payments"("tenantId", "receiptNumber");
