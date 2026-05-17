-- ========================================
-- INTERNAL TOURISM MODELS
-- ========================================

-- Add TransportType enum
CREATE TYPE "TransportType" AS ENUM ('AIR', 'BUS', 'PRIVATE', 'CRUISE', 'WALKING', 'MIXED');

-- CreateTable "internal_trips"
CREATE TABLE "internal_trips" (
    "id" TEXT NOT NULL,
    "tripCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "description" TEXT,
    "departureDate" TIMESTAMP(3) NOT NULL,
    "returnDate" TIMESTAMP(3) NOT NULL,
    "departureTime" TEXT,
    "returnTime" TEXT,
    "capacity" INTEGER NOT NULL,
    "occupiedSlots" INTEGER NOT NULL DEFAULT 0,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CRC',
    "transportType" "TransportType" NOT NULL,
    "itinerary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "internal_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable "internal_tour_bookings"
CREATE TABLE "internal_tour_bookings" (
    "id" TEXT NOT NULL,
    "bookingCode" TEXT NOT NULL,
    "internalTripId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "participantCount" INTEGER NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CRC',
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pendingAmount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "internal_tour_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable "internal_tour_invoices"
CREATE TABLE "internal_tour_invoices" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pendingAmount" DECIMAL(12,2) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentDueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "internal_tour_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "internal_trips_tripCode_key" ON "internal_trips"("tripCode");

-- CreateIndex
CREATE INDEX "internal_trips_departureDate_idx" ON "internal_trips"("departureDate");

-- CreateIndex
CREATE INDEX "internal_trips_tenantId_idx" ON "internal_trips"("tenantId");

-- CreateIndex
CREATE INDEX "internal_trips_status_idx" ON "internal_trips"("status");

-- CreateIndex
CREATE INDEX "internal_trips_tripCode_idx" ON "internal_trips"("tripCode");

-- CreateIndex
CREATE UNIQUE INDEX "internal_tour_bookings_bookingCode_key" ON "internal_tour_bookings"("bookingCode");

-- CreateIndex
CREATE INDEX "internal_tour_bookings_internalTripId_idx" ON "internal_tour_bookings"("internalTripId");

-- CreateIndex
CREATE INDEX "internal_tour_bookings_clientId_idx" ON "internal_tour_bookings"("clientId");

-- CreateIndex
CREATE INDEX "internal_tour_bookings_tenantId_idx" ON "internal_tour_bookings"("tenantId");

-- CreateIndex
CREATE INDEX "internal_tour_bookings_status_idx" ON "internal_tour_bookings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "internal_tour_bookings_internalTripId_clientId_tenantId_key" ON "internal_tour_bookings"("internalTripId", "clientId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "internal_tour_invoices_bookingId_key" ON "internal_tour_invoices"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "internal_tour_invoices_invoiceNumber_key" ON "internal_tour_invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "internal_tour_invoices_bookingId_idx" ON "internal_tour_invoices"("bookingId");

-- CreateIndex
CREATE INDEX "internal_tour_invoices_tenantId_idx" ON "internal_tour_invoices"("tenantId");

-- AddForeignKey
ALTER TABLE "internal_trips" ADD CONSTRAINT "internal_trips_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_tour_bookings" ADD CONSTRAINT "internal_tour_bookings_internalTripId_fkey" FOREIGN KEY ("internalTripId") REFERENCES "internal_trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_tour_bookings" ADD CONSTRAINT "internal_tour_bookings_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_tour_bookings" ADD CONSTRAINT "internal_tour_bookings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_tour_invoices" ADD CONSTRAINT "internal_tour_invoices_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "internal_tour_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_tour_invoices" ADD CONSTRAINT "internal_tour_invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Update BillingPayment table: Make contractId optional and add internalTourBookingId
ALTER TABLE "BillingPayment" ALTER COLUMN "contractId" DROP NOT NULL;
ALTER TABLE "BillingPayment" ADD COLUMN "internalTourBookingId" TEXT;
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_internalTourBookingId_fkey" FOREIGN KEY ("internalTourBookingId") REFERENCES "internal_tour_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "BillingPayment_internalTourBookingId_idx" ON "BillingPayment"("internalTourBookingId");
