CREATE TYPE "BillingDocumentArtifactType" AS ENUM (
  'SIGNED_FISCAL_XML',
  'TAX_AUTHORITY_RESPONSE_XML',
  'INTERNAL_PDF'
);

CREATE TYPE "BillingDocumentArtifactStatus" AS ENUM (
  'PENDING',
  'AVAILABLE',
  'FAILED'
);

CREATE TABLE "billing_document_artifacts" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "billingDocumentId" TEXT NOT NULL,
  "artifactType" "BillingDocumentArtifactType" NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "BillingDocumentArtifactStatus" NOT NULL DEFAULT 'PENDING',
  "storageProvider" VARCHAR(50),
  "storageKey" VARCHAR(1024),
  "sha256" VARCHAR(64),
  "byteSize" BIGINT,
  "mimeType" VARCHAR(100),
  "sourceEtag" VARCHAR(255),
  "retrievedAt" TIMESTAMPTZ(6),
  "storedAt" TIMESTAMPTZ(6),
  "terminalErrorCode" VARCHAR(100),
  "failedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "billing_document_artifacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_document_artifacts_version_positive_check"
    CHECK ("version" >= 1),
  CONSTRAINT "billing_document_artifacts_xml_version_check"
    CHECK (
      "artifactType" NOT IN ('SIGNED_FISCAL_XML', 'TAX_AUTHORITY_RESPONSE_XML')
      OR "version" = 1
    ),
  CONSTRAINT "billing_document_artifacts_sha256_check"
    CHECK ("sha256" IS NULL OR "sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "billing_document_artifacts_byte_size_check"
    CHECK ("byteSize" IS NULL OR "byteSize" > 0),
  CONSTRAINT "billing_document_artifacts_terminal_error_code_check"
    CHECK (
      "terminalErrorCode" IS NULL
      OR "terminalErrorCode" ~ '^[A-Z][A-Z0-9_]{0,99}$'
    ),
  CONSTRAINT "billing_document_artifacts_pending_state_check"
    CHECK (
      "status" <> 'PENDING'
      OR (
        "storageProvider" IS NULL
        AND "storageKey" IS NULL
        AND "sha256" IS NULL
        AND "byteSize" IS NULL
        AND "mimeType" IS NULL
        AND "sourceEtag" IS NULL
        AND "retrievedAt" IS NULL
        AND "storedAt" IS NULL
        AND "terminalErrorCode" IS NULL
        AND "failedAt" IS NULL
      )
    ),
  CONSTRAINT "billing_document_artifacts_available_state_check"
    CHECK (
      "status" <> 'AVAILABLE'
      OR (
        "storageProvider" IS NOT NULL
        AND length(btrim("storageProvider")) > 0
        AND "storageKey" IS NOT NULL
        AND length(btrim("storageKey")) > 0
        AND "sha256" IS NOT NULL
        AND "byteSize" IS NOT NULL
        AND "byteSize" > 0
        AND "mimeType" IS NOT NULL
        AND length(btrim("mimeType")) > 0
        AND "retrievedAt" IS NOT NULL
        AND "storedAt" IS NOT NULL
        AND "terminalErrorCode" IS NULL
        AND "failedAt" IS NULL
      )
    ),
  CONSTRAINT "billing_document_artifacts_failed_state_check"
    CHECK (
      "status" <> 'FAILED'
      OR (
        "storageProvider" IS NULL
        AND "storageKey" IS NULL
        AND "sha256" IS NULL
        AND "byteSize" IS NULL
        AND "mimeType" IS NULL
        AND "sourceEtag" IS NULL
        AND "retrievedAt" IS NULL
        AND "storedAt" IS NULL
        AND "terminalErrorCode" IS NOT NULL
        AND "failedAt" IS NOT NULL
      )
    ),
  CONSTRAINT "billing_document_artifacts_timestamp_order_check"
    CHECK (
      "storedAt" IS NULL
      OR "retrievedAt" IS NULL
      OR "storedAt" >= "retrievedAt"
    ),
  CONSTRAINT "billing_document_artifacts_xml_mime_check"
    CHECK (
      "artifactType" NOT IN ('SIGNED_FISCAL_XML', 'TAX_AUTHORITY_RESPONSE_XML')
      OR "mimeType" IS NULL
      OR "mimeType" IN ('application/xml', 'text/xml')
    ),
  CONSTRAINT "billing_document_artifacts_pdf_mime_check"
    CHECK (
      "artifactType" <> 'INTERNAL_PDF'
      OR "mimeType" IS NULL
      OR "mimeType" = 'application/pdf'
    )
);

CREATE UNIQUE INDEX "billing_document_artifacts_identity_key"
ON "billing_document_artifacts"("tenantId", "billingDocumentId", "artifactType", "version");

CREATE UNIQUE INDEX "billing_document_artifacts_storage_key"
ON "billing_document_artifacts"("storageProvider", "storageKey");

CREATE UNIQUE INDEX "billing_document_artifacts_id_tenant_key"
ON "billing_document_artifacts"("id", "tenantId");

CREATE INDEX "billing_document_artifacts_tenant_status_type_idx"
ON "billing_document_artifacts"("tenantId", "status", "artifactType");

CREATE INDEX "billing_document_artifacts_tenant_created_idx"
ON "billing_document_artifacts"("tenantId", "createdAt");

ALTER TABLE "billing_document_artifacts"
ADD CONSTRAINT "billing_document_artifacts_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_document_artifacts"
ADD CONSTRAINT "billing_document_artifacts_document_tenant_fkey"
FOREIGN KEY ("billingDocumentId", "tenantId")
REFERENCES "billing_documents"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;
