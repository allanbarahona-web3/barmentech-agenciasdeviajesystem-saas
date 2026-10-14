-- ADDITIONAL-SERVICES-MVP-2B: line-level commercial cost-evidence metadata.
-- Object storage remains private; application code owns tenant-scoped access.

ALTER TABLE "additional_service_order_lines"
ADD COLUMN "costEvidenceObjectKey" TEXT,
ADD COLUMN "costEvidenceOriginalFilename" TEXT,
ADD COLUMN "costEvidenceMimeType" TEXT,
ADD COLUMN "costEvidenceByteSize" INTEGER,
ADD COLUMN "costEvidenceContentHash" TEXT;

CREATE UNIQUE INDEX "additional_service_order_lines_costEvidenceObjectKey_key"
ON "additional_service_order_lines"("costEvidenceObjectKey");
