-- CreateEnum
CREATE TYPE "CustomerDocumentCategory" AS ENUM ('ID_FRONT', 'ID_BACK', 'PASSPORT', 'PROFILE_PHOTO', 'OTHER');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "address" TEXT,
ADD COLUMN     "allergies" TEXT,
ADD COLUMN     "assignedToUserId" TEXT,
ADD COLUMN     "bloodType" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "customerStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "emergencyContactEmail" TEXT,
ADD COLUMN     "emergencyContactRelationship" TEXT,
ADD COLUMN     "lastContactDate" TIMESTAMP(3),
ADD COLUMN     "leadSource" TEXT,
ADD COLUMN     "medicalConditions" TEXT,
ADD COLUMN     "medications" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "nextFollowUpDate" TIMESTAMP(3),
ADD COLUMN     "occupation" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "preferredLanguage" TEXT,
ADD COLUMN     "secondaryEmail" TEXT,
ADD COLUMN     "secondaryPhone" TEXT,
ADD COLUMN     "tags" TEXT;

-- CreateTable
CREATE TABLE "customer_documents" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "category" "CustomerDocumentCategory" NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_notes" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_documents_objectKey_key" ON "customer_documents"("objectKey");

-- CreateIndex
CREATE INDEX "customer_documents_customerId_idx" ON "customer_documents"("customerId");

-- CreateIndex
CREATE INDEX "customer_documents_tenantId_idx" ON "customer_documents"("tenantId");

-- CreateIndex
CREATE INDEX "customer_documents_category_idx" ON "customer_documents"("category");

-- CreateIndex
CREATE INDEX "customer_documents_createdAt_idx" ON "customer_documents"("createdAt");

-- CreateIndex
CREATE INDEX "customer_documents_tenantId_customerId_idx" ON "customer_documents"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "customer_notes_customerId_idx" ON "customer_notes"("customerId");

-- CreateIndex
CREATE INDEX "customer_notes_tenantId_idx" ON "customer_notes"("tenantId");

-- CreateIndex
CREATE INDEX "customer_notes_createdAt_idx" ON "customer_notes"("createdAt");

-- CreateIndex
CREATE INDEX "Client_customerStatus_idx" ON "Client"("customerStatus");

-- CreateIndex
CREATE INDEX "Client_assignedToUserId_idx" ON "Client"("assignedToUserId");

-- CreateIndex
CREATE INDEX "Client_lastContactDate_idx" ON "Client"("lastContactDate");

-- CreateIndex
CREATE INDEX "Client_nextFollowUpDate_idx" ON "Client"("nextFollowUpDate");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
