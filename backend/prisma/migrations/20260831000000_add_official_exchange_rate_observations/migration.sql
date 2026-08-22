CREATE TYPE "OfficialExchangeRateType" AS ENUM (
    'REFERENCE_BUY',
    'REFERENCE_SELL'
);

CREATE TABLE "official_exchange_rate_observations" (
    "id" TEXT NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "foreignCurrencyCode" VARCHAR(3) NOT NULL,
    "localCurrencyCode" VARCHAR(3) NOT NULL,
    "rateType" "OfficialExchangeRateType" NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "value" DECIMAL(30,12) NOT NULL,
    "sourceAuthority" VARCHAR(100) NOT NULL,
    "sourceIndicatorCode" VARCHAR(100) NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "sourcePublishedAt" TIMESTAMP(3),
    "requestIdentity" VARCHAR(200) NOT NULL,
    "responseHash" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "official_exchange_rate_observations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "official_fx_obs_country_code_check"
        CHECK ("countryCode" ~ '^[A-Z]{2}$'),
    CONSTRAINT "official_fx_obs_foreign_currency_check"
        CHECK ("foreignCurrencyCode" ~ '^[A-Z]{3}$'),
    CONSTRAINT "official_fx_obs_local_currency_check"
        CHECK ("localCurrencyCode" ~ '^[A-Z]{3}$'),
    CONSTRAINT "official_fx_obs_distinct_currencies_check"
        CHECK ("foreignCurrencyCode" <> "localCurrencyCode"),
    CONSTRAINT "official_fx_obs_positive_value_check"
        CHECK ("value" > 0),
    CONSTRAINT "official_fx_obs_source_authority_check"
        CHECK (
            char_length("sourceAuthority") BETWEEN 1 AND 100
            AND "sourceAuthority" = btrim("sourceAuthority")
        ),
    CONSTRAINT "official_fx_obs_indicator_code_check"
        CHECK (
            char_length("sourceIndicatorCode") BETWEEN 1 AND 100
            AND "sourceIndicatorCode" = btrim("sourceIndicatorCode")
        ),
    CONSTRAINT "official_fx_obs_request_identity_check"
        CHECK (
            char_length("requestIdentity") BETWEEN 1 AND 200
            AND "requestIdentity" = btrim("requestIdentity")
        ),
    CONSTRAINT "official_fx_obs_response_hash_check"
        CHECK (
            "responseHash" IS NULL
            OR "responseHash" ~ '^[0-9a-f]{64}$'
        )
);

CREATE UNIQUE INDEX "official_fx_obs_authoritative_identity_key"
ON "official_exchange_rate_observations"(
    "countryCode",
    "foreignCurrencyCode",
    "localCurrencyCode",
    "rateType",
    "effectiveDate",
    "sourceAuthority",
    "sourceIndicatorCode"
);

CREATE UNIQUE INDEX "official_fx_obs_request_identity_key"
ON "official_exchange_rate_observations"("requestIdentity");

CREATE UNIQUE INDEX "official_fx_obs_snapshot_identity_key"
ON "official_exchange_rate_observations"(
    "id",
    "effectiveDate",
    "sourceAuthority",
    "sourceIndicatorCode"
);

CREATE INDEX "official_fx_obs_resolution_idx"
ON "official_exchange_rate_observations"(
    "countryCode",
    "foreignCurrencyCode",
    "localCurrencyCode",
    "rateType",
    "effectiveDate"
);

CREATE INDEX "official_fx_obs_source_audit_idx"
ON "official_exchange_rate_observations"(
    "sourceAuthority",
    "sourceIndicatorCode",
    "effectiveDate"
);

ALTER TABLE "billing_documents"
ADD COLUMN "officialExchangeRateObservationId" TEXT,
ADD COLUMN "fiscalExchangeRateEffectiveDate" DATE,
ADD COLUMN "fiscalExchangeRateSourceAuthority" VARCHAR(100),
ADD COLUMN "fiscalExchangeRateIndicatorCode" VARCHAR(100);

ALTER TABLE "billing_documents"
ADD CONSTRAINT "billing_documents_official_fx_snapshot_check"
CHECK (
    (
        "officialExchangeRateObservationId" IS NULL
        AND "fiscalExchangeRateEffectiveDate" IS NULL
        AND "fiscalExchangeRateSourceAuthority" IS NULL
        AND "fiscalExchangeRateIndicatorCode" IS NULL
    )
    OR
    (
        "officialExchangeRateObservationId" IS NOT NULL
        AND "exchangeRate" IS NOT NULL
        AND "exchangeRate" > 0
        AND "fiscalExchangeRateEffectiveDate" IS NOT NULL
        AND "fiscalExchangeRateSourceAuthority" IS NOT NULL
        AND char_length("fiscalExchangeRateSourceAuthority") BETWEEN 1 AND 100
        AND "fiscalExchangeRateSourceAuthority" = btrim("fiscalExchangeRateSourceAuthority")
        AND "fiscalExchangeRateIndicatorCode" IS NOT NULL
        AND char_length("fiscalExchangeRateIndicatorCode") BETWEEN 1 AND 100
        AND "fiscalExchangeRateIndicatorCode" = btrim("fiscalExchangeRateIndicatorCode")
    )
);

CREATE INDEX "billing_documents_official_fx_observation_idx"
ON "billing_documents"("officialExchangeRateObservationId");

ALTER TABLE "billing_documents"
ADD CONSTRAINT "billing_documents_official_fx_snapshot_fkey"
FOREIGN KEY (
    "officialExchangeRateObservationId",
    "fiscalExchangeRateEffectiveDate",
    "fiscalExchangeRateSourceAuthority",
    "fiscalExchangeRateIndicatorCode"
)
REFERENCES "official_exchange_rate_observations"(
    "id",
    "effectiveDate",
    "sourceAuthority",
    "sourceIndicatorCode"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;
