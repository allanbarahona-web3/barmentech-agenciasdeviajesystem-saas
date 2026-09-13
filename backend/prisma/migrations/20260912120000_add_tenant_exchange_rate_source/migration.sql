CREATE TYPE "TenantExchangeRateSource" AS ENUM (
    'MANUAL',
    'BCCR'
);

ALTER TABLE "tenant_billing_configurations"
ADD COLUMN "exchangeRateSource" "TenantExchangeRateSource" NOT NULL DEFAULT 'MANUAL';
