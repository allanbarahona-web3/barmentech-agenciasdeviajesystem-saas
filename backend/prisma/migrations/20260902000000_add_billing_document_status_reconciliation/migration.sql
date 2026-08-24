ALTER TABLE "billing_documents"
ADD COLUMN "providerStatusCheckAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "providerLastStatusCheckAt" TIMESTAMP(3),
ADD COLUMN "providerNextStatusCheckAt" TIMESTAMP(3),
ADD COLUMN "providerStatusCheckLockOwner" VARCHAR(100),
ADD COLUMN "providerStatusCheckLeaseUntil" TIMESTAMP(3);

ALTER TABLE "billing_documents"
ADD CONSTRAINT "billing_docs_status_check_attempts_nonnegative_chk"
CHECK (
    "providerStatusCheckAttempts" >= 0
),
ADD CONSTRAINT "billing_docs_status_check_lease_pair_chk"
CHECK (
    ("providerStatusCheckLockOwner" IS NULL) =
    ("providerStatusCheckLeaseUntil" IS NULL)
),
ADD CONSTRAINT "billing_docs_status_check_lock_owner_chk"
CHECK (
    "providerStatusCheckLockOwner" IS NULL
    OR (
        char_length("providerStatusCheckLockOwner") BETWEEN 1 AND 100
        AND "providerStatusCheckLockOwner" = btrim("providerStatusCheckLockOwner")
    )
),
ADD CONSTRAINT "billing_docs_status_check_identity_chk"
CHECK (
    NOT (
        "providerStatusCheckAttempts" > 0
        OR "providerLastStatusCheckAt" IS NOT NULL
        OR "providerNextStatusCheckAt" IS NOT NULL
        OR "providerStatusCheckLockOwner" IS NOT NULL
        OR "providerStatusCheckLeaseUntil" IS NOT NULL
    )
    OR (
        "providerDocumentId" IS NOT NULL
        AND "haciendaKey" IS NOT NULL
        AND "fiscalNumber" IS NOT NULL
        AND "providerRequestHash" IS NOT NULL
        AND "providerLastAttemptAt" IS NOT NULL
        AND "submittedAt" IS NOT NULL
        AND "lifecycleStatus" = 'SUBMITTED'
        AND "providerStatus" = 'PROCESSED'
    )
),
ADD CONSTRAINT "billing_docs_status_check_active_state_chk"
CHECK (
    NOT (
        "providerNextStatusCheckAt" IS NOT NULL
        OR "providerStatusCheckLockOwner" IS NOT NULL
        OR "providerStatusCheckLeaseUntil" IS NOT NULL
    )
    OR (
        "taxAuthorityStatus" = 'PROCESSING'
        AND "issuedAt" IS NULL
        AND NOT "providerReconciliationRequired"
    )
),
ADD CONSTRAINT "billing_docs_status_check_final_cleanup_chk"
CHECK (
    "taxAuthorityStatus" NOT IN ('ACCEPTED', 'REJECTED')
    OR (
        "providerNextStatusCheckAt" IS NULL
        AND "providerStatusCheckLockOwner" IS NULL
        AND "providerStatusCheckLeaseUntil" IS NULL
    )
),
ADD CONSTRAINT "billing_docs_status_check_timestamp_order_chk"
CHECK (
    "providerLastStatusCheckAt" IS NULL
    OR "providerNextStatusCheckAt" IS NULL
    OR "providerLastStatusCheckAt" <= "providerNextStatusCheckAt"
);

CREATE INDEX "billing_docs_status_check_due_idx"
ON "billing_documents"(
    "providerNextStatusCheckAt",
    "taxAuthorityStatus",
    "lifecycleStatus",
    "providerStatus"
);

CREATE INDEX "billing_docs_tenant_status_check_idx"
ON "billing_documents"(
    "tenantId",
    "taxAuthorityStatus",
    "providerNextStatusCheckAt"
);

CREATE INDEX "billing_docs_status_check_lease_idx"
ON "billing_documents"("providerStatusCheckLeaseUntil");
