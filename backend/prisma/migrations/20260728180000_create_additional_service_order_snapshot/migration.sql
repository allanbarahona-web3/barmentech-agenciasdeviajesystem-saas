-- CreateEnum
CREATE TYPE "AdditionalServiceTravelType" AS ENUM ('INTERNATIONAL', 'INTERNAL');

ALTER TABLE "additional_service_orders"
DROP CONSTRAINT "additional_service_orders_internalTripId_fkey";

ALTER TABLE "additional_service_orders"
DROP CONSTRAINT "additional_service_orders_travelPackageId_fkey";

ALTER TABLE "additional_service_order_lines"
DROP CONSTRAINT "additional_service_order_lines_orderId_fkey";

ALTER TABLE "additional_service_order_participants"
DROP CONSTRAINT "additional_service_order_participants_lineId_fkey";

ALTER TABLE "additional_service_order_participants"
DROP CONSTRAINT "additional_service_order_participants_clientId_fkey";

DROP INDEX "additional_service_orders_internalTripId_idx";

-- Drop legacy line indexes and columns from the pre-pricing-engine draft model.
DROP INDEX "additional_service_order_lines_serviceType_idx";
DROP INDEX "additional_service_order_lines_serviceDate_idx";

ALTER TABLE "additional_service_orders"
DROP COLUMN "internalTripId",
ADD COLUMN "internalBookingId" TEXT,
ADD COLUMN "idempotencyKey" TEXT NOT NULL,
ADD COLUMN "travelType" "AdditionalServiceTravelType" NOT NULL,
ADD COLUMN "currency" "AdditionalServiceCurrency" NOT NULL,
ADD COLUMN "commercialSubtotal" DECIMAL(18,4) NOT NULL,
ADD COLUMN "totalVat" DECIMAL(18,4) NOT NULL,
ADD COLUMN "totalSellingPrice" DECIMAL(18,4) NOT NULL;

ALTER TABLE "additional_service_order_lines"
DROP COLUMN "serviceType",
DROP COLUMN "detail",
DROP COLUMN "notes",
DROP COLUMN "serviceDate",
DROP COLUMN "quantity",
DROP COLUMN "currency",
DROP COLUMN "exchangeRate",
DROP COLUMN "cost",
DROP COLUMN "salePrice",
DROP COLUMN "taxPercentage",
DROP COLUMN "taxAmount",
DROP COLUMN "total",
DROP COLUMN "sourceUrl",
ADD COLUMN "additionalServiceCatalogId" TEXT NOT NULL,
ADD COLUMN "serviceCode" TEXT NOT NULL,
ADD COLUMN "serviceName" TEXT NOT NULL,
ADD COLUMN "supplierId" TEXT NOT NULL,
ALTER COLUMN "supplierName" SET NOT NULL,
ADD COLUMN "supplierCostUrl" TEXT,
ADD COLUMN "supplierCost" DECIMAL(18,4) NOT NULL,
ADD COLUMN "supplierCostCurrency" "AdditionalServiceCurrency" NOT NULL,
ALTER COLUMN "marginValue" TYPE DECIMAL(18,4),
ADD COLUMN "marginAmount" DECIMAL(18,4) NOT NULL,
ALTER COLUMN "subtotal" TYPE DECIMAL(18,4),
ADD COLUMN "vatPercentage" DECIMAL(7,4) NOT NULL,
ADD COLUMN "vatAmount" DECIMAL(18,4) NOT NULL,
ADD COLUMN "finalSellingPrice" DECIMAL(18,4) NOT NULL,
ADD COLUMN "commercialNotes" TEXT;

ALTER TABLE "additional_service_order_participants"
ALTER COLUMN "clientId" DROP NOT NULL,
ADD COLUMN "fullName" TEXT NOT NULL,
ADD COLUMN "identification" TEXT NOT NULL,
ADD COLUMN "email" TEXT,
ADD COLUMN "phone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "additional_service_catalogs_id_tenantId_key"
ON "additional_service_catalogs"("id", "tenantId");

CREATE UNIQUE INDEX "suppliers_id_tenantId_key"
ON "suppliers"("id", "tenantId");

CREATE UNIQUE INDEX "additional_service_orders_id_tenantId_key"
ON "additional_service_orders"("id", "tenantId");

CREATE UNIQUE INDEX "additional_service_orders_tenantId_idempotencyKey_key"
ON "additional_service_orders"("tenantId", "idempotencyKey");

CREATE UNIQUE INDEX "additional_service_order_lines_id_tenantId_key"
ON "additional_service_order_lines"("id", "tenantId");

CREATE INDEX "additional_service_order_lines_additionalServiceCatalogId_idx"
ON "additional_service_order_lines"("additionalServiceCatalogId");

CREATE INDEX "additional_service_order_lines_supplierId_idx"
ON "additional_service_order_lines"("supplierId");

CREATE INDEX "additional_service_order_lines_serviceCode_idx"
ON "additional_service_order_lines"("serviceCode");

CREATE INDEX "additional_service_orders_internalBookingId_idx"
ON "additional_service_orders"("internalBookingId");

-- AddForeignKey
ALTER TABLE "additional_service_order_lines"
ADD CONSTRAINT "additional_service_order_lines_additionalServiceCatalogId_fkey"
FOREIGN KEY ("additionalServiceCatalogId", "tenantId")
REFERENCES "additional_service_catalogs"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "additional_service_orders"
ADD CONSTRAINT "additional_service_orders_internalBookingId_fkey"
FOREIGN KEY ("internalBookingId")
REFERENCES "internal_tour_bookings"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "additional_service_order_lines"
ADD CONSTRAINT "additional_service_order_lines_supplierId_fkey"
FOREIGN KEY ("supplierId", "tenantId")
REFERENCES "suppliers"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "additional_service_orders"
ADD CONSTRAINT "additional_service_orders_travelPackageId_fkey"
FOREIGN KEY ("travelPackageId")
REFERENCES "TravelPackage"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "additional_service_order_lines"
ADD CONSTRAINT "additional_service_order_lines_orderId_fkey"
FOREIGN KEY ("orderId", "tenantId")
REFERENCES "additional_service_orders"("id", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "additional_service_order_participants"
ADD CONSTRAINT "additional_service_order_participants_lineId_fkey"
FOREIGN KEY ("lineId", "tenantId")
REFERENCES "additional_service_order_lines"("id", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "additional_service_order_participants"
ADD CONSTRAINT "additional_service_order_participants_clientId_fkey"
FOREIGN KEY ("clientId")
REFERENCES "Client"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
