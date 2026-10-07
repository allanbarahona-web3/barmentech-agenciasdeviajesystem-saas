-- O4.3A: preserve the existing TravelPackage aggregate while making the
-- requirement its future source-neutral scope owner. No standalone work is
-- materialized by this migration.

CREATE TYPE "OperationalScopeType" AS ENUM (
    'TRAVEL_PACKAGE',
    'STANDALONE_CUSTOMER'
);

ALTER TABLE "operational_requirements"
ADD COLUMN "scopeType" "OperationalScopeType",
ADD COLUMN "customerId" TEXT;

-- All existing operational work is TravelPackage-backed.
UPDATE "operational_requirements"
SET "scopeType" = 'TRAVEL_PACKAGE'
WHERE "scopeType" IS NULL;

ALTER TABLE "operational_requirements"
ALTER COLUMN "scopeType" SET NOT NULL,
ALTER COLUMN "scopeType" SET DEFAULT 'TRAVEL_PACKAGE',
ALTER COLUMN "travelPackageId" DROP NOT NULL,
ADD CONSTRAINT "operational_requirements_scope_context_chk"
  CHECK (
    ("scopeType" = 'TRAVEL_PACKAGE' AND "travelPackageId" IS NOT NULL AND "customerId" IS NULL)
    OR
    ("scopeType" = 'STANDALONE_CUSTOMER' AND "travelPackageId" IS NULL AND "customerId" IS NOT NULL)
  );

-- This future-facing key is additive. Existing package-based keys and all
-- package-containing child foreign keys remain in place for O4.3A.
CREATE UNIQUE INDEX "operational_requirements_id_tenant_key"
ON "operational_requirements"("id", "tenantId");

ALTER TABLE "operational_requirements"
ADD CONSTRAINT "operational_requirements_customer_tenant_fkey"
FOREIGN KEY ("customerId", "tenantId") REFERENCES "Client"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- A future migration may replace the package-qualified source identity with:
-- CREATE UNIQUE INDEX ... ON "operational_requirements"(
--   "tenantId", "sourceType", "sourceId", "sourceLineId"
-- ) WHERE "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL
--     AND "sourceLineId" IS NOT NULL AND "sourceType" <> 'MANUAL';
-- Before doing so, manually verify production history has no duplicates:
-- SELECT "tenantId", "sourceType", "sourceId", "sourceLineId", COUNT(*)
-- FROM "operational_requirements"
-- WHERE "sourceType" <> 'MANUAL' AND "sourceId" IS NOT NULL AND "sourceLineId" IS NOT NULL
-- GROUP BY "tenantId", "sourceType", "sourceId", "sourceLineId"
-- HAVING COUNT(*) > 1;
