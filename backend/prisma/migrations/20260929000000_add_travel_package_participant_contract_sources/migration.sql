-- OPERATIONS-O1.1-DB: Contract-to-TravelPackageParticipant provenance foundation.
-- Existing Contract and TravelPackageParticipant records are intentionally not
-- backfilled here. A later controlled migration can insert only exact,
-- unambiguous client-ID matches from Contract payload snapshots.

-- Enables a Contract provenance FK that proves tenant and TravelPackage scope.
CREATE UNIQUE INDEX "Contract_id_tenantId_travelPackageId_key"
ON "Contract"("id", "tenantId", "travelPackageId");

CREATE TABLE "travel_package_participant_contract_sources" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "travelPackageId" TEXT NOT NULL,
    "travelPackageParticipantId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "sourceRole" "TravelPackageParticipantRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "travel_package_participant_contract_sources_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tp_participant_contract_sources_tenant_contract_participant_key"
ON "travel_package_participant_contract_sources"("tenantId", "contractId", "travelPackageParticipantId");

-- Supports one bounded provenance batch read for a visible TravelPackage roster page.
CREATE INDEX "tp_participant_contract_sources_tenant_travel_participant_idx"
ON "travel_package_participant_contract_sources"("tenantId", "travelPackageId", "travelPackageParticipantId");

ALTER TABLE "travel_package_participant_contract_sources"
ADD CONSTRAINT "travel_package_participant_contract_sources_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "travel_package_participant_contract_sources"
ADD CONSTRAINT "tp_participant_contract_sources_travel_tenant_fkey"
FOREIGN KEY ("travelPackageId", "tenantId") REFERENCES "TravelPackage"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "travel_package_participant_contract_sources"
ADD CONSTRAINT "tp_participant_contract_sources_participant_tenant_travel_fkey"
FOREIGN KEY ("travelPackageParticipantId", "tenantId", "travelPackageId")
REFERENCES "travel_package_participants"("id", "tenantId", "travelPackageId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "travel_package_participant_contract_sources"
ADD CONSTRAINT "tp_participant_contract_sources_contract_tenant_travel_fkey"
FOREIGN KEY ("contractId", "tenantId", "travelPackageId")
REFERENCES "Contract"("id", "tenantId", "travelPackageId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "travel_package_participant_contract_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "travel_package_participant_contract_sources" FORCE ROW LEVEL SECURITY;

CREATE POLICY travel_package_participant_contract_sources_tenant_select
ON "travel_package_participant_contract_sources"
FOR SELECT USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY travel_package_participant_contract_sources_tenant_insert
ON "travel_package_participant_contract_sources"
FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY travel_package_participant_contract_sources_tenant_update
ON "travel_package_participant_contract_sources"
FOR UPDATE
USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY travel_package_participant_contract_sources_tenant_delete
ON "travel_package_participant_contract_sources"
FOR DELETE USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
