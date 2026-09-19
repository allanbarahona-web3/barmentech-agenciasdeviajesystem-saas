-- COST-TRAVEL-01A: immutable, tenant-safe travel adapter links to Cost Engine projects.
-- The application runtime role must not be a superuser and must not have BYPASSRLS.

CREATE UNIQUE INDEX "TravelPackage_id_tenantId_key"
ON "TravelPackage"("id", "tenantId");

CREATE UNIQUE INDEX "internal_trips_id_tenantId_key"
ON "internal_trips"("id", "tenantId");

CREATE TABLE "travel_package_costing_project_links" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "travelPackageId" TEXT NOT NULL,
    "costingProjectId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "travel_package_costing_project_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "internal_trip_costing_project_links" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "internalTripId" TEXT NOT NULL,
    "costingProjectId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_trip_costing_project_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "travel_package_costing_project_links_tenant_package_key"
ON "travel_package_costing_project_links"("tenantId", "travelPackageId");

CREATE UNIQUE INDEX "travel_package_costing_project_links_tenant_project_key"
ON "travel_package_costing_project_links"("tenantId", "costingProjectId");

CREATE UNIQUE INDEX "internal_trip_costing_project_links_tenant_trip_key"
ON "internal_trip_costing_project_links"("tenantId", "internalTripId");

CREATE UNIQUE INDEX "internal_trip_costing_project_links_tenant_project_key"
ON "internal_trip_costing_project_links"("tenantId", "costingProjectId");

ALTER TABLE "travel_package_costing_project_links"
ADD CONSTRAINT "travel_package_costing_project_links_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "travel_package_costing_project_links"
ADD CONSTRAINT "travel_package_costing_project_links_travel_package_tenant_fkey"
FOREIGN KEY ("travelPackageId", "tenantId") REFERENCES "TravelPackage"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "travel_package_costing_project_links"
ADD CONSTRAINT "travel_package_costing_project_links_project_tenant_fkey"
FOREIGN KEY ("costingProjectId", "tenantId") REFERENCES "costing_projects"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "internal_trip_costing_project_links"
ADD CONSTRAINT "internal_trip_costing_project_links_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "internal_trip_costing_project_links"
ADD CONSTRAINT "internal_trip_costing_project_links_internal_trip_tenant_fkey"
FOREIGN KEY ("internalTripId", "tenantId") REFERENCES "internal_trips"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "internal_trip_costing_project_links"
ADD CONSTRAINT "internal_trip_costing_project_links_project_tenant_fkey"
FOREIGN KEY ("costingProjectId", "tenantId") REFERENCES "costing_projects"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "travel_package_costing_project_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "travel_package_costing_project_links" FORCE ROW LEVEL SECURITY;
ALTER TABLE "internal_trip_costing_project_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "internal_trip_costing_project_links" FORCE ROW LEVEL SECURITY;

CREATE POLICY travel_package_costing_project_links_tenant_select ON "travel_package_costing_project_links"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY travel_package_costing_project_links_tenant_insert ON "travel_package_costing_project_links"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY internal_trip_costing_project_links_tenant_select ON "internal_trip_costing_project_links"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY internal_trip_costing_project_links_tenant_insert ON "internal_trip_costing_project_links"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
