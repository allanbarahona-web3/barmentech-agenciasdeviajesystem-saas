-- TENANT-PRICING-POLICY-DB-01: reusable tenant-owned Pricing defaults.

CREATE TABLE "tenant_pricing_policies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(500),
    "isDefaultForCustomQuotations" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "calculationPolicyVersion" VARCHAR(32) NOT NULL DEFAULT 'PRICING_V1',
    "operationalCostsAmountDefault" DECIMAL(19,5) NOT NULL DEFAULT 0,
    "riskMarginPercent" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "targetProfitMarginPercent" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "salesCommissionPercent" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "bankCommissionPercent" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "applicableTaxPercent" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_pricing_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenant_pricing_policies_inputs_nonnegative_chk" CHECK (
      "operationalCostsAmountDefault" >= 0
      AND "riskMarginPercent" >= 0
      AND "targetProfitMarginPercent" >= 0
      AND "salesCommissionPercent" >= 0
      AND "bankCommissionPercent" >= 0
      AND "applicableTaxPercent" >= 0
    ),
    CONSTRAINT "tenant_pricing_policies_calculation_policy_version_chk"
      CHECK ("calculationPolicyVersion" = 'PRICING_V1'),
    CONSTRAINT "tenant_pricing_policies_default_active_chk"
      CHECK (NOT "isDefaultForCustomQuotations" OR "active")
);

CREATE UNIQUE INDEX "tenant_pricing_policies_id_tenant_key"
ON "tenant_pricing_policies"("id", "tenantId");

CREATE UNIQUE INDEX "tenant_pricing_policies_tenant_name_key"
ON "tenant_pricing_policies"("tenantId", "name");

CREATE UNIQUE INDEX "tenant_pricing_policies_one_active_custom_quotation_default_key"
ON "tenant_pricing_policies"("tenantId")
WHERE "isDefaultForCustomQuotations" = true AND "active" = true;

CREATE INDEX "tenant_pricing_policies_tenant_active_name_idx"
ON "tenant_pricing_policies"("tenantId", "active", "name", "id");

ALTER TABLE "tenant_pricing_policies"
ADD CONSTRAINT "tenant_pricing_policies_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_pricing_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_pricing_policies" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_pricing_policies_tenant_select ON "tenant_pricing_policies"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY tenant_pricing_policies_tenant_insert ON "tenant_pricing_policies"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY tenant_pricing_policies_tenant_update ON "tenant_pricing_policies"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY tenant_pricing_policies_tenant_delete ON "tenant_pricing_policies"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
