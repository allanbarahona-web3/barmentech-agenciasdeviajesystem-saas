-- SALES-ORDER-FISCAL-SNAPSHOT-DB-01: nullable, source-neutral fiscal line snapshots.

ALTER TABLE "sales_order_lines"
ADD COLUMN "fiscalClassificationId" TEXT,
ADD COLUMN "fiscalDescription" TEXT,
ADD COLUMN "cabysCode" VARCHAR(13),
ADD COLUMN "unitOfMeasureCode" VARCHAR(20),
ADD COLUMN "taxCode" VARCHAR(4),
ADD COLUMN "taxRateCode" VARCHAR(4),
ADD COLUMN "fiscalTaxPercentage" DECIMAL(7,4);

ALTER TABLE "sales_order_lines"
ADD CONSTRAINT "sales_order_lines_fiscal_tax_percentage_nonnegative_chk"
CHECK ("fiscalTaxPercentage" IS NULL OR "fiscalTaxPercentage" >= 0);

ALTER TABLE "sales_order_lines"
ADD CONSTRAINT "sales_order_lines_fiscal_classification_tenant_fkey"
FOREIGN KEY ("fiscalClassificationId", "tenantId")
REFERENCES "tenant_fiscal_classifications"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;
