-- COST-COMP-01A: generic, versioned Cost Component structural detail foundation.
-- Monetary authority remains exclusively in cost_snapshots.

ALTER TABLE "cost_components"
  ADD COLUMN "detailPayload" JSONB,
  ADD COLUMN "detailSchemaVersion" INTEGER,
  ADD COLUMN "quantity" DECIMAL(19,5),
  ADD COLUMN "unit" TEXT;
