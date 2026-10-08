-- CPS-1: retain the exact published Pricing authority selected when a Contract is archived.
-- Existing Contracts intentionally remain null; historical Pricing lineage is not inferred.

ALTER TABLE "Contract"
ADD COLUMN "commercialPricingPublicationId" TEXT,
ADD COLUMN "commercialPublishedPricePerPerson" DECIMAL(19,5),
ADD CONSTRAINT "Contract_commercial_pricing_authority_coherence_chk"
  CHECK (
    (
      "commercialPricingPublicationId" IS NULL
      AND "commercialPublishedPricePerPerson" IS NULL
    )
    OR (
      "commercialPricingPublicationId" IS NOT NULL
      AND "commercialPublishedPricePerPerson" IS NOT NULL
      AND "commercialPublishedPricePerPerson" >= 0
    )
  );

CREATE INDEX "Contract_tenant_commercial_pricing_publication_idx"
ON "Contract"("tenantId", "commercialPricingPublicationId");

ALTER TABLE "Contract"
ADD CONSTRAINT "Contract_commercial_pricing_publication_tenant_fkey"
FOREIGN KEY ("commercialPricingPublicationId", "tenantId")
REFERENCES "travel_package_pricing_publications"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;
