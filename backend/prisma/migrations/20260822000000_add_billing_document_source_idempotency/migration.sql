CREATE TYPE "BillingDocumentSourceRole" AS ENUM ('PRIMARY', 'ADJUSTMENT');

ALTER TABLE "billing_documents"
ADD COLUMN "sourceRole" "BillingDocumentSourceRole" NOT NULL DEFAULT 'PRIMARY',
ADD COLUMN "creationDeduplicationKey" VARCHAR(200);

CREATE UNIQUE INDEX "billing_documents_tenantId_creationDeduplicationKey_key"
ON "billing_documents"("tenantId", "creationDeduplicationKey");

CREATE UNIQUE INDEX "billing_documents_primary_source_key"
ON "billing_documents"("tenantId", "sourceType", "sourceId")
WHERE "sourceRole" = 'PRIMARY';
