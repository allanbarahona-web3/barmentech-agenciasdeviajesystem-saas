ALTER TABLE "payments"
ADD COLUMN "settlementCurrencyCode" VARCHAR(3),
ADD COLUMN "settlementAmount" NUMERIC(19,5),
ADD COLUMN "settlementAvailableAmount" NUMERIC(19,5),
ADD COLUMN "settlementExchangeRate" NUMERIC(30,12),
ADD COLUMN "settlementExchangeRateSource" "TenantExchangeRateSource",
ADD COLUMN "settlementExchangeRateEffectiveDate" DATE;

ALTER TABLE "payment_evidence"
ADD COLUMN "extractionMetadata" JSONB;
