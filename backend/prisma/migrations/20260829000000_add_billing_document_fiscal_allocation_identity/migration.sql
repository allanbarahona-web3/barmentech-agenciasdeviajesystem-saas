ALTER TABLE "billing_documents"
ADD COLUMN "fiscalIssuerId" TEXT,
ADD COLUMN "billingDocumentNumberSequenceId" TEXT,
ADD COLUMN "allocatedSequenceNumber" BIGINT,
ADD COLUMN "issuanceIdempotencyKey" VARCHAR(100),
ADD COLUMN "providerDocumentId" VARCHAR(255);

CREATE UNIQUE INDEX "billing_doc_num_sequences_allocation_scope_key"
ON "billing_document_number_sequences"(
    "id",
    "tenantId",
    "fiscalIssuerId",
    "establishmentCode",
    "terminalCode",
    "documentTypeCode"
);

CREATE UNIQUE INDEX "billing_documents_sequence_allocated_number_key"
ON "billing_documents"("billingDocumentNumberSequenceId", "allocatedSequenceNumber");

CREATE UNIQUE INDEX "billing_documents_tenant_issuance_idem_key"
ON "billing_documents"("tenantId", "issuanceIdempotencyKey");

CREATE UNIQUE INDEX "billing_documents_tenant_provider_document_key"
ON "billing_documents"("tenantId", "providerDocumentId")
WHERE "providerDocumentId" IS NOT NULL;

CREATE INDEX "billing_documents_tenant_fiscal_issuer_idx"
ON "billing_documents"("tenantId", "fiscalIssuerId");

CREATE INDEX "billing_documents_tenant_number_sequence_idx"
ON "billing_documents"("tenantId", "billingDocumentNumberSequenceId");

ALTER TABLE "billing_documents"
ADD CONSTRAINT "billing_documents_allocated_sequence_range_check"
CHECK (
    "allocatedSequenceNumber" IS NULL
    OR "allocatedSequenceNumber" BETWEEN 1 AND 9999999999
),
ADD CONSTRAINT "billing_documents_issuance_idempotency_length_check"
CHECK (
    "issuanceIdempotencyKey" IS NULL
    OR char_length("issuanceIdempotencyKey") BETWEEN 8 AND 100
),
ADD CONSTRAINT "billing_documents_allocation_bundle_check"
CHECK (
    (
        "billingDocumentNumberSequenceId" IS NULL
        AND "allocatedSequenceNumber" IS NULL
        AND "issuanceIdempotencyKey" IS NULL
    )
    OR
    (
        "billingDocumentNumberSequenceId" IS NOT NULL
        AND "allocatedSequenceNumber" IS NOT NULL
        AND "issuanceIdempotencyKey" IS NOT NULL
    )
),
ADD CONSTRAINT "billing_documents_fiscal_consecutive_check"
CHECK (
    "billingDocumentNumberSequenceId" IS NULL
    OR
    (
        "fiscalIssuerId" IS NOT NULL
        AND "issuerEstablishmentCode" IS NOT NULL
        AND "issuerTerminalCode" IS NOT NULL
        AND "fiscalNumber" IS NOT NULL
        AND "fiscalNumber" ~ '^[0-9]{20}$'
        AND "fiscalNumber" =
            "issuerEstablishmentCode"
            || "issuerTerminalCode"
            || "documentTypeCode"
            || lpad("allocatedSequenceNumber"::text, 10, '0')
    )
),
ADD CONSTRAINT "billing_documents_provider_identity_dependency_check"
CHECK (
    "providerDocumentId" IS NULL
    OR
    (
        "billingDocumentNumberSequenceId" IS NOT NULL
        AND "allocatedSequenceNumber" IS NOT NULL
        AND "issuanceIdempotencyKey" IS NOT NULL
        AND "fiscalNumber" IS NOT NULL
    )
);

ALTER TABLE "billing_documents"
ADD CONSTRAINT "billing_documents_fiscal_issuer_tenant_fkey"
FOREIGN KEY ("fiscalIssuerId", "tenantId")
REFERENCES "fiscal_issuers"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "billing_documents"
ADD CONSTRAINT "billing_documents_number_sequence_scope_fkey"
FOREIGN KEY (
    "billingDocumentNumberSequenceId",
    "tenantId",
    "fiscalIssuerId",
    "issuerEstablishmentCode",
    "issuerTerminalCode",
    "documentTypeCode"
)
REFERENCES "billing_document_number_sequences"(
    "id",
    "tenantId",
    "fiscalIssuerId",
    "establishmentCode",
    "terminalCode",
    "documentTypeCode"
)
ON DELETE RESTRICT ON UPDATE CASCADE;
