-- CreateEnum
CREATE TYPE "AdditionalServiceType" AS ENUM (
    'SEAT',
    'BAGGAGE',
    'TOUR',
    'ACCOMMODATION',
    'LODGING',
    'INSURANCE',
    'TRAVEL_EXTENSION',
    'ITINERARY_CHANGE',
    'TRANSPORTATION',
    'OTHER'
);

-- CreateEnum
CREATE TYPE "AdditionalServiceOrderStatus" AS ENUM (
    'DRAFT',
    'REQUESTED',
    'CONFIRMED',
    'CANCELLED'
);

-- CreateEnum
CREATE TYPE "AdditionalServiceCurrency" AS ENUM ('USD', 'CRC');

-- CreateEnum
CREATE TYPE "AdditionalServiceMarginType" AS ENUM ('FIXED', 'PERCENTAGE');

-- CreateTable
CREATE TABLE "additional_service_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "travelPackageId" TEXT,
    "internalTripId" TEXT,
    "status" "AdditionalServiceOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "additional_service_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "additional_service_order_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "serviceType" "AdditionalServiceType" NOT NULL,
    "detail" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "serviceDate" TIMESTAMP(3),
    "quantity" INTEGER NOT NULL,
    "currency" "AdditionalServiceCurrency" NOT NULL,
    "exchangeRate" DECIMAL(14,6) NOT NULL,
    "cost" DECIMAL(14,2) NOT NULL,
    "salePrice" DECIMAL(14,2) NOT NULL,
    "marginType" "AdditionalServiceMarginType" NOT NULL,
    "marginValue" DECIMAL(14,4) NOT NULL,
    "taxPercentage" DECIMAL(7,4) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "supplierName" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "additional_service_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "additional_service_order_participants" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "additional_service_order_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "additional_service_orders_tenantId_orderNumber_key"
ON "additional_service_orders"("tenantId", "orderNumber");

-- CreateIndex
CREATE INDEX "additional_service_orders_tenantId_idx"
ON "additional_service_orders"("tenantId");

-- CreateIndex
CREATE INDEX "additional_service_orders_travelPackageId_idx"
ON "additional_service_orders"("travelPackageId");

-- CreateIndex
CREATE INDEX "additional_service_orders_internalTripId_idx"
ON "additional_service_orders"("internalTripId");

-- CreateIndex
CREATE INDEX "additional_service_orders_status_idx"
ON "additional_service_orders"("status");

-- CreateIndex
CREATE INDEX "additional_service_orders_createdAt_idx"
ON "additional_service_orders"("createdAt");

-- CreateIndex
CREATE INDEX "additional_service_order_lines_tenantId_idx"
ON "additional_service_order_lines"("tenantId");

-- CreateIndex
CREATE INDEX "additional_service_order_lines_orderId_idx"
ON "additional_service_order_lines"("orderId");

-- CreateIndex
CREATE INDEX "additional_service_order_lines_serviceType_idx"
ON "additional_service_order_lines"("serviceType");

-- CreateIndex
CREATE INDEX "additional_service_order_lines_serviceDate_idx"
ON "additional_service_order_lines"("serviceDate");

-- CreateIndex
CREATE UNIQUE INDEX "additional_service_order_participants_line_client_key"
ON "additional_service_order_participants"("lineId", "clientId");

-- CreateIndex
CREATE INDEX "additional_service_order_participants_tenantId_idx"
ON "additional_service_order_participants"("tenantId");

-- CreateIndex
CREATE INDEX "additional_service_order_participants_lineId_idx"
ON "additional_service_order_participants"("lineId");

-- CreateIndex
CREATE INDEX "additional_service_order_participants_clientId_idx"
ON "additional_service_order_participants"("clientId");

-- AddForeignKey
ALTER TABLE "additional_service_orders"
ADD CONSTRAINT "additional_service_orders_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_service_orders"
ADD CONSTRAINT "additional_service_orders_travelPackageId_fkey"
FOREIGN KEY ("travelPackageId") REFERENCES "TravelPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_service_orders"
ADD CONSTRAINT "additional_service_orders_internalTripId_fkey"
FOREIGN KEY ("internalTripId") REFERENCES "internal_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_service_order_lines"
ADD CONSTRAINT "additional_service_order_lines_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_service_order_lines"
ADD CONSTRAINT "additional_service_order_lines_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "additional_service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_service_order_participants"
ADD CONSTRAINT "additional_service_order_participants_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_service_order_participants"
ADD CONSTRAINT "additional_service_order_participants_lineId_fkey"
FOREIGN KEY ("lineId") REFERENCES "additional_service_order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_service_order_participants"
ADD CONSTRAINT "additional_service_order_participants_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
