-- AddColumn minReservation to InternalTrip
ALTER TABLE "internal_trips" ADD COLUMN "minReservation" DECIMAL(12,2);
