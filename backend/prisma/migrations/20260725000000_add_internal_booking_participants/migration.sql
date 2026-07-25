-- CreateEnum
CREATE TYPE "InternalTourBookingParticipantRole" AS ENUM (
    'HOLDER',
    'COMPANION',
    'MINOR'
);

-- CreateTable
CREATE TABLE "internal_tour_booking_participants" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "role" "InternalTourBookingParticipantRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_tour_booking_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "internal_tour_booking_participants_bookingId_clientId_key"
ON "internal_tour_booking_participants"("bookingId", "clientId");

-- CreateIndex
CREATE INDEX "internal_tour_booking_participants_tenantId_idx"
ON "internal_tour_booking_participants"("tenantId");

-- CreateIndex
CREATE INDEX "internal_tour_booking_participants_bookingId_idx"
ON "internal_tour_booking_participants"("bookingId");

-- CreateIndex
CREATE INDEX "internal_tour_booking_participants_clientId_idx"
ON "internal_tour_booking_participants"("clientId");

-- CreateIndex
CREATE INDEX "internal_tour_booking_participants_role_idx"
ON "internal_tour_booking_participants"("role");

-- AddForeignKey
ALTER TABLE "internal_tour_booking_participants"
ADD CONSTRAINT "internal_tour_booking_participants_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_tour_booking_participants"
ADD CONSTRAINT "internal_tour_booking_participants_bookingId_fkey"
FOREIGN KEY ("bookingId") REFERENCES "internal_tour_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_tour_booking_participants"
ADD CONSTRAINT "internal_tour_booking_participants_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill the authoritative holder reference already present on legacy bookings.
-- Additional historical identities cannot be inferred from participantCount.
INSERT INTO "internal_tour_booking_participants" (
    "id",
    "tenantId",
    "bookingId",
    "clientId",
    "role",
    "createdAt"
)
SELECT
    'legacy-holder-' || booking."id",
    booking."tenantId",
    booking."id",
    booking."clientId",
    'HOLDER'::"InternalTourBookingParticipantRole",
    booking."createdAt"
FROM "internal_tour_bookings" AS booking;
