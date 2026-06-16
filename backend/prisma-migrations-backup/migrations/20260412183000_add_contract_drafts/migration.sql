-- Create table for persistent contract drafts
CREATE TABLE "ContractDraft" (
  "id" TEXT NOT NULL,
  "contractNumber" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "clientFullName" TEXT,
  "clientIdNumber" TEXT,
  "clientEmail" TEXT,
  "clientPhone" TEXT,
  "destination" TEXT,
  "payload" JSONB NOT NULL,
  "generatedByUserId" TEXT NOT NULL,
  "generatedByEmail" TEXT NOT NULL,
  "generatedByName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ContractDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContractDraft_contractNumber_key" ON "ContractDraft"("contractNumber");
CREATE INDEX "ContractDraft_generatedByUserId_idx" ON "ContractDraft"("generatedByUserId");
CREATE INDEX "ContractDraft_createdAt_idx" ON "ContractDraft"("createdAt");
