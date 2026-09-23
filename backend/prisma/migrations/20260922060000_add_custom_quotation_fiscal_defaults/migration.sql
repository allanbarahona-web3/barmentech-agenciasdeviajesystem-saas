-- CUSTOM-QUOTATION-FISCAL-DEFAULT-DB-01: tenant fiscal default foundation.

ALTER TABLE "tenant_fiscal_classifications"
ADD COLUMN "isDefaultForCustomQuotations" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "tenant_fiscal_classifications"
ADD CONSTRAINT "tenant_fiscal_classifications_default_active_chk"
CHECK (NOT "isDefaultForCustomQuotations" OR "isActive");

CREATE UNIQUE INDEX "tenant_fiscal_classifications_one_active_custom_quotation_default_key"
ON "tenant_fiscal_classifications"("tenantId")
WHERE "isDefaultForCustomQuotations" = true AND "isActive" = true;

ALTER TABLE "custom_quotations"
ALTER COLUMN "fiscalClassificationId" DROP NOT NULL;
