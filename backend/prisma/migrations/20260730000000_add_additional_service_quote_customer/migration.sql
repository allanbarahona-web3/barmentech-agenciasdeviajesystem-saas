ALTER TABLE "additional_service_orders"
ADD COLUMN "quoteCustomerId" TEXT;

CREATE INDEX "additional_service_orders_quoteCustomerId_idx"
ON "additional_service_orders"("quoteCustomerId");

ALTER TABLE "additional_service_orders"
ADD CONSTRAINT "additional_service_orders_quoteCustomerId_fkey"
FOREIGN KEY ("quoteCustomerId") REFERENCES "Client"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
