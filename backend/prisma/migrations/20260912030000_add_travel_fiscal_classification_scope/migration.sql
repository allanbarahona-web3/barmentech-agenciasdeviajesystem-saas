CREATE TYPE "AdditionalServiceCatalogUsageType" AS ENUM (
    'ADDITIONAL_SERVICE',
    'TRAVEL_PACKAGE',
    'INTERNAL_TRIP'
);

CREATE TABLE "additional_service_catalog_usages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "usage" "AdditionalServiceCatalogUsageType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "additional_service_catalog_usages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "additional_service_catalog_usages_tenant_catalog_usage_key"
ON "additional_service_catalog_usages"("tenantId", "catalogId", "usage");

CREATE INDEX "additional_service_catalog_usages_tenant_usage_idx"
ON "additional_service_catalog_usages"("tenantId", "usage");

ALTER TABLE "additional_service_catalog_usages"
ADD CONSTRAINT "additional_service_catalog_usages_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "additional_service_catalog_usages"
ADD CONSTRAINT "additional_service_catalog_usages_catalog_tenant_fkey"
FOREIGN KEY ("catalogId", "tenantId")
REFERENCES "additional_service_catalogs"("id", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "additional_service_catalog_usages" (
    "id",
    "tenantId",
    "catalogId",
    "usage"
)
SELECT
    "id" || ':ADDITIONAL_SERVICE',
    "tenantId",
    "id",
    'ADDITIONAL_SERVICE'::"AdditionalServiceCatalogUsageType"
FROM "additional_service_catalogs"
ON CONFLICT ("tenantId", "catalogId", "usage") DO NOTHING;

ALTER TABLE "TravelPackage"
ADD COLUMN "fiscalClassificationCatalogId" TEXT;

CREATE INDEX "travel_packages_tenant_fiscal_classification_idx"
ON "TravelPackage"("tenantId", "fiscalClassificationCatalogId");

ALTER TABLE "TravelPackage"
ADD CONSTRAINT "travel_packages_fiscal_classification_tenant_fkey"
FOREIGN KEY ("fiscalClassificationCatalogId", "tenantId")
REFERENCES "additional_service_catalogs"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "internal_trips"
ADD COLUMN "fiscalClassificationCatalogId" TEXT;

CREATE INDEX "internal_trips_tenant_fiscal_classification_idx"
ON "internal_trips"("tenantId", "fiscalClassificationCatalogId");

ALTER TABLE "internal_trips"
ADD CONSTRAINT "internal_trips_fiscal_classification_tenant_fkey"
FOREIGN KEY ("fiscalClassificationCatalogId", "tenantId")
REFERENCES "additional_service_catalogs"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;
