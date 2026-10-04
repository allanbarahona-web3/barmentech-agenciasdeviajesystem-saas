-- PRICING-COMPONENT-SNAPSHOT-DB-01: immutable per-component decomposition for Pricing versions.
-- Existing PricingCalculationVersion rows intentionally receive no fabricated historical lines.

CREATE TABLE "pricing_calculation_component_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pricingCalculationVersionId" TEXT NOT NULL,
    "costingProjectId" TEXT NOT NULL,
    "costComponentId" TEXT NOT NULL,
    "costSnapshotId" TEXT NOT NULL,
    "costCategoryCode" VARCHAR(80) NOT NULL,
    "costCategoryDisplayName" VARCHAR(160) NOT NULL,
    "componentTitle" VARCHAR(500) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "weight" DECIMAL(30,24) NOT NULL,
    "baseCost" DECIMAL(19,5) NOT NULL,
    "allocatedOperationalExpense" DECIMAL(19,5) NOT NULL,
    "risk" DECIMAL(19,5) NOT NULL,
    "adjustedEconomicCost" DECIMAL(19,5) NOT NULL,
    "preTaxSellingPrice" DECIMAL(19,5) NOT NULL,
    "targetProfit" DECIMAL(19,5) NOT NULL,
    "salesCommission" DECIMAL(19,5) NOT NULL,
    "bankCommission" DECIMAL(19,5) NOT NULL,
    "tax" DECIMAL(19,5) NOT NULL,
    "rawSellingValue" DECIMAL(19,5) NOT NULL,
    "allocatedPublishedPriceRetention" DECIMAL(19,5) NOT NULL,
    "roundingAdjustment" DECIMAL(19,5) NOT NULL,
    "effectiveSellingValue" DECIMAL(19,5) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_calculation_component_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pricing_calculation_component_lines_category_code_nonempty_chk"
      CHECK (char_length(btrim("costCategoryCode")) > 0),
    CONSTRAINT "pricing_calculation_component_lines_category_name_nonempty_chk"
      CHECK (char_length(btrim("costCategoryDisplayName")) > 0),
    CONSTRAINT "pricing_calculation_component_lines_title_nonempty_chk"
      CHECK (char_length(btrim("componentTitle")) > 0),
    CONSTRAINT "pricing_calculation_component_lines_currency_chk"
      CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "pricing_calculation_component_lines_weight_chk"
      CHECK ("weight" >= 0 AND "weight" <= 1),
    CONSTRAINT "pricing_calculation_component_lines_values_nonnegative_chk"
      CHECK (
        "baseCost" >= 0
        AND "allocatedOperationalExpense" >= 0
        AND "risk" >= 0
        AND "adjustedEconomicCost" >= 0
        AND "preTaxSellingPrice" >= 0
        AND "targetProfit" >= 0
        AND "salesCommission" >= 0
        AND "bankCommission" >= 0
        AND "tax" >= 0
        AND "rawSellingValue" >= 0
        AND "allocatedPublishedPriceRetention" >= 0
        AND "effectiveSellingValue" >= 0
      )
);

CREATE UNIQUE INDEX "pricing_calc_component_lines_id_tenant_key"
ON "pricing_calculation_component_lines"("id", "tenantId");

CREATE UNIQUE INDEX "pricing_calc_component_lines_tenant_version_component_key"
ON "pricing_calculation_component_lines"("tenantId", "pricingCalculationVersionId", "costComponentId");

CREATE INDEX "pricing_calc_component_lines_tenant_component_idx"
ON "pricing_calculation_component_lines"("tenantId", "costComponentId");

CREATE INDEX "pricing_calc_component_lines_tenant_snapshot_idx"
ON "pricing_calculation_component_lines"("tenantId", "costSnapshotId");

ALTER TABLE "pricing_calculation_component_lines"
ADD CONSTRAINT "pricing_calc_component_lines_tenant_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pricing_calculation_component_lines"
ADD CONSTRAINT "pricing_calc_component_lines_version_project_fkey"
FOREIGN KEY ("pricingCalculationVersionId", "tenantId", "costingProjectId")
REFERENCES "pricing_calculation_versions"("id", "tenantId", "costingProjectId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pricing_calculation_component_lines"
ADD CONSTRAINT "pricing_calc_component_lines_component_project_fkey"
FOREIGN KEY ("costComponentId", "tenantId", "costingProjectId")
REFERENCES "cost_components"("id", "tenantId", "costingProjectId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pricing_calculation_component_lines"
ADD CONSTRAINT "pricing_calc_component_lines_snapshot_project_fkey"
FOREIGN KEY ("costSnapshotId", "tenantId", "costComponentId", "costingProjectId")
REFERENCES "cost_snapshots"("id", "tenantId", "costComponentId", "costingProjectId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pricing_calculation_component_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pricing_calculation_component_lines" FORCE ROW LEVEL SECURITY;

CREATE POLICY pricing_calculation_component_lines_tenant_select ON "pricing_calculation_component_lines"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY pricing_calculation_component_lines_tenant_insert ON "pricing_calculation_component_lines"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
