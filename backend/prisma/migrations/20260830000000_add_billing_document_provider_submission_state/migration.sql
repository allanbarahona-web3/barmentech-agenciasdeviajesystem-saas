CREATE TYPE "BillingProviderEnvironment" AS ENUM ('sandbox', 'production');

ALTER TABLE "billing_documents"
ADD COLUMN "providerEnvironment" "BillingProviderEnvironment",
ADD COLUMN "providerRequestHash" VARCHAR(64),
ADD COLUMN "providerLastAttemptAt" TIMESTAMP(3),
ADD COLUMN "providerLastErrorCode" VARCHAR(100),
ADD COLUMN "providerLastErrorAt" TIMESTAMP(3),
ADD COLUMN "providerReconciliationRequired" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "billing_documents"
ADD CONSTRAINT "billing_documents_provider_request_hash_check"
CHECK (
    "providerRequestHash" IS NULL
    OR "providerRequestHash" ~ '^[0-9a-f]{64}$'
),
ADD CONSTRAINT "billing_documents_provider_error_code_check"
CHECK (
    "providerLastErrorCode" IS NULL
    OR (
        char_length("providerLastErrorCode") BETWEEN 1 AND 100
        AND "providerLastErrorCode" = btrim("providerLastErrorCode")
    )
),
ADD CONSTRAINT "billing_documents_provider_error_pair_check"
CHECK (
    ("providerLastErrorCode" IS NULL) = ("providerLastErrorAt" IS NULL)
),
ADD CONSTRAINT "billing_documents_provider_reconciliation_check"
CHECK (
    NOT "providerReconciliationRequired"
    OR (
        "fiscalNumber" IS NOT NULL
        AND "billingDocumentNumberSequenceId" IS NOT NULL
        AND "allocatedSequenceNumber" IS NOT NULL
        AND "issuanceIdempotencyKey" IS NOT NULL
        AND "providerRequestHash" IS NOT NULL
        AND "providerLastAttemptAt" IS NOT NULL
    )
),
ADD CONSTRAINT "billing_documents_provider_environment_check"
CHECK (
    "providerEnvironment" IS NULL
    OR (
        "providerRequestHash" IS NOT NULL
        AND "providerLastAttemptAt" IS NOT NULL
    )
);

CREATE INDEX "billing_docs_tenant_reconciliation_attempt_idx"
ON "billing_documents"(
    "tenantId",
    "providerReconciliationRequired",
    "providerLastAttemptAt"
);
