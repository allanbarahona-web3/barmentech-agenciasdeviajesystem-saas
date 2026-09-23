-- CUSTOM-QUOTATION-CUSTOMER-ACCEPTANCE-FIX-01: acceptance may be attributed
-- either to an authenticated staff member or to the immutable public recipient.

ALTER TABLE "custom_quotation_versions"
DROP CONSTRAINT "custom_quotation_versions_acceptance_metadata_chk",
ADD CONSTRAINT "custom_quotation_versions_acceptance_metadata_chk" CHECK (
  (
    "status" <> 'ACCEPTED'
    AND "acceptedAt" IS NULL
    AND "acceptedByUserId" IS NULL
    AND "acceptedByName" IS NULL
  )
  OR (
    "status" = 'ACCEPTED'
    AND "acceptedAt" IS NOT NULL
    AND "acceptedByName" IS NOT NULL
  )
);
