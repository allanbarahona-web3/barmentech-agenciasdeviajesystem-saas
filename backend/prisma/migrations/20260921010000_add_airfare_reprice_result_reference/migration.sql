-- AIRFARE-PRICING-AUTO-01B: retain the immutable automatic Pricing result on its durable request.

ALTER TABLE "airfare_pricing_reprice_requests"
ADD COLUMN "pricingCalculationVersionId" TEXT;

CREATE UNIQUE INDEX "airfare_pricing_reprice_requests_tenant_version_project_key"
ON "airfare_pricing_reprice_requests"("tenantId", "pricingCalculationVersionId", "costingProjectId");

ALTER TABLE "airfare_pricing_reprice_requests"
ADD CONSTRAINT "airfare_pricing_reprice_requests_version_project_tenant_fkey"
FOREIGN KEY ("pricingCalculationVersionId", "tenantId", "costingProjectId") REFERENCES "pricing_calculation_versions"("id", "tenantId", "costingProjectId")
ON DELETE RESTRICT ON UPDATE CASCADE;
