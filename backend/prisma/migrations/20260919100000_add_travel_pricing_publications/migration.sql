-- TRAVEL-PRICE-01: explicit, immutable travel-price publications from approved Pricing Engine versions.
-- Widening the existing commercial fields preserves PRICING_V1 Decimal(19,5) values without introducing
-- a new currency-rounding policy or losing existing values.

ALTER TABLE "TravelPackage"
ALTER COLUMN "packagePrice" TYPE DECIMAL(19,5);

ALTER TABLE "internal_trips"
ALTER COLUMN "price" TYPE DECIMAL(19,5);

CREATE TABLE "travel_package_pricing_publications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "travelPackageId" TEXT NOT NULL,
    "costingProjectId" TEXT NOT NULL,
    "pricingCalculationVersionId" TEXT NOT NULL,
    "publishedPrice" DECIMAL(19,5) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "commercialFloorPrice" DECIMAL(19,5) NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedByUserId" TEXT NOT NULL,
    "publishedByName" TEXT NOT NULL,

    CONSTRAINT "travel_package_pricing_publications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "travel_package_pricing_publications_price_nonnegative_chk"
      CHECK ("publishedPrice" >= 0 AND "commercialFloorPrice" >= 0)
);

CREATE TABLE "internal_trip_pricing_publications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "internalTripId" TEXT NOT NULL,
    "costingProjectId" TEXT NOT NULL,
    "pricingCalculationVersionId" TEXT NOT NULL,
    "publishedPrice" DECIMAL(19,5) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "commercialFloorPrice" DECIMAL(19,5) NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedByUserId" TEXT NOT NULL,
    "publishedByName" TEXT NOT NULL,

    CONSTRAINT "internal_trip_pricing_publications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "internal_trip_pricing_publications_price_nonnegative_chk"
      CHECK ("publishedPrice" >= 0 AND "commercialFloorPrice" >= 0)
);

CREATE UNIQUE INDEX "pricing_calculation_versions_id_tenant_project_key"
ON "pricing_calculation_versions"("id", "tenantId", "costingProjectId");

CREATE UNIQUE INDEX "travel_package_pricing_publications_id_tenant_key"
ON "travel_package_pricing_publications"("id", "tenantId");

CREATE UNIQUE INDEX "travel_package_pricing_publications_tenant_version_key"
ON "travel_package_pricing_publications"("tenantId", "pricingCalculationVersionId");

CREATE INDEX "travel_package_pricing_publications_history_idx"
ON "travel_package_pricing_publications"("tenantId", "travelPackageId", "publishedAt" DESC, "id" DESC);

CREATE UNIQUE INDEX "internal_trip_pricing_publications_id_tenant_key"
ON "internal_trip_pricing_publications"("id", "tenantId");

CREATE UNIQUE INDEX "internal_trip_pricing_publications_tenant_version_key"
ON "internal_trip_pricing_publications"("tenantId", "pricingCalculationVersionId");

CREATE INDEX "internal_trip_pricing_publications_history_idx"
ON "internal_trip_pricing_publications"("tenantId", "internalTripId", "publishedAt" DESC, "id" DESC);

ALTER TABLE "travel_package_pricing_publications"
ADD CONSTRAINT "travel_package_pricing_publications_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "travel_package_pricing_publications"
ADD CONSTRAINT "travel_package_pricing_publications_travel_tenant_fkey"
FOREIGN KEY ("travelPackageId", "tenantId") REFERENCES "TravelPackage"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "travel_package_pricing_publications"
ADD CONSTRAINT "travel_package_pricing_publications_project_tenant_fkey"
FOREIGN KEY ("costingProjectId", "tenantId") REFERENCES "costing_projects"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "travel_package_pricing_publications"
ADD CONSTRAINT "travel_package_pricing_publications_version_project_tenant_fkey"
FOREIGN KEY ("pricingCalculationVersionId", "tenantId", "costingProjectId")
REFERENCES "pricing_calculation_versions"("id", "tenantId", "costingProjectId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "internal_trip_pricing_publications"
ADD CONSTRAINT "internal_trip_pricing_publications_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "internal_trip_pricing_publications"
ADD CONSTRAINT "internal_trip_pricing_publications_trip_tenant_fkey"
FOREIGN KEY ("internalTripId", "tenantId") REFERENCES "internal_trips"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "internal_trip_pricing_publications"
ADD CONSTRAINT "internal_trip_pricing_publications_project_tenant_fkey"
FOREIGN KEY ("costingProjectId", "tenantId") REFERENCES "costing_projects"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "internal_trip_pricing_publications"
ADD CONSTRAINT "internal_trip_pricing_publications_version_project_tenant_fkey"
FOREIGN KEY ("pricingCalculationVersionId", "tenantId", "costingProjectId")
REFERENCES "pricing_calculation_versions"("id", "tenantId", "costingProjectId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "travel_package_pricing_publications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "travel_package_pricing_publications" FORCE ROW LEVEL SECURITY;
ALTER TABLE "internal_trip_pricing_publications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "internal_trip_pricing_publications" FORCE ROW LEVEL SECURITY;

CREATE POLICY travel_package_pricing_publications_tenant_select ON "travel_package_pricing_publications"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY travel_package_pricing_publications_tenant_insert ON "travel_package_pricing_publications"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY internal_trip_pricing_publications_tenant_select ON "internal_trip_pricing_publications"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY internal_trip_pricing_publications_tenant_insert ON "internal_trip_pricing_publications"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
