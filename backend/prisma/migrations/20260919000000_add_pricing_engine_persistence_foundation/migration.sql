-- PRICING-DB-01A: independent Pricing Engine persistence foundation.
-- The application runtime role must not be a superuser and must not have BYPASSRLS.

CREATE TYPE "PricingConfigurationStatus" AS ENUM ('DRAFT', 'ARCHIVED');
CREATE TYPE "PricingCalculationVersionStatus" AS ENUM ('DRAFT', 'APPROVED');
CREATE TYPE "PricingCalculationBasis" AS ENUM (
  'BASE_COST',
  'PRE_TAX_SELLING_PRICE',
  'FINAL_CHARGED_PRICE'
);

CREATE TABLE "pricing_configurations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "costingProjectId" TEXT NOT NULL,
    "status" "PricingConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
    "operationalCostsAmount" DECIMAL(19,5) NOT NULL DEFAULT 0,
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

    CONSTRAINT "pricing_configurations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pricing_configurations_inputs_nonnegative_chk" CHECK (
      "operationalCostsAmount" >= 0
      AND "riskMarginPercent" >= 0
      AND "targetProfitMarginPercent" >= 0
      AND "salesCommissionPercent" >= 0
      AND "bankCommissionPercent" >= 0
      AND "applicableTaxPercent" >= 0
    )
);

CREATE TABLE "pricing_calculation_versions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pricingConfigurationId" TEXT NOT NULL,
    "costingProjectId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "PricingCalculationVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "policyVersion" VARCHAR(32) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "authoritativeCostAmount" DECIMAL(19,5) NOT NULL,
    "operationalCostsAmount" DECIMAL(19,5) NOT NULL,
    "riskMarginPercent" DECIMAL(9,6) NOT NULL,
    "targetProfitMarginPercent" DECIMAL(9,6) NOT NULL,
    "salesCommissionPercent" DECIMAL(9,6) NOT NULL,
    "bankCommissionPercent" DECIMAL(9,6) NOT NULL,
    "applicableTaxPercent" DECIMAL(9,6) NOT NULL,
    "riskBasis" "PricingCalculationBasis" NOT NULL,
    "targetProfitBasis" "PricingCalculationBasis" NOT NULL,
    "salesCommissionBasis" "PricingCalculationBasis" NOT NULL,
    "bankCommissionBasis" "PricingCalculationBasis" NOT NULL,
    "taxBasis" "PricingCalculationBasis" NOT NULL,
    "baseCostAmount" DECIMAL(19,5) NOT NULL,
    "riskAmount" DECIMAL(19,5) NOT NULL,
    "adjustedEconomicCostAmount" DECIMAL(19,5) NOT NULL,
    "targetProfitAmount" DECIMAL(19,5) NOT NULL,
    "salesCommissionAmount" DECIMAL(19,5) NOT NULL,
    "bankCommissionAmount" DECIMAL(19,5) NOT NULL,
    "preTaxSellingPrice" DECIMAL(19,5) NOT NULL,
    "taxAmount" DECIMAL(19,5) NOT NULL,
    "finalSellingPrice" DECIMAL(19,5) NOT NULL,
    "estimatedAgencyProfitBeforeIncomeTax" DECIMAL(19,5) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedByName" TEXT,

    CONSTRAINT "pricing_calculation_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pricing_calculation_versions_number_positive_chk" CHECK ("versionNumber" > 0),
    CONSTRAINT "pricing_calculation_versions_policy_version_chk" CHECK (char_length(btrim("policyVersion")) > 0),
    CONSTRAINT "pricing_calculation_versions_values_nonnegative_chk" CHECK (
      "authoritativeCostAmount" >= 0
      AND "operationalCostsAmount" >= 0
      AND "riskMarginPercent" >= 0
      AND "targetProfitMarginPercent" >= 0
      AND "salesCommissionPercent" >= 0
      AND "bankCommissionPercent" >= 0
      AND "applicableTaxPercent" >= 0
      AND "baseCostAmount" >= 0
      AND "riskAmount" >= 0
      AND "adjustedEconomicCostAmount" >= 0
      AND "targetProfitAmount" >= 0
      AND "salesCommissionAmount" >= 0
      AND "bankCommissionAmount" >= 0
      AND "preTaxSellingPrice" >= 0
      AND "taxAmount" >= 0
      AND "finalSellingPrice" >= 0
      AND "estimatedAgencyProfitBeforeIncomeTax" >= 0
    ),
    CONSTRAINT "pricing_calculation_versions_approval_coherence_chk" CHECK (
      (
        "status" = 'DRAFT'
        AND "approvedAt" IS NULL
        AND "approvedByUserId" IS NULL
        AND "approvedByName" IS NULL
      )
      OR (
        "status" = 'APPROVED'
        AND "approvedAt" IS NOT NULL
        AND "approvedByUserId" IS NOT NULL
        AND "approvedByName" IS NOT NULL
      )
    )
);

CREATE UNIQUE INDEX "pricing_configurations_id_tenant_key"
ON "pricing_configurations"("id", "tenantId");

CREATE UNIQUE INDEX "pricing_configurations_tenant_project_key"
ON "pricing_configurations"("costingProjectId", "tenantId");

CREATE UNIQUE INDEX "pricing_configurations_id_tenant_project_key"
ON "pricing_configurations"("id", "tenantId", "costingProjectId");

CREATE UNIQUE INDEX "pricing_calculation_versions_id_tenant_key"
ON "pricing_calculation_versions"("id", "tenantId");

CREATE UNIQUE INDEX "pricing_calculation_versions_tenant_project_version_key"
ON "pricing_calculation_versions"("tenantId", "costingProjectId", "versionNumber");

CREATE INDEX "pricing_calculation_versions_project_history_idx"
ON "pricing_calculation_versions"("tenantId", "costingProjectId", "createdAt" DESC, "id" DESC);

CREATE INDEX "pricing_calculation_versions_project_status_history_idx"
ON "pricing_calculation_versions"("tenantId", "costingProjectId", "status", "createdAt" DESC, "id" DESC);

ALTER TABLE "pricing_configurations"
ADD CONSTRAINT "pricing_configurations_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pricing_configurations"
ADD CONSTRAINT "pricing_configurations_project_tenant_fkey"
FOREIGN KEY ("costingProjectId", "tenantId") REFERENCES "costing_projects"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pricing_calculation_versions"
ADD CONSTRAINT "pricing_calculation_versions_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pricing_calculation_versions"
ADD CONSTRAINT "pricing_calculation_versions_project_tenant_fkey"
FOREIGN KEY ("costingProjectId", "tenantId") REFERENCES "costing_projects"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pricing_calculation_versions"
ADD CONSTRAINT "pricing_calculation_versions_configuration_project_tenant_fkey"
FOREIGN KEY ("pricingConfigurationId", "tenantId", "costingProjectId")
REFERENCES "pricing_configurations"("id", "tenantId", "costingProjectId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pricing_configurations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pricing_configurations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "pricing_calculation_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pricing_calculation_versions" FORCE ROW LEVEL SECURITY;

CREATE POLICY pricing_configurations_tenant_select ON "pricing_configurations"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY pricing_configurations_tenant_insert ON "pricing_configurations"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY pricing_configurations_tenant_update ON "pricing_configurations"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY pricing_configurations_tenant_delete ON "pricing_configurations"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY pricing_calculation_versions_tenant_select ON "pricing_calculation_versions"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY pricing_calculation_versions_tenant_insert ON "pricing_calculation_versions"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY pricing_calculation_versions_tenant_update ON "pricing_calculation_versions"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
