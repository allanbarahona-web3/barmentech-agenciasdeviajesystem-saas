-- CONTRACT-COMMERCIAL-FREEZE-DB-01: append-only commercial evidence at reservation approval.
-- Existing Contracts intentionally receive no fabricated historical snapshots.

CREATE TABLE "contract_commercial_snapshots" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "travelPackageId" TEXT NOT NULL,
    "costingProjectId" TEXT NOT NULL,
    "pricingCalculationVersionId" TEXT NOT NULL,
    "travelPackagePricingPublicationId" TEXT NOT NULL,
    "unitScope" VARCHAR(32) NOT NULL,
    "perPersonSellingPrice" DECIMAL(19,5) NOT NULL,
    "billablePassengerQuantity" INTEGER NOT NULL,
    "commercialTotal" DECIMAL(19,5) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "frozenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "frozenByUserId" TEXT NOT NULL,
    "frozenByName" TEXT NOT NULL,

    CONSTRAINT "contract_commercial_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contract_commercial_snapshots_unit_scope_chk"
      CHECK ("unitScope" = 'PER_PERSON'),
    CONSTRAINT "contract_commercial_snapshots_billable_quantity_chk"
      CHECK ("billablePassengerQuantity" > 0),
    CONSTRAINT "contract_commercial_snapshots_amounts_chk"
      CHECK ("perPersonSellingPrice" >= 0 AND "commercialTotal" >= 0),
    CONSTRAINT "contract_commercial_snapshots_currency_chk"
      CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "contract_commercial_snapshots_actor_chk"
      CHECK (char_length(btrim("frozenByUserId")) > 0 AND char_length(btrim("frozenByName")) > 0)
);

CREATE TABLE "contract_commercial_snapshot_passengers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contractCommercialSnapshotId" TEXT NOT NULL,
    "travelPackageId" TEXT NOT NULL,
    "travelPackageParticipantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "role" "TravelPackageParticipantRole" NOT NULL,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "unitMultiplier" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_commercial_snapshot_passengers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ccsp_billable_unit_chk"
      CHECK ("billable" = true AND "unitMultiplier" = 1)
);

CREATE TABLE "contract_commercial_snapshot_component_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contractCommercialSnapshotId" TEXT NOT NULL,
    "costingProjectId" TEXT NOT NULL,
    "costComponentId" TEXT NOT NULL,
    "costSnapshotId" TEXT NOT NULL,
    "costCategoryCode" VARCHAR(80) NOT NULL,
    "costCategoryDisplayName" VARCHAR(160) NOT NULL,
    "componentTitle" VARCHAR(500) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
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

    CONSTRAINT "contract_commercial_snapshot_component_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ccscl_text_chk"
      CHECK (
        char_length(btrim("costCategoryCode")) > 0
        AND char_length(btrim("costCategoryDisplayName")) > 0
        AND char_length(btrim("componentTitle")) > 0
      ),
    CONSTRAINT "ccscl_currency_chk" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "ccscl_values_nonnegative_chk"
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

CREATE UNIQUE INDEX "contract_commercial_snapshots_contract_tenant_key"
ON "contract_commercial_snapshots"("contractId", "tenantId");
CREATE UNIQUE INDEX "contract_commercial_snapshots_id_tenant_key"
ON "contract_commercial_snapshots"("id", "tenantId");
CREATE UNIQUE INDEX "contract_commercial_snapshots_id_tenant_travel_key"
ON "contract_commercial_snapshots"("id", "tenantId", "travelPackageId");
CREATE INDEX "contract_commercial_snapshots_tenant_travel_contract_idx"
ON "contract_commercial_snapshots"("tenantId", "travelPackageId", "contractId");
CREATE INDEX "contract_commercial_snapshots_tenant_pricing_version_idx"
ON "contract_commercial_snapshots"("tenantId", "pricingCalculationVersionId");

CREATE UNIQUE INDEX "ccsp_tenant_snapshot_participant_key"
ON "contract_commercial_snapshot_passengers"("tenantId", "contractCommercialSnapshotId", "travelPackageParticipantId");
CREATE UNIQUE INDEX "ccsp_id_tenant_key"
ON "contract_commercial_snapshot_passengers"("id", "tenantId");
CREATE INDEX "ccsp_tenant_participant_snapshot_idx"
ON "contract_commercial_snapshot_passengers"("tenantId", "travelPackageParticipantId", "contractCommercialSnapshotId");

CREATE UNIQUE INDEX "ccscl_tenant_snapshot_component_key"
ON "contract_commercial_snapshot_component_lines"("tenantId", "contractCommercialSnapshotId", "costComponentId");
CREATE UNIQUE INDEX "ccscl_id_tenant_key"
ON "contract_commercial_snapshot_component_lines"("id", "tenantId");
CREATE INDEX "ccscl_tenant_cost_snapshot_idx"
ON "contract_commercial_snapshot_component_lines"("tenantId", "costSnapshotId");

ALTER TABLE "contract_commercial_snapshots"
ADD CONSTRAINT "contract_commercial_snapshots_tenant_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contract_commercial_snapshots"
ADD CONSTRAINT "contract_commercial_snapshots_contract_tenant_fkey"
FOREIGN KEY ("contractId", "tenantId") REFERENCES "Contract"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contract_commercial_snapshots"
ADD CONSTRAINT "contract_commercial_snapshots_travel_tenant_fkey"
FOREIGN KEY ("travelPackageId", "tenantId") REFERENCES "TravelPackage"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contract_commercial_snapshots"
ADD CONSTRAINT "contract_commercial_snapshots_pricing_version_tenant_fkey"
FOREIGN KEY ("pricingCalculationVersionId", "tenantId", "costingProjectId")
REFERENCES "pricing_calculation_versions"("id", "tenantId", "costingProjectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contract_commercial_snapshots"
ADD CONSTRAINT "contract_commercial_snapshots_publication_tenant_fkey"
FOREIGN KEY ("travelPackagePricingPublicationId", "tenantId")
REFERENCES "travel_package_pricing_publications"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contract_commercial_snapshot_passengers"
ADD CONSTRAINT "ccsp_tenant_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contract_commercial_snapshot_passengers"
ADD CONSTRAINT "ccsp_snapshot_tenant_travel_fkey"
FOREIGN KEY ("contractCommercialSnapshotId", "tenantId", "travelPackageId")
REFERENCES "contract_commercial_snapshots"("id", "tenantId", "travelPackageId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contract_commercial_snapshot_passengers"
ADD CONSTRAINT "ccsp_participant_tenant_travel_fkey"
FOREIGN KEY ("travelPackageParticipantId", "tenantId", "travelPackageId")
REFERENCES "travel_package_participants"("id", "tenantId", "travelPackageId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contract_commercial_snapshot_passengers"
ADD CONSTRAINT "ccsp_client_tenant_fkey"
FOREIGN KEY ("clientId", "tenantId") REFERENCES "Client"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contract_commercial_snapshot_component_lines"
ADD CONSTRAINT "ccscl_tenant_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contract_commercial_snapshot_component_lines"
ADD CONSTRAINT "ccscl_snapshot_tenant_fkey"
FOREIGN KEY ("contractCommercialSnapshotId", "tenantId")
REFERENCES "contract_commercial_snapshots"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contract_commercial_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contract_commercial_snapshots" FORCE ROW LEVEL SECURITY;
CREATE POLICY contract_commercial_snapshots_tenant_select ON "contract_commercial_snapshots"
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY contract_commercial_snapshots_tenant_insert ON "contract_commercial_snapshots"
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

ALTER TABLE "contract_commercial_snapshot_passengers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contract_commercial_snapshot_passengers" FORCE ROW LEVEL SECURITY;
CREATE POLICY ccsp_tenant_select ON "contract_commercial_snapshot_passengers"
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY ccsp_tenant_insert ON "contract_commercial_snapshot_passengers"
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

ALTER TABLE "contract_commercial_snapshot_component_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contract_commercial_snapshot_component_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY ccscl_tenant_select ON "contract_commercial_snapshot_component_lines"
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY ccscl_tenant_insert ON "contract_commercial_snapshot_component_lines"
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
