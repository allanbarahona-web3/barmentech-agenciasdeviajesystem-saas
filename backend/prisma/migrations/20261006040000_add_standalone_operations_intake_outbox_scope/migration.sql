-- O4.4: retain package intake events while allowing source-neutral standalone
-- customer events. Existing rows are package-scoped by the prior NOT NULL key.

ALTER TABLE "operations_intake_outbox_events"
  ADD COLUMN "scopeType" "OperationalScopeType" NOT NULL DEFAULT 'TRAVEL_PACKAGE',
  ADD COLUMN "customerId" TEXT;

ALTER TABLE "operations_intake_outbox_events"
  ALTER COLUMN "travelPackageId" DROP NOT NULL;

ALTER TABLE "operations_intake_outbox_events"
  ADD CONSTRAINT "operations_intake_outbox_events_scope_context_chk"
  CHECK (
    ("scopeType" = 'TRAVEL_PACKAGE' AND "travelPackageId" IS NOT NULL AND "customerId" IS NULL)
    OR
    ("scopeType" = 'STANDALONE_CUSTOMER' AND "travelPackageId" IS NULL AND "customerId" IS NOT NULL)
  );

ALTER TABLE "operations_intake_outbox_events"
  ADD CONSTRAINT "operations_intake_outbox_events_customer_tenant_fkey"
  FOREIGN KEY ("customerId", "tenantId")
  REFERENCES "Client"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
