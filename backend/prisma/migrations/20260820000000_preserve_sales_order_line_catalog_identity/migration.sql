ALTER TABLE "sales_order_lines"
ADD COLUMN "additionalServiceCatalogId" TEXT;

UPDATE "sales_order_lines" AS sales_order_line
SET "additionalServiceCatalogId" = catalog."id"
FROM "sales_orders" AS sales_order,
     "additional_service_catalogs" AS catalog
WHERE sales_order_line."salesOrderId" = sales_order."id"
  AND sales_order_line."tenantId" = sales_order."tenantId"
  AND sales_order."sourceType" = 'ADDITIONAL_SERVICE_ORDER'
  AND catalog."tenantId" = sales_order_line."tenantId"
  AND catalog."code" = sales_order_line."serviceCode"
  AND sales_order_line."additionalServiceCatalogId" IS NULL;

ALTER TABLE "sales_order_lines"
ADD CONSTRAINT "sales_order_lines_additionalServiceCatalogId_tenantId_fkey"
FOREIGN KEY ("additionalServiceCatalogId", "tenantId")
REFERENCES "additional_service_catalogs"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;
