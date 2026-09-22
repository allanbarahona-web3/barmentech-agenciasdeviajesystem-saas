-- CUSTOM-QUOTATION-VERSION-LINES-DB-01: immutable customer-facing quotation line snapshots.

CREATE TABLE "custom_quotation_version_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customQuotationVersionId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "commercialNote" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_quotation_version_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "custom_quotation_version_lines_display_order_positive_chk"
      CHECK ("displayOrder" > 0),
    CONSTRAINT "custom_quotation_version_lines_description_nonempty_chk"
      CHECK (char_length(btrim("description")) > 0),
    CONSTRAINT "custom_quotation_version_lines_quantity_positive_chk"
      CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "custom_quotation_version_lines_id_tenant_key"
ON "custom_quotation_version_lines"("id", "tenantId");

CREATE UNIQUE INDEX "custom_quotation_version_lines_tenant_version_display_key"
ON "custom_quotation_version_lines"("tenantId", "customQuotationVersionId", "displayOrder");

ALTER TABLE "custom_quotation_version_lines"
ADD CONSTRAINT "custom_quotation_version_lines_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "custom_quotation_version_lines"
ADD CONSTRAINT "custom_quotation_version_lines_version_tenant_fkey"
FOREIGN KEY ("customQuotationVersionId", "tenantId") REFERENCES "custom_quotation_versions"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "custom_quotation_version_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_quotation_version_lines" FORCE ROW LEVEL SECURITY;

CREATE POLICY custom_quotation_version_lines_tenant_select ON "custom_quotation_version_lines"
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY custom_quotation_version_lines_tenant_insert ON "custom_quotation_version_lines"
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
