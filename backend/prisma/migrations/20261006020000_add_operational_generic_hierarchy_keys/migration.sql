-- O4.3B: generic tenant-safe aggregate hierarchy keys. The existing
-- travelPackageId columns, package indexes, and package-composite foreign keys
-- stay in place for the travel-scoped dual-safe rollout.

CREATE UNIQUE INDEX "operational_fulfillments_id_tenant_key"
ON "operational_fulfillments"("id", "tenantId");

CREATE UNIQUE INDEX "operational_purchases_id_tenant_key"
ON "operational_purchases"("id", "tenantId");

CREATE UNIQUE INDEX "operational_purchases_id_tenant_fulfillment_key"
ON "operational_purchases"("id", "tenantId", "operationalFulfillmentId");

ALTER TABLE "operational_fulfillments"
ADD CONSTRAINT "operational_fulfillments_requirement_tenant_fkey"
FOREIGN KEY ("operationalRequirementId", "tenantId")
REFERENCES "operational_requirements"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_purchases"
ADD CONSTRAINT "operational_purchases_fulfillment_tenant_fkey"
FOREIGN KEY ("operationalFulfillmentId", "tenantId")
REFERENCES "operational_fulfillments"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_evidence"
ADD CONSTRAINT "operational_evidence_fulfillment_tenant_fkey"
FOREIGN KEY ("operationalFulfillmentId", "tenantId")
REFERENCES "operational_fulfillments"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_evidence"
ADD CONSTRAINT "operational_evidence_purchase_fulfillment_tenant_fkey"
FOREIGN KEY ("operationalPurchaseId", "tenantId", "operationalFulfillmentId")
REFERENCES "operational_purchases"("id", "tenantId", "operationalFulfillmentId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Deliberately retained in this phase:
--   operational_fulfillments_requirement_tenant_travel_fkey
--   operational_purchases_fulfillment_tenant_travel_fkey
--   operational_evidence_fulfillment_tenant_travel_fkey
--   operational_evidence_purchase_fulfillment_tenant_travel_fkey
-- Passenger tables remain package-specific and are not changed here.
