CREATE TABLE "billing_document_number_sequences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fiscalIssuerId" TEXT NOT NULL,
    "establishmentCode" VARCHAR(3) NOT NULL,
    "terminalCode" VARCHAR(5) NOT NULL,
    "documentTypeCode" VARCHAR(4) NOT NULL,
    "startingSequenceNumber" BIGINT NOT NULL,
    "nextSequenceNumber" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_document_number_sequences_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "billing_documents"
ADD COLUMN "issuerEstablishmentCode" VARCHAR(3),
ADD COLUMN "issuerTerminalCode" VARCHAR(5);

CREATE UNIQUE INDEX "billing_document_number_sequences_scope_key"
ON "billing_document_number_sequences"("tenantId", "fiscalIssuerId", "establishmentCode", "terminalCode", "documentTypeCode");

ALTER TABLE "billing_document_number_sequences"
ADD CONSTRAINT "billing_document_number_sequences_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_document_number_sequences"
ADD CONSTRAINT "billing_document_number_sequences_fiscalIssuer_tenant_fkey"
FOREIGN KEY ("fiscalIssuerId", "tenantId") REFERENCES "fiscal_issuers"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;
