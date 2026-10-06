-- O4.1B: retain immutable Pricing component lineage and authoritative sold value
-- for newly issued Custom Quotation version lines. Historical rows remain null.

ALTER TABLE "custom_quotation_version_lines"
  ADD COLUMN "pricingCalculationComponentLineId" TEXT,
  ADD COLUMN "soldAmount" DECIMAL(19,5);

ALTER TABLE "custom_quotation_version_lines"
  ADD CONSTRAINT "custom_quotation_version_lines_pricing_component_tenant_fkey"
  FOREIGN KEY ("pricingCalculationComponentLineId", "tenantId")
  REFERENCES "pricing_calculation_component_lines"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "custom_quotation_version_lines"
  ADD CONSTRAINT "custom_quotation_version_lines_sold_amount_nonnegative_chk"
  CHECK ("soldAmount" IS NULL OR "soldAmount" >= 0);

CREATE INDEX "custom_quotation_version_lines_tenant_pricing_component_idx"
  ON "custom_quotation_version_lines"("tenantId", "pricingCalculationComponentLineId");
