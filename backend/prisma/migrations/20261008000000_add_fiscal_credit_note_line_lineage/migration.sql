-- Additive lineage for fiscal credit-note (03) lines. Existing fiscal lines
-- remain valid with a NULL source; no historic records are rewritten.
ALTER TABLE "billing_document_lines"
  ADD COLUMN "sourceBillingDocumentLineId" TEXT;

CREATE INDEX "billing_document_lines_tenant_credit_source_idx"
  ON "billing_document_lines"("tenantId", "sourceBillingDocumentLineId");

ALTER TABLE "billing_document_lines"
  ADD CONSTRAINT "billing_document_lines_credit_source_tenant_fkey"
  FOREIGN KEY ("sourceBillingDocumentLineId", "tenantId")
  REFERENCES "billing_document_lines"("id", "tenantId")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
