-- Supports bounded, deterministic Accounting Cost report reads.
CREATE INDEX "operational_purchases_tenant_purchased_id_desc_idx"
ON "operational_purchases"("tenantId", "purchasedAt" DESC, "id" DESC);

CREATE INDEX "operational_purchases_tenant_currency_purchased_id_desc_idx"
ON "operational_purchases"("tenantId", "currency", "purchasedAt" DESC, "id" DESC);

CREATE INDEX "operational_requirements_customer_id_idx"
ON "operational_requirements"("tenantId", "customerId", "id");

CREATE INDEX "operational_fulfillments_requirement_id_idx"
ON "operational_fulfillments"("tenantId", "operationalRequirementId", "id");

CREATE INDEX "operational_requirements_purpose_id_idx"
ON "operational_requirements"("tenantId", "servicePurposeCode", "id");
