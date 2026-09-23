-- CUSTOM-QUOTATION-LEAD-DB-01: transition Custom Quotations to Lead-first pre-sale provenance.

ALTER TABLE "custom_quotations"
ADD COLUMN "leadId" TEXT,
ALTER COLUMN "customerId" DROP NOT NULL;

ALTER TABLE "custom_quotation_versions"
ADD COLUMN "recipientFullName" TEXT,
ADD COLUMN "recipientEmail" TEXT,
ADD COLUMN "recipientPhone" TEXT,
ADD COLUMN "recipientCompanyName" TEXT;

CREATE INDEX "custom_quotations_tenant_lead_created_idx"
ON "custom_quotations"("tenantId", "leadId", "createdAt" DESC, "id" DESC);

ALTER TABLE "custom_quotations"
ADD CONSTRAINT "custom_quotations_lead_tenant_fkey"
FOREIGN KEY ("leadId", "tenantId") REFERENCES "leads"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;
