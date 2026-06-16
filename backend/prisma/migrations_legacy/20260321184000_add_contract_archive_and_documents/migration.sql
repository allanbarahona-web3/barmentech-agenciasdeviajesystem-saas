-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "clientFullName" TEXT NOT NULL,
    "clientIdNumber" TEXT NOT NULL,
    "clientEmail" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "generatedByUserId" TEXT NOT NULL,
    "generatedByEmail" TEXT NOT NULL,
    "generatedByName" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "pdfObjectKey" TEXT NOT NULL,
    "pdfFileName" TEXT NOT NULL,
    "pdfMimeType" TEXT NOT NULL,
    "pdfSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractDocument" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "kind" TEXT,
    "originalFileName" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contract_contractNumber_key" ON "Contract"("contractNumber");

-- CreateIndex
CREATE INDEX "Contract_clientFullName_idx" ON "Contract"("clientFullName");

-- CreateIndex
CREATE INDEX "Contract_clientIdNumber_idx" ON "Contract"("clientIdNumber");

-- CreateIndex
CREATE INDEX "Contract_clientEmail_idx" ON "Contract"("clientEmail");

-- CreateIndex
CREATE INDEX "Contract_createdAt_idx" ON "Contract"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContractDocument_objectKey_key" ON "ContractDocument"("objectKey");

-- CreateIndex
CREATE INDEX "ContractDocument_contractId_idx" ON "ContractDocument"("contractId");

-- CreateIndex
CREATE INDEX "ContractDocument_createdAt_idx" ON "ContractDocument"("createdAt");

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
