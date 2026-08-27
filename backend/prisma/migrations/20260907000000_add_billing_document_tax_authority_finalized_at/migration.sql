ALTER TABLE "billing_documents"
ADD COLUMN "taxAuthorityFinalizedAt" TIMESTAMPTZ(6);

CREATE INDEX "billing_docs_tenant_tax_status_finalized_idx"
ON "billing_documents"("tenantId", "taxAuthorityStatus", "taxAuthorityFinalizedAt");
