ALTER TABLE "billing_documents"
DROP CONSTRAINT "billing_documents_official_fx_issue_date_check",
ADD CONSTRAINT "billing_documents_official_fx_issue_date_check"
CHECK (
  "officialExchangeRateObservationId" IS NULL
  OR "documentTypeCode" = '03'
  OR (
    "fiscalIssueDate" IS NOT NULL
    AND "fiscalExchangeRateEffectiveDate" = "fiscalIssueDate"
  )
);
