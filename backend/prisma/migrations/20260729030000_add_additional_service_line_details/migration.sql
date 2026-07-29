ALTER TABLE "additional_service_order_lines"
ADD COLUMN "serviceDetailsVersion" INTEGER,
ADD COLUMN "serviceDetails" JSONB;
