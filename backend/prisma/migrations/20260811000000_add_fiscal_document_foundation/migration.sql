CREATE TYPE "BillingMode" AS ENUM ('EXTERNAL_REGISTRATION', 'ELECTRONIC_PROVIDER');
CREATE TYPE "BillingDocumentLifecycleStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'SUBMITTED', 'CANCELLED');
CREATE TYPE "BillingProviderStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'PROCESSED', 'FAILED');
CREATE TYPE "BillingTaxAuthorityStatus" AS ENUM ('NOT_SUBMITTED', 'PROCESSING', 'ACCEPTED', 'REJECTED');
CREATE TYPE "BillingArtifactStatus" AS ENUM ('NOT_GENERATED', 'PENDING', 'AVAILABLE', 'FAILED');

CREATE TABLE "billing_documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentTypeCode" VARCHAR(4) NOT NULL,
    "billingMode" "BillingMode" NOT NULL,
    "internalNumber" VARCHAR(50) NOT NULL,
    "fiscalNumber" VARCHAR(50),
    "haciendaKey" VARCHAR(50),
    "sourceType" VARCHAR(50),
    "sourceId" VARCHAR(100),
    "sourceNumber" VARCHAR(100),
    "schemaVersion" VARCHAR(20) NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL DEFAULT 'CR',
    "currencyCode" VARCHAR(3) NOT NULL,
    "exchangeRate" DECIMAL(18,8),
    "issuedAt" TIMESTAMP(3),
    "paymentConditionCode" VARCHAR(4),
    "creditTermDays" INTEGER,
    "dueDate" DATE,
    "lifecycleStatus" "BillingDocumentLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "providerStatus" "BillingProviderStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "taxAuthorityStatus" "BillingTaxAuthorityStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "artifactStatus" "BillingArtifactStatus" NOT NULL DEFAULT 'NOT_GENERATED',
    "issuerName" TEXT NOT NULL,
    "issuerIdentificationType" VARCHAR(4) NOT NULL,
    "issuerIdentification" VARCHAR(30) NOT NULL,
    "issuerEmail" TEXT,
    "issuerPhone" TEXT,
    "issuerAddressSnapshot" JSONB,
    "receiverName" TEXT,
    "receiverIdentificationType" VARCHAR(4),
    "receiverIdentification" VARCHAR(30),
    "receiverEmail" TEXT,
    "receiverPhone" TEXT,
    "receiverAddressSnapshot" JSONB,
    "grossSubtotal" DECIMAL(18,4) NOT NULL,
    "discountTotal" DECIMAL(18,4) NOT NULL,
    "taxableTotal" DECIMAL(18,4) NOT NULL,
    "exemptTotal" DECIMAL(18,4) NOT NULL,
    "exoneratedTotal" DECIMAL(18,4) NOT NULL,
    "grossTaxTotal" DECIMAL(18,4) NOT NULL,
    "exoneratedTaxTotal" DECIMAL(18,4) NOT NULL,
    "netTaxTotal" DECIMAL(18,4) NOT NULL,
    "total" DECIMAL(18,4) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "billing_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_document_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "billingDocumentId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "cabysCode" VARCHAR(13),
    "itemCode" VARCHAR(50),
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitOfMeasureCode" VARCHAR(20) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "grossAmount" DECIMAL(18,4) NOT NULL,
    "discountAmount" DECIMAL(18,4) NOT NULL,
    "discountCode" VARCHAR(4),
    "discountReason" TEXT,
    "taxableBase" DECIMAL(18,4) NOT NULL,
    "taxAmount" DECIMAL(18,4) NOT NULL,
    "exoneratedTaxAmount" DECIMAL(18,4) NOT NULL,
    "netTaxAmount" DECIMAL(18,4) NOT NULL,
    "lineSubtotal" DECIMAL(18,4) NOT NULL,
    "lineTotal" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "billing_document_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_line_taxes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "billingDocumentLineId" TEXT NOT NULL,
    "taxOrder" INTEGER NOT NULL,
    "taxCode" VARCHAR(4) NOT NULL,
    "rateCode" VARCHAR(4) NOT NULL,
    "ratePercentage" DECIMAL(7,4) NOT NULL,
    "taxableBase" DECIMAL(18,4) NOT NULL,
    "taxAmount" DECIMAL(18,4) NOT NULL,
    "calculationFactor" DECIMAL(18,8),
    "netTaxAmount" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "billing_line_taxes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_line_tax_exemptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "billingLineTaxId" TEXT NOT NULL,
    "documentTypeCode" VARCHAR(4) NOT NULL,
    "documentNumber" VARCHAR(50) NOT NULL,
    "legalArticle" VARCHAR(20),
    "legalSection" VARCHAR(20),
    "issuingInstitutionCode" VARCHAR(4),
    "issuingInstitutionName" TEXT,
    "otherInstitutionDescription" TEXT,
    "issueDate" DATE NOT NULL,
    "exemptedPercentage" DECIMAL(7,4) NOT NULL,
    "exemptedAmount" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "billing_line_tax_exemptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_document_references" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "billingDocumentId" TEXT NOT NULL,
    "referencedBillingDocumentId" TEXT,
    "referenceOrder" INTEGER NOT NULL,
    "externalDocumentKey" VARCHAR(50),
    "externalDocumentNumber" VARCHAR(50),
    "referencedDocumentTypeCode" VARCHAR(4) NOT NULL,
    "reasonCode" VARCHAR(4) NOT NULL,
    "reasonDescription" TEXT,
    "referenceDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "billing_document_references_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_document_references_no_self_reference" CHECK ("referencedBillingDocumentId" IS NULL OR "referencedBillingDocumentId" <> "billingDocumentId")
);

CREATE TABLE "billing_document_payment_methods" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "billingDocumentId" TEXT NOT NULL,
    "paymentMethodOrder" INTEGER NOT NULL,
    "paymentMethodCode" VARCHAR(4) NOT NULL,
    "description" TEXT,
    "declaredAmount" DECIMAL(18,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "billing_document_payment_methods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_documents_tenantId_internalNumber_key" ON "billing_documents"("tenantId", "internalNumber");
CREATE UNIQUE INDEX "billing_documents_tenantId_fiscalNumber_key" ON "billing_documents"("tenantId", "fiscalNumber");
CREATE UNIQUE INDEX "billing_documents_tenantId_haciendaKey_key" ON "billing_documents"("tenantId", "haciendaKey");
CREATE UNIQUE INDEX "billing_documents_id_tenantId_key" ON "billing_documents"("id", "tenantId");
CREATE INDEX "billing_documents_tenantId_lifecycleStatus_idx" ON "billing_documents"("tenantId", "lifecycleStatus");
CREATE INDEX "billing_documents_tenantId_documentTypeCode_idx" ON "billing_documents"("tenantId", "documentTypeCode");
CREATE INDEX "billing_documents_tenantId_sourceType_sourceId_idx" ON "billing_documents"("tenantId", "sourceType", "sourceId");
CREATE UNIQUE INDEX "billing_document_lines_billingDocumentId_lineNumber_key" ON "billing_document_lines"("billingDocumentId", "lineNumber");
CREATE UNIQUE INDEX "billing_document_lines_id_tenantId_key" ON "billing_document_lines"("id", "tenantId");
CREATE INDEX "billing_document_lines_tenantId_idx" ON "billing_document_lines"("tenantId");
CREATE UNIQUE INDEX "billing_line_taxes_billingDocumentLineId_taxOrder_key" ON "billing_line_taxes"("billingDocumentLineId", "taxOrder");
CREATE UNIQUE INDEX "billing_line_taxes_id_tenantId_key" ON "billing_line_taxes"("id", "tenantId");
CREATE INDEX "billing_line_taxes_tenantId_idx" ON "billing_line_taxes"("tenantId");
CREATE UNIQUE INDEX "billing_line_tax_exemptions_billingLineTaxId_key" ON "billing_line_tax_exemptions"("billingLineTaxId");
CREATE INDEX "billing_line_tax_exemptions_tenantId_idx" ON "billing_line_tax_exemptions"("tenantId");
CREATE UNIQUE INDEX "billing_document_references_billingDocumentId_referenceOrder_key" ON "billing_document_references"("billingDocumentId", "referenceOrder");
CREATE INDEX "billing_document_references_tenantId_idx" ON "billing_document_references"("tenantId");
CREATE INDEX "billing_document_references_referencedBillingDocumentId_tenantId_idx" ON "billing_document_references"("referencedBillingDocumentId", "tenantId");
CREATE UNIQUE INDEX "billing_document_payment_methods_billingDocumentId_paymentMethodOrder_key" ON "billing_document_payment_methods"("billingDocumentId", "paymentMethodOrder");
CREATE INDEX "billing_document_payment_methods_tenantId_idx" ON "billing_document_payment_methods"("tenantId");

ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_document_lines" ADD CONSTRAINT "billing_document_lines_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_document_lines" ADD CONSTRAINT "billing_document_lines_billingDocumentId_tenantId_fkey" FOREIGN KEY ("billingDocumentId", "tenantId") REFERENCES "billing_documents"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_line_taxes" ADD CONSTRAINT "billing_line_taxes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_line_taxes" ADD CONSTRAINT "billing_line_taxes_billingDocumentLineId_tenantId_fkey" FOREIGN KEY ("billingDocumentLineId", "tenantId") REFERENCES "billing_document_lines"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_line_tax_exemptions" ADD CONSTRAINT "billing_line_tax_exemptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_line_tax_exemptions" ADD CONSTRAINT "billing_line_tax_exemptions_billingLineTaxId_tenantId_fkey" FOREIGN KEY ("billingLineTaxId", "tenantId") REFERENCES "billing_line_taxes"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_document_references" ADD CONSTRAINT "billing_document_references_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_document_references" ADD CONSTRAINT "billing_document_references_billingDocumentId_tenantId_fkey" FOREIGN KEY ("billingDocumentId", "tenantId") REFERENCES "billing_documents"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_document_references" ADD CONSTRAINT "billing_document_references_referencedBillingDocumentId_tenantId_fkey" FOREIGN KEY ("referencedBillingDocumentId", "tenantId") REFERENCES "billing_documents"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_document_payment_methods" ADD CONSTRAINT "billing_document_payment_methods_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_document_payment_methods" ADD CONSTRAINT "billing_document_payment_methods_billingDocumentId_tenantId_fkey" FOREIGN KEY ("billingDocumentId", "tenantId") REFERENCES "billing_documents"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
