ALTER TABLE "billing_documents"
ADD COLUMN "fiscalEmissionAt" TIMESTAMP(3),
ADD COLUMN "fiscalIssueDate" DATE,
ALTER COLUMN "exchangeRate" TYPE DECIMAL(30,12)
USING "exchangeRate"::DECIMAL(30,12);

ALTER TABLE "billing_documents"
ADD CONSTRAINT "billing_documents_fiscal_emission_pair_check"
CHECK (
    ("fiscalEmissionAt" IS NULL) = ("fiscalIssueDate" IS NULL)
),
ADD CONSTRAINT "billing_documents_allocation_fiscal_emission_check"
CHECK (
    "billingDocumentNumberSequenceId" IS NULL
    OR (
        "fiscalEmissionAt" IS NOT NULL
        AND "fiscalIssueDate" IS NOT NULL
    )
),
ADD CONSTRAINT "billing_documents_official_fx_issue_date_check"
CHECK (
    "officialExchangeRateObservationId" IS NULL
    OR (
        "fiscalIssueDate" IS NOT NULL
        AND "fiscalExchangeRateEffectiveDate" = "fiscalIssueDate"
    )
);
