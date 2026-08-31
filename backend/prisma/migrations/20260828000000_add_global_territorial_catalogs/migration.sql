CREATE TYPE "TerritorialCatalogReleaseStatus" AS ENUM ('DRAFT', 'VALIDATED', 'ACTIVE', 'RETIRED');

CREATE TABLE "territorial_catalog_releases" (
    "id" TEXT NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "version" VARCHAR(100) NOT NULL,
    "status" "TerritorialCatalogReleaseStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceAuthority" VARCHAR(200) NOT NULL,
    "sourceUrl" VARCHAR(1000),
    "sourcePublishedAt" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "checksumSha256" VARCHAR(64) NOT NULL,
    "originalFilename" VARCHAR(255) NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "territorial_catalog_releases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "territorial_catalog_releases_country_code_check"
        CHECK ("countryCode" ~ '^[A-Z]{2}$'),
    CONSTRAINT "territorial_catalog_releases_checksum_check"
        CHECK ("checksumSha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "territorial_catalog_releases_effective_dates_check"
        CHECK ("effectiveTo" IS NULL OR "effectiveFrom" IS NULL OR "effectiveTo" >= "effectiveFrom")
);

CREATE TABLE "territorial_subdivisions" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "parentId" TEXT,
    "administrativeLevel" INTEGER NOT NULL,
    "subdivisionTypeCode" VARCHAR(30) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "fullCode" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "searchText" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceEffectiveFrom" TIMESTAMP(3),
    "sourceEffectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "territorial_subdivisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "territorial_subdivisions_level_check"
        CHECK ("administrativeLevel" > 0),
    CONSTRAINT "territorial_subdivisions_type_nonempty_check"
        CHECK (btrim("subdivisionTypeCode") <> ''),
    CONSTRAINT "territorial_subdivisions_code_nonempty_check"
        CHECK (btrim("code") <> ''),
    CONSTRAINT "territorial_subdivisions_full_code_nonempty_check"
        CHECK (btrim("fullCode") <> ''),
    CONSTRAINT "territorial_subdivisions_name_nonempty_check"
        CHECK (btrim("name") <> ''),
    CONSTRAINT "territorial_subdivisions_search_nonempty_check"
        CHECK (btrim("searchText") <> ''),
    CONSTRAINT "territorial_subdivisions_effective_dates_check"
        CHECK ("sourceEffectiveTo" IS NULL OR "sourceEffectiveFrom" IS NULL OR "sourceEffectiveTo" >= "sourceEffectiveFrom")
);

CREATE UNIQUE INDEX "territorial_catalog_releases_country_version_key"
ON "territorial_catalog_releases"("countryCode", "version");

CREATE UNIQUE INDEX "territorial_catalog_releases_country_checksum_key"
ON "territorial_catalog_releases"("countryCode", "checksumSha256");

CREATE INDEX "territorial_catalog_releases_country_status_idx"
ON "territorial_catalog_releases"("countryCode", "status");

CREATE UNIQUE INDEX "territorial_catalog_releases_one_active_key"
ON "territorial_catalog_releases"("countryCode")
WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "territorial_subdivisions_release_full_code_key"
ON "territorial_subdivisions"("releaseId", "fullCode");

CREATE UNIQUE INDEX "territorial_subdivisions_id_release_key"
ON "territorial_subdivisions"("id", "releaseId");

CREATE INDEX "territorial_subdivisions_root_read_idx"
ON "territorial_subdivisions"("releaseId", "parentId", "isActive", "administrativeLevel", "fullCode");

CREATE INDEX "territorial_subdivisions_child_read_idx"
ON "territorial_subdivisions"("releaseId", "parentId", "isActive", "fullCode");

ALTER TABLE "territorial_subdivisions"
ADD CONSTRAINT "territorial_subdivisions_release_fkey"
FOREIGN KEY ("releaseId") REFERENCES "territorial_catalog_releases"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "territorial_subdivisions"
ADD CONSTRAINT "territorial_subdivisions_parent_release_fkey"
FOREIGN KEY ("parentId", "releaseId") REFERENCES "territorial_subdivisions"("id", "releaseId")
ON DELETE RESTRICT ON UPDATE CASCADE;
