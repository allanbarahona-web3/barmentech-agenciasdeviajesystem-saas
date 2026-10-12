-- Tenant reporting currency remains independent from the commercial/fiscal
-- document default. NULL preserves existing tenants without a backfill.
ALTER TABLE "tenant_billing_configurations"
ADD COLUMN "accountingCurrencyCode" VARCHAR(3);

ALTER TABLE "tenant_billing_configurations"
ADD CONSTRAINT "tenant_billing_configurations_accounting_currency_code_chk"
CHECK (
  "accountingCurrencyCode" IS NULL
  OR "accountingCurrencyCode" ~ '^[A-Z]{3}$'
);

CREATE TYPE "AccountingExchangeRateOperation" AS ENUM ('IDENTITY', 'MULTIPLY', 'DIVIDE');

-- New-purchase accounting FX snapshot. Every column is nullable so historical
-- purchases remain untouched until a separately authorized migration/backfill.
ALTER TABLE "operational_purchases"
ADD COLUMN "accountingCurrencyCode" VARCHAR(3),
ADD COLUMN "exchangeRate" DECIMAL(30,12),
ADD COLUMN "exchangeRateAuthority" VARCHAR(100),
ADD COLUMN "exchangeRateEffectiveDate" DATE,
ADD COLUMN "exchangeRateObservationId" TEXT,
ADD COLUMN "exchangeRateIndicator" VARCHAR(100),
ADD COLUMN "exchangeRateOperation" "AccountingExchangeRateOperation";

ALTER TABLE "operational_purchases"
ADD CONSTRAINT "operational_purchases_accounting_currency_code_chk"
CHECK (
  "accountingCurrencyCode" IS NULL
  OR "accountingCurrencyCode" ~ '^[A-Z]{3}$'
),
ADD CONSTRAINT "operational_purchases_accounting_fx_rate_positive_chk"
CHECK ("exchangeRate" IS NULL OR "exchangeRate" > 0),
ADD CONSTRAINT "operational_purchases_accounting_fx_observation_fkey"
FOREIGN KEY ("exchangeRateObservationId")
REFERENCES "official_exchange_rate_observations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "operational_purchases_accounting_fx_observation_idx"
ON "operational_purchases"("exchangeRateObservationId");
