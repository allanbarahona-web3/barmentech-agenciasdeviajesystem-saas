ALTER TABLE "billing_documents"
ADD COLUMN "haciendaRejectionDetail" TEXT NULL;

ALTER TABLE "billing_documents"
ADD CONSTRAINT "billing_docs_hacienda_rejection_content_chk"
CHECK (
    "haciendaRejectionDetail" IS NULL
    OR (
        char_length("haciendaRejectionDetail") BETWEEN 1 AND 65536
        AND "haciendaRejectionDetail" = btrim("haciendaRejectionDetail")
    )
),
ADD CONSTRAINT "billing_docs_hacienda_rejection_state_chk"
CHECK (
    "haciendaRejectionDetail" IS NULL
    OR (
        "taxAuthorityStatus" = 'REJECTED'
        AND "providerDocumentId" IS NOT NULL
        AND "haciendaKey" IS NOT NULL
        AND "fiscalNumber" IS NOT NULL
        AND "submittedAt" IS NOT NULL
        AND "lifecycleStatus" = 'SUBMITTED'
        AND "providerStatus" = 'PROCESSED'
        AND "issuedAt" IS NULL
        AND NOT "providerReconciliationRequired"
        AND "providerNextStatusCheckAt" IS NULL
        AND "providerStatusCheckLockOwner" IS NULL
        AND "providerStatusCheckLeaseUntil" IS NULL
        AND "providerNextRefreshAt" IS NULL
        AND "providerRefreshLockOwner" IS NULL
        AND "providerRefreshLeaseUntil" IS NULL
    )
),
ADD CONSTRAINT "billing_docs_hacienda_rejection_cleanup_chk"
CHECK (
    "taxAuthorityStatus" = 'REJECTED'
    OR "haciendaRejectionDetail" IS NULL
);
