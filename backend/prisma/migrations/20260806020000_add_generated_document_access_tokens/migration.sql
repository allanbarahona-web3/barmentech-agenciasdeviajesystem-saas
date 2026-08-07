CREATE TABLE "generated_document_access_tokens" (
    "id" TEXT NOT NULL,
    "generatedDocumentId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "generated_document_access_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "generated_document_access_tokens_tokenHash_key"
ON "generated_document_access_tokens"("tokenHash");

CREATE INDEX "generated_document_access_tokens_document_purpose_active_idx"
ON "generated_document_access_tokens"("generatedDocumentId", "purpose", "isActive");

CREATE INDEX "generated_document_access_tokens_expires_at_idx"
ON "generated_document_access_tokens"("expiresAt");

ALTER TABLE "generated_document_access_tokens"
ADD CONSTRAINT "generated_document_access_tokens_generatedDocumentId_fkey"
FOREIGN KEY ("generatedDocumentId") REFERENCES "generated_documents"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "additional_service_orders"
ADD COLUMN "proposalApprovedAt" TIMESTAMP(3),
ADD COLUMN "proposalApprovalMethod" TEXT,
ADD COLUMN "proposalApprovedIp" TEXT,
ADD COLUMN "proposalApprovedUserAgent" TEXT;
