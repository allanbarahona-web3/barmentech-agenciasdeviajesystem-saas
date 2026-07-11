-- CreateTable
CREATE TABLE "document_signing_sessions" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "processType" TEXT NOT NULL DEFAULT 'CONTRACT',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_signing_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_signings" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pdfObjectKey" TEXT,
    "pdfFileName" TEXT,
    "pdfMimeType" TEXT,
    "pdfSize" INTEGER,
    "signedPdfObjectKey" TEXT,
    "signedPdfFileName" TEXT,
    "signedPdfMimeType" TEXT,
    "signedPdfSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_signings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_signers" (
    "id" TEXT NOT NULL,
    "documentSigningId" TEXT NOT NULL,
    "signerKey" TEXT NOT NULL,
    "signerRole" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_signers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_signing_sessions_contractId_idx" ON "document_signing_sessions"("contractId");

-- CreateIndex
CREATE INDEX "document_signing_sessions_tenantId_idx" ON "document_signing_sessions"("tenantId");

-- CreateIndex
CREATE INDEX "document_signing_sessions_status_idx" ON "document_signing_sessions"("status");

-- CreateIndex
CREATE INDEX "document_signing_sessions_createdAt_idx" ON "document_signing_sessions"("createdAt");

-- CreateIndex
CREATE INDEX "document_signing_sessions_tenantId_contractId_idx" ON "document_signing_sessions"("tenantId", "contractId");

-- CreateIndex
CREATE INDEX "document_signings_sessionId_idx" ON "document_signings"("sessionId");

-- CreateIndex
CREATE INDEX "document_signings_status_idx" ON "document_signings"("status");

-- CreateIndex
CREATE INDEX "document_signings_documentType_idx" ON "document_signings"("documentType");

-- CreateIndex
CREATE INDEX "document_signings_createdAt_idx" ON "document_signings"("createdAt");

-- CreateIndex
CREATE INDEX "document_signings_sessionId_status_idx" ON "document_signings"("sessionId", "status");

-- CreateIndex
CREATE INDEX "document_signers_documentSigningId_idx" ON "document_signers"("documentSigningId");

-- CreateIndex
CREATE INDEX "document_signers_status_idx" ON "document_signers"("status");

-- CreateIndex
CREATE INDEX "document_signers_signerKey_idx" ON "document_signers"("signerKey");

-- CreateIndex
CREATE INDEX "document_signers_createdAt_idx" ON "document_signers"("createdAt");

-- CreateIndex
CREATE INDEX "document_signers_documentSigningId_status_idx" ON "document_signers"("documentSigningId", "status");

-- AddForeignKey
ALTER TABLE "document_signing_sessions" ADD CONSTRAINT "document_signing_sessions_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_signing_sessions" ADD CONSTRAINT "document_signing_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_signings" ADD CONSTRAINT "document_signings_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "document_signing_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_signers" ADD CONSTRAINT "document_signers_documentSigningId_fkey" FOREIGN KEY ("documentSigningId") REFERENCES "document_signings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
