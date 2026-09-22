-- CUSTOM-QUOTATION-DB-01: independent tenant-safe Custom Quotation foundation.

CREATE TYPE "CustomQuotationStatus" AS ENUM (
  'DRAFT', 'ISSUED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'
);

CREATE TYPE "CustomQuotationVersionStatus" AS ENUM (
  'ISSUED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'
);

CREATE TABLE "custom_quotations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quotationNumber" VARCHAR(50) NOT NULL,
    "customerId" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "commercialObservations" VARCHAR(2000),
    "quotationValidUntil" TIMESTAMP(3),
    "paymentConditionType" "PaymentConditionType",
    "paymentTermValue" INTEGER,
    "paymentTermUnit" "PaymentTermUnit",
    "fiscalClassificationId" TEXT NOT NULL,
    "status" "CustomQuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_quotations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "custom_quotations_number_nonempty_chk"
      CHECK (char_length(btrim("quotationNumber")) > 0),
    CONSTRAINT "custom_quotations_title_nonempty_chk"
      CHECK (char_length(btrim("title")) > 0),
    CONSTRAINT "custom_quotations_payment_condition_chk" CHECK (
      (
        "paymentConditionType" IS NULL
        AND "paymentTermValue" IS NULL
        AND "paymentTermUnit" IS NULL
      )
      OR (
        "paymentConditionType" = 'CASH'
        AND "paymentTermValue" IS NULL
        AND "paymentTermUnit" IS NULL
      )
      OR (
        "paymentConditionType" = 'CREDIT'
        AND "paymentTermValue" IS NOT NULL
        AND "paymentTermValue" > 0
        AND "paymentTermUnit" IS NOT NULL
      )
    )
);

CREATE TABLE "custom_quotation_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customQuotationId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "commercialNote" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_quotation_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "custom_quotation_lines_display_order_positive_chk"
      CHECK ("displayOrder" > 0),
    CONSTRAINT "custom_quotation_lines_description_nonempty_chk"
      CHECK (char_length(btrim("description")) > 0),
    CONSTRAINT "custom_quotation_lines_quantity_positive_chk"
      CHECK ("quantity" > 0)
);

CREATE TABLE "custom_quotation_costing_project_links" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customQuotationId" TEXT NOT NULL,
    "costingProjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_quotation_costing_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "custom_quotation_versions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customQuotationId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "CustomQuotationVersionStatus" NOT NULL DEFAULT 'ISSUED',
    "currency" "Currency" NOT NULL,
    "finalSellingPrice" DECIMAL(19,5) NOT NULL,
    "quotationValidUntil" TIMESTAMP(3),
    "paymentConditionType" "PaymentConditionType",
    "paymentTermValue" INTEGER,
    "paymentTermUnit" "PaymentTermUnit",
    "commercialObservations" VARCHAR(2000),
    "costingProjectId" TEXT NOT NULL,
    "pricingCalculationVersionId" TEXT NOT NULL,
    "fiscalClassificationId" TEXT,
    "fiscalDescription" VARCHAR(500) NOT NULL,
    "fiscalItemCategory" "FiscalItemCategory" NOT NULL,
    "cabysCode" VARCHAR(13) NOT NULL,
    "unitOfMeasureCode" VARCHAR(20) NOT NULL,
    "taxCode" VARCHAR(4) NOT NULL,
    "taxRateCode" VARCHAR(4) NOT NULL,
    "fiscalTaxPercentage" DECIMAL(7,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "acceptedByName" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "salesOrderId" TEXT,

    CONSTRAINT "custom_quotation_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "custom_quotation_versions_number_positive_chk"
      CHECK ("versionNumber" > 0),
    CONSTRAINT "custom_quotation_versions_final_price_nonnegative_chk"
      CHECK ("finalSellingPrice" >= 0),
    CONSTRAINT "custom_quotation_versions_tax_percentage_nonnegative_chk"
      CHECK ("fiscalTaxPercentage" >= 0),
    CONSTRAINT "custom_quotation_versions_fiscal_values_nonempty_chk" CHECK (
      char_length(btrim("fiscalDescription")) > 0
      AND char_length(btrim("cabysCode")) > 0
      AND char_length(btrim("unitOfMeasureCode")) > 0
      AND char_length(btrim("taxCode")) > 0
      AND char_length(btrim("taxRateCode")) > 0
    ),
    CONSTRAINT "custom_quotation_versions_payment_condition_chk" CHECK (
      (
        "paymentConditionType" IS NULL
        AND "paymentTermValue" IS NULL
        AND "paymentTermUnit" IS NULL
      )
      OR (
        "paymentConditionType" = 'CASH'
        AND "paymentTermValue" IS NULL
        AND "paymentTermUnit" IS NULL
      )
      OR (
        "paymentConditionType" = 'CREDIT'
        AND "paymentTermValue" IS NOT NULL
        AND "paymentTermValue" > 0
        AND "paymentTermUnit" IS NOT NULL
      )
    ),
    CONSTRAINT "custom_quotation_versions_acceptance_metadata_chk" CHECK (
      ("acceptedAt" IS NULL AND "acceptedByUserId" IS NULL AND "acceptedByName" IS NULL)
      OR ("acceptedAt" IS NOT NULL AND "acceptedByUserId" IS NOT NULL AND "acceptedByName" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "custom_quotations_id_tenant_key"
ON "custom_quotations"("id", "tenantId");

CREATE UNIQUE INDEX "custom_quotations_tenant_number_key"
ON "custom_quotations"("tenantId", "quotationNumber");

CREATE INDEX "custom_quotations_tenant_customer_created_idx"
ON "custom_quotations"("tenantId", "customerId", "createdAt" DESC, "id" DESC);

CREATE INDEX "custom_quotations_tenant_status_created_idx"
ON "custom_quotations"("tenantId", "status", "createdAt" DESC, "id" DESC);

CREATE UNIQUE INDEX "custom_quotation_lines_id_tenant_key"
ON "custom_quotation_lines"("id", "tenantId");

CREATE UNIQUE INDEX "custom_quotation_lines_tenant_quotation_display_key"
ON "custom_quotation_lines"("tenantId", "customQuotationId", "displayOrder");

CREATE INDEX "custom_quotation_lines_tenant_quotation_order_idx"
ON "custom_quotation_lines"("tenantId", "customQuotationId", "displayOrder", "id");

CREATE UNIQUE INDEX "custom_quotation_costing_links_id_tenant_key"
ON "custom_quotation_costing_project_links"("id", "tenantId");

CREATE UNIQUE INDEX "custom_quotation_costing_links_tenant_quotation_key"
ON "custom_quotation_costing_project_links"("customQuotationId", "tenantId");

CREATE UNIQUE INDEX "custom_quotation_costing_links_tenant_project_key"
ON "custom_quotation_costing_project_links"("costingProjectId", "tenantId");

CREATE UNIQUE INDEX "custom_quotation_versions_id_tenant_key"
ON "custom_quotation_versions"("id", "tenantId");

CREATE UNIQUE INDEX "custom_quotation_versions_tenant_quotation_number_key"
ON "custom_quotation_versions"("tenantId", "customQuotationId", "versionNumber");

CREATE UNIQUE INDEX "custom_quotation_versions_tenant_sales_order_key"
ON "custom_quotation_versions"("tenantId", "salesOrderId");

CREATE INDEX "custom_quotation_versions_tenant_quotation_history_idx"
ON "custom_quotation_versions"("tenantId", "customQuotationId", "createdAt" DESC, "id" DESC);

ALTER TABLE "custom_quotations"
ADD CONSTRAINT "custom_quotations_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "custom_quotations"
ADD CONSTRAINT "custom_quotations_customer_tenant_fkey"
FOREIGN KEY ("customerId", "tenantId") REFERENCES "Client"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "custom_quotations"
ADD CONSTRAINT "custom_quotations_fiscal_classification_tenant_fkey"
FOREIGN KEY ("fiscalClassificationId", "tenantId") REFERENCES "tenant_fiscal_classifications"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "custom_quotation_lines"
ADD CONSTRAINT "custom_quotation_lines_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "custom_quotation_lines"
ADD CONSTRAINT "custom_quotation_lines_quotation_tenant_fkey"
FOREIGN KEY ("customQuotationId", "tenantId") REFERENCES "custom_quotations"("id", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "custom_quotation_costing_project_links"
ADD CONSTRAINT "custom_quotation_costing_links_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "custom_quotation_costing_project_links"
ADD CONSTRAINT "custom_quotation_costing_links_quotation_tenant_fkey"
FOREIGN KEY ("customQuotationId", "tenantId") REFERENCES "custom_quotations"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "custom_quotation_costing_project_links"
ADD CONSTRAINT "custom_quotation_costing_links_project_tenant_fkey"
FOREIGN KEY ("costingProjectId", "tenantId") REFERENCES "costing_projects"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "custom_quotation_versions"
ADD CONSTRAINT "custom_quotation_versions_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "custom_quotation_versions"
ADD CONSTRAINT "custom_quotation_versions_quotation_tenant_fkey"
FOREIGN KEY ("customQuotationId", "tenantId") REFERENCES "custom_quotations"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "custom_quotation_versions"
ADD CONSTRAINT "custom_quotation_versions_project_tenant_fkey"
FOREIGN KEY ("costingProjectId", "tenantId") REFERENCES "costing_projects"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "custom_quotation_versions"
ADD CONSTRAINT "custom_quotation_versions_pricing_version_tenant_fkey"
FOREIGN KEY ("pricingCalculationVersionId", "tenantId", "costingProjectId") REFERENCES "pricing_calculation_versions"("id", "tenantId", "costingProjectId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "custom_quotation_versions"
ADD CONSTRAINT "custom_quotation_versions_fiscal_classification_tenant_fkey"
FOREIGN KEY ("fiscalClassificationId", "tenantId") REFERENCES "tenant_fiscal_classifications"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "custom_quotation_versions"
ADD CONSTRAINT "custom_quotation_versions_sales_order_tenant_fkey"
FOREIGN KEY ("salesOrderId", "tenantId") REFERENCES "sales_orders"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "custom_quotations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_quotations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "custom_quotation_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_quotation_lines" FORCE ROW LEVEL SECURITY;
ALTER TABLE "custom_quotation_costing_project_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_quotation_costing_project_links" FORCE ROW LEVEL SECURITY;
ALTER TABLE "custom_quotation_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_quotation_versions" FORCE ROW LEVEL SECURITY;

CREATE POLICY custom_quotations_tenant_select ON "custom_quotations"
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY custom_quotations_tenant_insert ON "custom_quotations"
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY custom_quotations_tenant_update ON "custom_quotations"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY custom_quotations_tenant_delete ON "custom_quotations"
  FOR DELETE USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY custom_quotation_lines_tenant_select ON "custom_quotation_lines"
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY custom_quotation_lines_tenant_insert ON "custom_quotation_lines"
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY custom_quotation_lines_tenant_update ON "custom_quotation_lines"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY custom_quotation_lines_tenant_delete ON "custom_quotation_lines"
  FOR DELETE USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY custom_quotation_costing_links_tenant_select ON "custom_quotation_costing_project_links"
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY custom_quotation_costing_links_tenant_insert ON "custom_quotation_costing_project_links"
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY custom_quotation_versions_tenant_select ON "custom_quotation_versions"
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY custom_quotation_versions_tenant_insert ON "custom_quotation_versions"
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY custom_quotation_versions_tenant_update ON "custom_quotation_versions"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
