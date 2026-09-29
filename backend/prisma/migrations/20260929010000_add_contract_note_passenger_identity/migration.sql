-- OPERATIONS-O1.2-DB: nullable stable passenger identity context for ContractNote.
-- Legacy passenger tuple fields remain authoritative for legacy rows and are
-- intentionally not backfilled in this foundation migration.

ALTER TABLE "contract_notes"
ADD COLUMN "clientId" TEXT,
ADD COLUMN "travelPackageId" TEXT;

-- Supports a single, deterministic batch read for visible TravelPackage
-- participants, filtered by note status and ordered by newest note then id.
CREATE INDEX "contract_notes_tenant_travel_client_status_created_id_idx"
ON "contract_notes"(
    "tenantId",
    "travelPackageId",
    "clientId",
    "status",
    "createdAt" DESC,
    "id" DESC
);

ALTER TABLE "contract_notes"
ADD CONSTRAINT "contract_notes_client_tenant_fkey"
FOREIGN KEY ("clientId", "tenantId") REFERENCES "Client"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contract_notes"
ADD CONSTRAINT "contract_notes_travel_package_tenant_fkey"
FOREIGN KEY ("travelPackageId", "tenantId") REFERENCES "TravelPackage"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- When a note is TravelPackage-scoped, this nullable composite FK proves that
-- its package is exactly the package on its Contract and belongs to the same tenant.
-- PostgreSQL skips this check for legacy/non-TravelPackage notes with a NULL package.
ALTER TABLE "contract_notes"
ADD CONSTRAINT "contract_notes_contract_tenant_travel_fkey"
FOREIGN KEY ("contractId", "tenantId", "travelPackageId")
REFERENCES "Contract"("id", "tenantId", "travelPackageId")
ON DELETE CASCADE ON UPDATE CASCADE;
