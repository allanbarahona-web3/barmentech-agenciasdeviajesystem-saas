-- TRAVEL-PRICE-02: a new InternalTrip can exist before an approved Pricing
-- calculation is explicitly published. Existing manual prices are unchanged.
ALTER TABLE "internal_trips"
  ALTER COLUMN "price" DROP NOT NULL;
