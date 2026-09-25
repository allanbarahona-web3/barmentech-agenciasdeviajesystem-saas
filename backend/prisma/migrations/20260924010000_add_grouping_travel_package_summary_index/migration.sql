-- PASSENGER-GROUPS-G3.1-DB-01: supports tenant/type-scoped grouping-summary pagination.
CREATE INDEX "travel_packages_tenant_type_departure_id_idx"
ON "TravelPackage"("tenantId", "travelType", "departureDate", "id");
