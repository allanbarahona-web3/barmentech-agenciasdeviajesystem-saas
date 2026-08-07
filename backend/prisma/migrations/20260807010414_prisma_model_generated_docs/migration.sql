-- RenameIndex
ALTER INDEX "generated_documents_created_at_idx" RENAME TO "generated_documents_tenantId_createdAt_idx";

-- RenameIndex
ALTER INDEX "generated_documents_document_type_idx" RENAME TO "generated_documents_tenantId_documentType_idx";

-- RenameIndex
ALTER INDEX "generated_documents_owner_idx" RENAME TO "generated_documents_tenantId_ownerType_ownerId_idx";

-- RenameIndex
ALTER INDEX "generated_documents_owner_version_key" RENAME TO "generated_documents_tenantId_ownerType_ownerId_documentType_key";
