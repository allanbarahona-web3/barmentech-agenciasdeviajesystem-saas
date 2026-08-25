ALTER TABLE "billing_documents"
ADD COLUMN "providerRefreshAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "providerLastRefreshAt" TIMESTAMP(3),
ADD COLUMN "providerNextRefreshAt" TIMESTAMP(3),
ADD COLUMN "providerRefreshLockOwner" VARCHAR(100),
ADD COLUMN "providerRefreshLeaseUntil" TIMESTAMP(3);

ALTER TABLE "billing_documents"
ADD CONSTRAINT "billing_docs_refresh_attempts_nonnegative_chk"
CHECK (
    "providerRefreshAttempts" >= 0
),
ADD CONSTRAINT "billing_docs_refresh_lease_pair_chk"
CHECK (
    ("providerRefreshLockOwner" IS NULL) =
    ("providerRefreshLeaseUntil" IS NULL)
),
ADD CONSTRAINT "billing_docs_refresh_lock_owner_chk"
CHECK (
    "providerRefreshLockOwner" IS NULL
    OR (
        char_length("providerRefreshLockOwner") BETWEEN 1 AND 100
        AND "providerRefreshLockOwner" = btrim("providerRefreshLockOwner")
    )
),
ADD CONSTRAINT "billing_docs_refresh_identity_chk"
CHECK (
    NOT (
        "providerRefreshAttempts" > 0
        OR "providerLastRefreshAt" IS NOT NULL
        OR "providerNextRefreshAt" IS NOT NULL
        OR "providerRefreshLockOwner" IS NOT NULL
        OR "providerRefreshLeaseUntil" IS NOT NULL
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
ADD CONSTRAINT "billing_docs_refresh_active_state_chk"
CHECK (
    NOT (
        "providerNextRefreshAt" IS NOT NULL
        OR "providerRefreshLockOwner" IS NOT NULL
        OR "providerRefreshLeaseUntil" IS NOT NULL
    )
    OR (
        "taxAuthorityStatus" = 'PROCESSING'
        AND "issuedAt" IS NULL
        AND "providerReconciliationRequired"
        AND "providerNextStatusCheckAt" IS NULL
        AND "providerStatusCheckLockOwner" IS NULL
        AND "providerStatusCheckLeaseUntil" IS NULL
    )
),
ADD CONSTRAINT "billing_docs_refresh_final_cleanup_chk"
CHECK (
    "taxAuthorityStatus" NOT IN ('ACCEPTED', 'REJECTED')
    OR (
        "providerNextRefreshAt" IS NULL
        AND "providerRefreshLockOwner" IS NULL
        AND "providerRefreshLeaseUntil" IS NULL
    )
),
ADD CONSTRAINT "billing_docs_refresh_timestamp_order_chk"
CHECK (
    "providerLastRefreshAt" IS NULL
    OR "providerNextRefreshAt" IS NULL
    OR "providerLastRefreshAt" <= "providerNextRefreshAt"
),
ADD CONSTRAINT "billing_docs_reconciliation_lock_exclusion_chk"
CHECK (
    "providerRefreshLockOwner" IS NULL
    OR "providerStatusCheckLockOwner" IS NULL
);

CREATE INDEX "billing_docs_refresh_due_idx"
ON "billing_documents"(
    "providerNextRefreshAt",
    "taxAuthorityStatus",
    "providerReconciliationRequired"
);

CREATE INDEX "billing_docs_tenant_refresh_idx"
ON "billing_documents"(
    "tenantId",
    "providerReconciliationRequired",
    "providerNextRefreshAt"
);

CREATE INDEX "billing_docs_refresh_lease_idx"
ON "billing_documents"("providerRefreshLeaseUntil");
