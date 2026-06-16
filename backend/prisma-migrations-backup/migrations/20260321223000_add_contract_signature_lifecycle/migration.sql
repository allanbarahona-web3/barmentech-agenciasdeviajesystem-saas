-- Add signature lifecycle columns to contracts
ALTER TABLE "Contract"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING_SIGNATURE',
  ADD COLUMN "signedPdfObjectKey" TEXT,
  ADD COLUMN "signedPdfFileName" TEXT,
  ADD COLUMN "signedPdfMimeType" TEXT,
  ADD COLUMN "signedPdfSize" INTEGER,
  ADD COLUMN "signedByName" TEXT,
  ADD COLUMN "signedAt" TIMESTAMP(3),
  ADD COLUMN "signedClientIp" TEXT,
  ADD COLUMN "signedUserAgent" TEXT;

-- If old rows exist without an explicit state, keep them pending by default.
UPDATE "Contract"
SET "status" = 'PENDING_SIGNATURE'
WHERE "status" IS NULL;

-- Add index for status filtering in history views.
CREATE INDEX "Contract_status_idx" ON "Contract"("status");
