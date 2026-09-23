-- CUSTOM-QUOTATION-TITLE-SNAPSHOT-DB-01: nullable immutable title snapshot for issued quotations.

ALTER TABLE "custom_quotation_versions"
ADD COLUMN "title" VARCHAR(200);
