ALTER TABLE "additional_service_order_lines"
ADD COLUMN "customerFacingDescription" TEXT;

ALTER TABLE "sales_order_lines"
ADD COLUMN "customerFacingDescription" TEXT;
