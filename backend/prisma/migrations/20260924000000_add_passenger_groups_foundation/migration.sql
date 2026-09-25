-- PASSENGER-GROUPS-G1-DB-01: tenant-scoped organizational groups for international TravelPackage participants.

CREATE TYPE "PassengerGroupStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- Enables a composite member FK that proves a participant belongs to the same
-- TravelPackage as its PassengerGroup.
CREATE UNIQUE INDEX "travel_package_participants_id_tenant_travel_package_key"
ON "travel_package_participants"("id", "tenantId", "travelPackageId");

CREATE TABLE "passenger_groups" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "travelPackageId" TEXT NOT NULL,
    "additionalServiceCatalogId" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "notes" TEXT,
    "status" "PassengerGroupStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "passenger_groups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "passenger_groups_service_code_nonempty_chk"
      CHECK (char_length(btrim("serviceCode")) > 0),
    CONSTRAINT "passenger_groups_service_name_nonempty_chk"
      CHECK (char_length(btrim("serviceName")) > 0),
    CONSTRAINT "passenger_groups_name_nonempty_chk"
      CHECK (char_length(btrim("name")) > 0)
);

CREATE UNIQUE INDEX "passenger_groups_id_tenant_travel_package_key"
ON "passenger_groups"("id", "tenantId", "travelPackageId");

CREATE INDEX "passenger_groups_tenant_travel_status_created_idx"
ON "passenger_groups"("tenantId", "travelPackageId", "status", "createdAt" DESC, "id" DESC);

CREATE INDEX "passenger_groups_tenant_travel_catalog_idx"
ON "passenger_groups"("tenantId", "travelPackageId", "additionalServiceCatalogId");

CREATE TABLE "passenger_group_members" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "travelPackageId" TEXT NOT NULL,
    "passengerGroupId" TEXT NOT NULL,
    "travelPackageParticipantId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passenger_group_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "passenger_group_members_tenant_group_participant_key"
ON "passenger_group_members"("tenantId", "passengerGroupId", "travelPackageParticipantId");

CREATE INDEX "passenger_group_members_tenant_participant_travel_idx"
ON "passenger_group_members"("tenantId", "travelPackageParticipantId", "travelPackageId");

ALTER TABLE "passenger_groups"
ADD CONSTRAINT "passenger_groups_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "passenger_groups"
ADD CONSTRAINT "passenger_groups_travel_package_tenant_fkey"
FOREIGN KEY ("travelPackageId", "tenantId") REFERENCES "TravelPackage"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "passenger_groups"
ADD CONSTRAINT "passenger_groups_catalog_tenant_fkey"
FOREIGN KEY ("additionalServiceCatalogId", "tenantId") REFERENCES "additional_service_catalogs"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "passenger_group_members"
ADD CONSTRAINT "passenger_group_members_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "passenger_group_members"
ADD CONSTRAINT "passenger_group_members_group_tenant_travel_fkey"
FOREIGN KEY ("passengerGroupId", "tenantId", "travelPackageId")
REFERENCES "passenger_groups"("id", "tenantId", "travelPackageId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "passenger_group_members"
ADD CONSTRAINT "passenger_group_members_participant_tenant_travel_fkey"
FOREIGN KEY ("travelPackageParticipantId", "tenantId", "travelPackageId")
REFERENCES "travel_package_participants"("id", "tenantId", "travelPackageId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "passenger_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "passenger_groups" FORCE ROW LEVEL SECURITY;
ALTER TABLE "passenger_group_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "passenger_group_members" FORCE ROW LEVEL SECURITY;

CREATE POLICY passenger_groups_tenant_select ON "passenger_groups"
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY passenger_groups_tenant_insert ON "passenger_groups"
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY passenger_groups_tenant_update ON "passenger_groups"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY passenger_groups_tenant_delete ON "passenger_groups"
  FOR DELETE USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY passenger_group_members_tenant_select ON "passenger_group_members"
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY passenger_group_members_tenant_insert ON "passenger_group_members"
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY passenger_group_members_tenant_update ON "passenger_group_members"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY passenger_group_members_tenant_delete ON "passenger_group_members"
  FOR DELETE USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
