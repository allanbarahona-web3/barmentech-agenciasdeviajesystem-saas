-- Additive only. Existing immutable versions retain their version-level fiscal tuple.
CREATE TABLE "custom_quotation_component_fiscal_classifications" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "customQuotationId" TEXT NOT NULL,
  "costComponentId" TEXT NOT NULL,
  "fiscalClassificationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "custom_quotation_component_fiscal_classifications_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "custom_quotation_version_lines"
  ADD COLUMN "fiscalClassificationId" TEXT,
  ADD COLUMN "fiscalDescription" VARCHAR(500),
  ADD COLUMN "fiscalItemCategory" "FiscalItemCategory",
  ADD COLUMN "cabysCode" VARCHAR(13),
  ADD COLUMN "unitOfMeasureCode" VARCHAR(20),
  ADD COLUMN "taxCode" VARCHAR(4),
  ADD COLUMN "taxRateCode" VARCHAR(4),
  ADD COLUMN "fiscalTaxPercentage" DECIMAL(7,4);

CREATE UNIQUE INDEX "custom_quotation_component_fiscal_identity_key"
  ON "custom_quotation_component_fiscal_classifications"("tenantId", "customQuotationId", "costComponentId");
CREATE UNIQUE INDEX "custom_quotation_component_fiscal_id_tenant_key"
  ON "custom_quotation_component_fiscal_classifications"("id", "tenantId");
CREATE INDEX "custom_quotation_component_fiscal_quotation_idx"
  ON "custom_quotation_component_fiscal_classifications"("tenantId", "customQuotationId");

ALTER TABLE "custom_quotation_component_fiscal_classifications"
  ADD CONSTRAINT "custom_quotation_component_fiscal_quotation_tenant_fkey"
  FOREIGN KEY ("customQuotationId", "tenantId") REFERENCES "custom_quotations"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "custom_quotation_component_fiscal_component_tenant_fkey"
  FOREIGN KEY ("costComponentId", "tenantId") REFERENCES "cost_components"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "custom_quotation_component_fiscal_classification_tenant_fkey"
  FOREIGN KEY ("fiscalClassificationId", "tenantId") REFERENCES "tenant_fiscal_classifications"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "custom_quotation_version_lines"
  ADD CONSTRAINT "cq_version_lines_fiscal_class_tenant_fkey"
  FOREIGN KEY ("fiscalClassificationId", "tenantId") REFERENCES "tenant_fiscal_classifications"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
