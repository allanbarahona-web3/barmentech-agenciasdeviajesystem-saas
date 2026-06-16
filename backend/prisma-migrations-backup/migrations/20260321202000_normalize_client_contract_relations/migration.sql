-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "idNumber" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_idNumber_key" ON "Client"("idNumber");

-- CreateIndex
CREATE INDEX "Client_fullName_idx" ON "Client"("fullName");

-- CreateIndex
CREATE INDEX "Client_email_idx" ON "Client"("email");

-- AddColumn
ALTER TABLE "Contract" ADD COLUMN "clientId" TEXT;

-- Backfill clients from existing contracts (keep latest row per id number)
INSERT INTO "Client" (
    "id",
    "fullName",
    "idNumber",
    "email",
    "createdAt",
    "updatedAt"
)
SELECT DISTINCT ON (c."clientIdNumber")
    md5(random()::text || clock_timestamp()::text || c."clientIdNumber"),
    c."clientFullName",
    c."clientIdNumber",
    c."clientEmail",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Contract" c
WHERE c."clientIdNumber" IS NOT NULL AND c."clientIdNumber" <> ''
ORDER BY c."clientIdNumber", c."createdAt" DESC;

-- Fallback for contracts with empty/null id number
INSERT INTO "Client" (
    "id",
    "fullName",
    "idNumber",
    "email",
    "createdAt",
    "updatedAt"
)
SELECT
    md5(random()::text || clock_timestamp()::text || c."id"),
    c."clientFullName",
    CONCAT('LEGACY-', c."id"),
    c."clientEmail",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Contract" c
WHERE COALESCE(NULLIF(c."clientIdNumber", ''), '') = '';

-- Link contracts to clients
UPDATE "Contract" c
SET "clientId" = cl."id"
FROM "Client" cl
WHERE cl."idNumber" = c."clientIdNumber";

UPDATE "Contract" c
SET "clientId" = cl."id"
FROM "Client" cl
WHERE COALESCE(NULLIF(c."clientIdNumber", ''), '') = ''
  AND cl."idNumber" = CONCAT('LEGACY-', c."id");

-- Make relation required
ALTER TABLE "Contract" ALTER COLUMN "clientId" SET NOT NULL;

-- AddIndex
CREATE INDEX "Contract_clientId_idx" ON "Contract"("clientId");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop old denormalized indexes/columns
DROP INDEX IF EXISTS "Contract_clientFullName_idx";
DROP INDEX IF EXISTS "Contract_clientIdNumber_idx";
DROP INDEX IF EXISTS "Contract_clientEmail_idx";

ALTER TABLE "Contract"
  DROP COLUMN "clientFullName",
  DROP COLUMN "clientIdNumber",
  DROP COLUMN "clientEmail";
