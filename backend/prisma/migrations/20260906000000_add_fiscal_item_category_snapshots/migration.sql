CREATE TYPE "FiscalItemCategory" AS ENUM ('SERVICE', 'MERCHANDISE');

ALTER TABLE "additional_service_catalogs"
ADD COLUMN "fiscalItemCategory" "FiscalItemCategory" NOT NULL DEFAULT 'SERVICE';

ALTER TABLE "sales_order_lines"
ADD COLUMN "fiscalItemCategory" "FiscalItemCategory";
