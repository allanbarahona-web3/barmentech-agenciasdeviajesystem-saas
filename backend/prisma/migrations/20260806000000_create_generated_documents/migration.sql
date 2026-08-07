CREATE TABLE "generated_documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "generated_documents_size_check" CHECK ("size" >= 0),
    CONSTRAINT "generated_documents_version_check" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "generated_documents_objectKey_key"
ON "generated_documents"("objectKey");

CREATE UNIQUE INDEX "generated_documents_owner_version_key"
ON "generated_documents"(
    "tenantId",
    "ownerType",
    "ownerId",
    "documentType",
    "variant",
    "version"
);

CREATE INDEX "generated_documents_owner_idx"
ON "generated_documents"("tenantId", "ownerType", "ownerId");

CREATE INDEX "generated_documents_document_type_idx"
ON "generated_documents"("tenantId", "documentType");

CREATE INDEX "generated_documents_created_at_idx"
ON "generated_documents"("tenantId", "createdAt");

ALTER TABLE "generated_documents"
ADD CONSTRAINT "generated_documents_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
