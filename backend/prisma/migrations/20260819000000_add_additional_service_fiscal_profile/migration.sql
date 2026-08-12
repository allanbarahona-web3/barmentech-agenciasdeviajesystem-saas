CREATE TABLE "additional_service_fiscal_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "additionalServiceCatalogId" TEXT NOT NULL,
    "cabysCode" VARCHAR(13) NOT NULL,
    "unitOfMeasureCode" VARCHAR(20) NOT NULL,
    "taxCode" VARCHAR(4),
    "taxRateCode" VARCHAR(4),
    "taxPercentage" DECIMAL(7,4),
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "additional_service_fiscal_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "additional_service_fiscal_profiles_additionalServiceCatalogId_tenantId_key" ON "additional_service_fiscal_profiles"("additionalServiceCatalogId", "tenantId");

ALTER TABLE "additional_service_fiscal_profiles" ADD CONSTRAINT "additional_service_fiscal_profiles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "additional_service_fiscal_profiles" ADD CONSTRAINT "additional_service_fiscal_profiles_additionalServiceCatalogId_tenantId_fkey" FOREIGN KEY ("additionalServiceCatalogId", "tenantId") REFERENCES "additional_service_catalogs"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
