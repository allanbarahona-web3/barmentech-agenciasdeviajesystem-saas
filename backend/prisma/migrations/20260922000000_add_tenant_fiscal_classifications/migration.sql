-- FISCAL-CLASSIFICATION-FOUNDATION-01: neutral tenant-owned fiscal concepts.

CREATE TABLE "tenant_fiscal_classifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "displayName" VARCHAR(160) NOT NULL,
    "description" VARCHAR(500),
    "fiscalItemCategory" "FiscalItemCategory" NOT NULL,
    "cabysCode" VARCHAR(13) NOT NULL,
    "unitOfMeasureCode" VARCHAR(20) NOT NULL,
    "taxCode" VARCHAR(4) NOT NULL,
    "taxRateCode" VARCHAR(4) NOT NULL,
    "taxPercentage" DECIMAL(7,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_fiscal_classifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenant_fiscal_classifications_tax_percentage_nonnegative_chk"
      CHECK ("taxPercentage" >= 0)
);

CREATE UNIQUE INDEX "tenant_fiscal_classifications_id_tenant_key"
ON "tenant_fiscal_classifications"("id", "tenantId");

CREATE UNIQUE INDEX "tenant_fiscal_classifications_tenant_display_name_key"
ON "tenant_fiscal_classifications"("tenantId", "displayName");

CREATE INDEX "tenant_fiscal_classifications_tenant_status_name_idx"
ON "tenant_fiscal_classifications"("tenantId", "isActive", "displayName", "id");

ALTER TABLE "tenant_fiscal_classifications"
ADD CONSTRAINT "tenant_fiscal_classifications_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_fiscal_classifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_fiscal_classifications" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_fiscal_classifications_tenant_select ON "tenant_fiscal_classifications"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY tenant_fiscal_classifications_tenant_insert ON "tenant_fiscal_classifications"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY tenant_fiscal_classifications_tenant_update ON "tenant_fiscal_classifications"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY tenant_fiscal_classifications_tenant_delete ON "tenant_fiscal_classifications"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
