-- Immutable provider-reference emission timestamp for fiscal credit notes.
-- Manual-only migration: do not apply automatically.
ALTER TABLE "billing_document_references"
  ADD COLUMN "referenceEmissionAt" TIMESTAMP(3);
