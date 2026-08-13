CREATE TYPE "FiscalCatalogType" AS ENUM ('CABYS', 'ELECTRONIC_INVOICE_CODING');
CREATE TYPE "FiscalCatalogReleaseStatus" AS ENUM ('DRAFT', 'VALIDATED', 'ACTIVE', 'RETIRED');

CREATE TABLE "fiscal_catalog_releases" (
    "id" TEXT NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "catalogType" "FiscalCatalogType" NOT NULL,
    "version" VARCHAR(100) NOT NULL,
    "status" "FiscalCatalogReleaseStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceAuthority" VARCHAR(200) NOT NULL,
    "sourceUrl" VARCHAR(1000),
    "sourcePublishedAt" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "checksumSha256" VARCHAR(64) NOT NULL,
    "originalFilename" VARCHAR(255) NOT NULL,
    "createdByUserId" TEXT,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_catalog_releases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fiscal_catalog_releases_country_code_check"
        CHECK ("countryCode" ~ '^[A-Z]{2}$'),
    CONSTRAINT "fiscal_catalog_releases_checksum_check"
        CHECK ("checksumSha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "fiscal_catalog_releases_effective_dates_check"
        CHECK ("effectiveTo" IS NULL OR "effectiveFrom" IS NULL OR "effectiveTo" >= "effectiveFrom")
);

CREATE TABLE "fiscal_cabys_entries" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "code" VARCHAR(13) NOT NULL,
    "description" TEXT NOT NULL,
    "searchText" TEXT NOT NULL,
    "referenceTaxPercentage" DECIMAL(7,4),
    "includesText" TEXT,
    "excludesText" TEXT,
    "category1Code" VARCHAR(1),
    "category1Description" TEXT,
    "category2Code" VARCHAR(2),
    "category2Description" TEXT,
    "category3Code" VARCHAR(3),
    "category3Description" TEXT,
    "category4Code" VARCHAR(4),
    "category4Description" TEXT,
    "category5Code" VARCHAR(5),
    "category5Description" TEXT,
    "category6Code" VARCHAR(7),
    "category6Description" TEXT,
    "category7Code" VARCHAR(9),
    "category7Description" TEXT,
    "category8Code" VARCHAR(11),
    "category8Description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceCreatedAt" TIMESTAMP(3),
    "sourceEffectiveFrom" TIMESTAMP(3),
    "sourceDeletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_cabys_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fiscal_cabys_entries_code_check"
        CHECK ("code" ~ '^[0-9]{13}$'),
    CONSTRAINT "fiscal_cabys_entries_tax_percentage_check"
        CHECK ("referenceTaxPercentage" IS NULL OR "referenceTaxPercentage" >= 0),
    CONSTRAINT "fiscal_cabys_entries_deleted_inactive_check"
        CHECK ("sourceDeletedAt" IS NULL OR "isActive" = false)
);

CREATE TABLE "fiscal_unit_of_measure_entries" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "code" VARCHAR(15) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_unit_of_measure_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fiscal_unit_entries_code_nonempty_check"
        CHECK (btrim("code") <> '')
);

CREATE TABLE "fiscal_tax_entries" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "code" VARCHAR(2) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_tax_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fiscal_tax_entries_code_check"
        CHECK ("code" ~ '^[0-9]{2}$')
);

CREATE TABLE "fiscal_tax_rate_entries" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "taxEntryId" TEXT NOT NULL,
    "code" VARCHAR(2) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "percentage" DECIMAL(7,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_tax_rate_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fiscal_tax_rate_entries_code_check"
        CHECK ("code" ~ '^[0-9]{2}$'),
    CONSTRAINT "fiscal_tax_rate_entries_percentage_check"
        CHECK ("percentage" >= 0)
);

CREATE UNIQUE INDEX "fiscal_catalog_releases_country_type_version_key"
ON "fiscal_catalog_releases"("countryCode", "catalogType", "version");

CREATE UNIQUE INDEX "fiscal_catalog_releases_country_type_checksum_key"
ON "fiscal_catalog_releases"("countryCode", "catalogType", "checksumSha256");

CREATE INDEX "fiscal_catalog_releases_country_type_status_idx"
ON "fiscal_catalog_releases"("countryCode", "catalogType", "status");

CREATE UNIQUE INDEX "fiscal_catalog_releases_one_active_key"
ON "fiscal_catalog_releases"("countryCode", "catalogType")
WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "fiscal_cabys_entries_release_code_key"
ON "fiscal_cabys_entries"("releaseId", "code");

CREATE INDEX "fiscal_cabys_entries_release_active_code_idx"
ON "fiscal_cabys_entries"("releaseId", "isActive", "code");

CREATE UNIQUE INDEX "fiscal_unit_entries_release_code_key"
ON "fiscal_unit_of_measure_entries"("releaseId", "code");

CREATE INDEX "fiscal_unit_entries_release_active_code_idx"
ON "fiscal_unit_of_measure_entries"("releaseId", "isActive", "code");

CREATE UNIQUE INDEX "fiscal_tax_entries_release_code_key"
ON "fiscal_tax_entries"("releaseId", "code");

CREATE UNIQUE INDEX "fiscal_tax_entries_id_release_key"
ON "fiscal_tax_entries"("id", "releaseId");

CREATE INDEX "fiscal_tax_entries_release_active_code_idx"
ON "fiscal_tax_entries"("releaseId", "isActive", "code");

CREATE UNIQUE INDEX "fiscal_tax_rate_entries_release_tax_code_key"
ON "fiscal_tax_rate_entries"("releaseId", "taxEntryId", "code");

CREATE INDEX "fiscal_tax_rate_entries_release_tax_active_idx"
ON "fiscal_tax_rate_entries"("releaseId", "taxEntryId", "isActive");

ALTER TABLE "fiscal_catalog_releases"
ADD CONSTRAINT "fiscal_catalog_releases_created_by_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fiscal_cabys_entries"
ADD CONSTRAINT "fiscal_cabys_entries_release_fkey"
FOREIGN KEY ("releaseId") REFERENCES "fiscal_catalog_releases"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fiscal_unit_of_measure_entries"
ADD CONSTRAINT "fiscal_unit_entries_release_fkey"
FOREIGN KEY ("releaseId") REFERENCES "fiscal_catalog_releases"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fiscal_tax_entries"
ADD CONSTRAINT "fiscal_tax_entries_release_fkey"
FOREIGN KEY ("releaseId") REFERENCES "fiscal_catalog_releases"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fiscal_tax_rate_entries"
ADD CONSTRAINT "fiscal_tax_rate_entries_release_fkey"
FOREIGN KEY ("releaseId") REFERENCES "fiscal_catalog_releases"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fiscal_tax_rate_entries"
ADD CONSTRAINT "fiscal_tax_rate_entries_tax_release_fkey"
FOREIGN KEY ("taxEntryId", "releaseId") REFERENCES "fiscal_tax_entries"("id", "releaseId")
ON DELETE RESTRICT ON UPDATE CASCADE;
