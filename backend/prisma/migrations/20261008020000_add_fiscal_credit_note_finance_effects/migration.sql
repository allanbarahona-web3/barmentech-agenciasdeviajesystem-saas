-- Manual-only migration. Do not apply automatically.
CREATE TABLE "fiscal_credit_note_finance_effects" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "customerId" TEXT NOT NULL, "currencyCode" VARCHAR(3) NOT NULL,
  "creditNoteBillingDocumentId" TEXT NOT NULL, "referencedBillingDocumentId" TEXT NOT NULL, "affectedAccountReceivableId" TEXT,
  "totalCreditAmount" DECIMAL(19,5) NOT NULL, "amountAppliedToAr" DECIMAL(19,5) NOT NULL, "availableCreditAmount" DECIMAL(19,5) NOT NULL,
  "effectiveAt" TIMESTAMPTZ(6) NOT NULL, "createdBySystem" BOOLEAN NOT NULL DEFAULT true, "createdByUserId" VARCHAR(191),
  "idempotencyKey" VARCHAR(200) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal_credit_note_finance_effects_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal_credit_note_finance_effects_tenant_credit_note_key" UNIQUE ("tenantId", "creditNoteBillingDocumentId"),
  CONSTRAINT "fiscal_credit_note_finance_effects_tenant_idempotency_key" UNIQUE ("tenantId", "idempotencyKey"),
  CONSTRAINT "fiscal_credit_note_finance_effects_tenant_id_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "fiscal_credit_note_finance_effects_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "fiscal_credit_note_finance_effects_customer_tenant_fkey" FOREIGN KEY ("customerId", "tenantId") REFERENCES "Client"("id", "tenantId") ON DELETE RESTRICT,
  CONSTRAINT "fiscal_credit_note_finance_effects_credit_note_tenant_fkey" FOREIGN KEY ("creditNoteBillingDocumentId", "tenantId") REFERENCES "billing_documents"("id", "tenantId") ON DELETE RESTRICT,
  CONSTRAINT "fiscal_credit_note_finance_effects_referenced_document_tenant_fkey" FOREIGN KEY ("referencedBillingDocumentId", "tenantId") REFERENCES "billing_documents"("id", "tenantId") ON DELETE RESTRICT,
  CONSTRAINT "fiscal_credit_note_finance_effects_receivable_tenant_fkey" FOREIGN KEY ("affectedAccountReceivableId", "tenantId") REFERENCES "account_receivables"("id", "tenantId") ON DELETE RESTRICT
);
CREATE INDEX "fiscal_credit_note_finance_effects_customer_currency_effective_idx" ON "fiscal_credit_note_finance_effects"("tenantId", "customerId", "currencyCode", "effectiveAt");
CREATE INDEX "fiscal_credit_note_finance_effects_referenced_document_idx" ON "fiscal_credit_note_finance_effects"("tenantId", "referencedBillingDocumentId");

CREATE TABLE "fiscal_credit_note_ar_adjustments" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "fiscalCreditNoteEffectId" TEXT NOT NULL, "accountReceivableId" TEXT NOT NULL,
  "amount" DECIMAL(19,5) NOT NULL, "appliedAt" TIMESTAMPTZ(6) NOT NULL, "idempotencyKey" VARCHAR(200) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal_credit_note_ar_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal_credit_note_ar_adjustments_tenant_effect_key" UNIQUE ("tenantId", "fiscalCreditNoteEffectId"),
  CONSTRAINT "fiscal_credit_note_ar_adjustments_effect_tenant_key" UNIQUE ("fiscalCreditNoteEffectId", "tenantId"),
  CONSTRAINT "fiscal_credit_note_ar_adjustments_tenant_idempotency_key" UNIQUE ("tenantId", "idempotencyKey"),
  CONSTRAINT "fiscal_credit_note_ar_adjustments_tenant_id_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "fiscal_credit_note_ar_adjustments_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "fiscal_credit_note_ar_adjustments_effect_tenant_fkey" FOREIGN KEY ("fiscalCreditNoteEffectId", "tenantId") REFERENCES "fiscal_credit_note_finance_effects"("id", "tenantId") ON DELETE RESTRICT,
  CONSTRAINT "fiscal_credit_note_ar_adjustments_receivable_tenant_fkey" FOREIGN KEY ("accountReceivableId", "tenantId") REFERENCES "account_receivables"("id", "tenantId") ON DELETE RESTRICT
);
CREATE INDEX "fiscal_credit_note_ar_adjustments_receivable_applied_idx" ON "fiscal_credit_note_ar_adjustments"("tenantId", "accountReceivableId", "appliedAt");

CREATE TYPE "FiscalCreditNoteCreditApplicationStatus" AS ENUM ('ACTIVE', 'REVERSED');
CREATE TABLE "fiscal_credit_note_credit_applications" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "fiscalCreditNoteEffectId" TEXT NOT NULL, "accountReceivableId" TEXT,
  "amount" DECIMAL(19,5) NOT NULL, "status" "FiscalCreditNoteCreditApplicationStatus" NOT NULL DEFAULT 'ACTIVE',
  "appliedAt" TIMESTAMPTZ(6) NOT NULL, "reversedAt" TIMESTAMPTZ(6), "reversalReason" VARCHAR(500), "idempotencyKey" VARCHAR(200) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal_credit_note_credit_applications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal_credit_note_credit_applications_tenant_idempotency_key" UNIQUE ("tenantId", "idempotencyKey"),
  CONSTRAINT "fiscal_credit_note_credit_applications_tenant_id_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "fiscal_credit_note_credit_applications_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "fiscal_credit_note_credit_applications_effect_tenant_fkey" FOREIGN KEY ("fiscalCreditNoteEffectId", "tenantId") REFERENCES "fiscal_credit_note_finance_effects"("id", "tenantId") ON DELETE RESTRICT,
  CONSTRAINT "fiscal_credit_note_credit_applications_receivable_tenant_fkey" FOREIGN KEY ("accountReceivableId", "tenantId") REFERENCES "account_receivables"("id", "tenantId") ON DELETE RESTRICT
);
CREATE INDEX "fiscal_credit_note_credit_applications_effect_active_idx" ON "fiscal_credit_note_credit_applications"("tenantId", "fiscalCreditNoteEffectId", "status", "appliedAt");
