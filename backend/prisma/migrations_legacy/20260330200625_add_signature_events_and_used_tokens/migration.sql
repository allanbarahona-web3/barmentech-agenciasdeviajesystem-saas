-- CreateTable
CREATE TABLE "ContractSignatureEvent" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "signerKey" TEXT NOT NULL,
    "signerRole" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "signedClientIp" TEXT,
    "signedUserAgent" TEXT,
    "signaturePngKey" TEXT,
    "signedPdfKey" TEXT,
    "signedPdfBytes" INTEGER,
    "signedPdfSha256" TEXT,
    "tokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractSignatureEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractUsedToken" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "signerKey" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractUsedToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractSignatureEvent_contractId_idx" ON "ContractSignatureEvent"("contractId");

-- CreateIndex
CREATE INDEX "ContractSignatureEvent_signedAt_idx" ON "ContractSignatureEvent"("signedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContractUsedToken_tokenHash_key" ON "ContractUsedToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ContractUsedToken_contractId_idx" ON "ContractUsedToken"("contractId");

-- AddForeignKey
ALTER TABLE "ContractSignatureEvent" ADD CONSTRAINT "ContractSignatureEvent_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractUsedToken" ADD CONSTRAINT "ContractUsedToken_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
