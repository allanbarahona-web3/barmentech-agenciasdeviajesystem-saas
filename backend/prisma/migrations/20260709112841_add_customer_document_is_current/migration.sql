-- Add isCurrent column to customer_documents table
ALTER TABLE "customer_documents" ADD COLUMN "isCurrent" BOOLEAN NOT NULL DEFAULT true;

-- Create index for efficient queries
CREATE INDEX "customer_documents_customerId_category_isCurrent_idx" ON "customer_documents"("customerId", "category", "isCurrent");
