-- O4.1C: preserve immutable Custom Quotation version-line lineage on Sales Order lines.
-- Existing non-Custom-Quotation lines remain valid with a null source-line reference.

ALTER TABLE "sales_order_lines"
  ADD COLUMN "customQuotationVersionLineId" TEXT;

ALTER TABLE "sales_order_lines"
  ADD CONSTRAINT "sales_order_lines_custom_quotation_version_line_tenant_fkey"
  FOREIGN KEY ("customQuotationVersionLineId", "tenantId")
  REFERENCES "custom_quotation_version_lines"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "sales_order_lines_tenant_custom_quotation_version_line_key"
  ON "sales_order_lines"("tenantId", "customQuotationVersionLineId");
