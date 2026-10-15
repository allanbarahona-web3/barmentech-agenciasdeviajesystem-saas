ALTER TABLE "additional_service_order_lines"
ADD COLUMN "customerFacingNotes" TEXT;

ALTER TABLE "sales_order_lines"
ADD COLUMN "customerFacingNotes" TEXT;
