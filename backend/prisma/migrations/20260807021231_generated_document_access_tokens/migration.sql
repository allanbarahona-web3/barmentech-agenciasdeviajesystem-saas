-- RenameIndex
ALTER INDEX "generated_document_access_tokens_document_purpose_active_idx" RENAME TO "generated_document_access_tokens_generatedDocumentId_purpos_idx";

-- RenameIndex
ALTER INDEX "generated_document_access_tokens_expires_at_idx" RENAME TO "generated_document_access_tokens_expiresAt_idx";
