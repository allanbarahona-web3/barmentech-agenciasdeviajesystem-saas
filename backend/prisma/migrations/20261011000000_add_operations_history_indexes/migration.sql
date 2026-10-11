-- Supports read-only terminal Operations history without changing persisted data.
CREATE INDEX "operational_fulfillments_travel_status_updated_id_idx"
ON "operational_fulfillments"("tenantId", "travelPackageId", "status", "updatedAt" DESC, "id");

CREATE INDEX "ofp_tenant_participant_fulfillment_idx"
ON "operational_fulfillment_passengers"("tenantId", "travelPackageParticipantId", "operationalFulfillmentId");
