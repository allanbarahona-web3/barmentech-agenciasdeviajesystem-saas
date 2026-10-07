-- O4.3C: permit standalone requirements and their future generic aggregate
-- descendants. Existing TravelPackage rows retain their values, package FKs,
-- package indexes, and package-composite hierarchy constraints.

ALTER TABLE "operational_fulfillments"
ALTER COLUMN "travelPackageId" DROP NOT NULL;

ALTER TABLE "operational_purchases"
ALTER COLUMN "travelPackageId" DROP NOT NULL;

ALTER TABLE "operational_evidence"
ALTER COLUMN "travelPackageId" DROP NOT NULL;

-- Existing rows are all TRAVEL_PACKAGE scope after O4.3A. This index gives
-- standalone source materialization null-safe, source-authoritative
-- idempotency without depending on nullable travelPackageId semantics.
CREATE UNIQUE INDEX "operational_requirements_standalone_source_identity_unique_idx"
ON "operational_requirements"("tenantId", "sourceType", "sourceId", "sourceLineId")
WHERE "scopeType" = 'STANDALONE_CUSTOMER'
  AND "sourceType" IS NOT NULL
  AND "sourceId" IS NOT NULL
  AND "sourceLineId" IS NOT NULL
  AND "sourceType" <> 'MANUAL';

-- The global source-identity index remains deferred until the Phase A manual
-- duplicate audit is performed. Passenger tables are intentionally unchanged.
