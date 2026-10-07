import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("standalone Operations intake outbox scope schema", () => {
  it("keeps travel events valid while adding tenant-safe standalone customer context", () => {
    const schema = readFileSync(resolve(__dirname, "../../prisma/schema.prisma"), "utf8");
    const migration = readFileSync(resolve(__dirname, "../../prisma/migrations/20261006040000_add_standalone_operations_intake_outbox_scope/migration.sql"), "utf8");
    expect(schema).toContain("scopeType       OperationalScopeType");
    expect(schema).toContain("travelPackageId String?");
    expect(schema).toContain("customerId      String?");
    expect(schema).toContain('operations_intake_outbox_events_customer_tenant_fkey');
    expect(migration).toContain('ALTER COLUMN "travelPackageId" DROP NOT NULL');
    expect(migration).toContain('"scopeType" = \'TRAVEL_PACKAGE\' AND "travelPackageId" IS NOT NULL AND "customerId" IS NULL');
    expect(migration).toContain('"scopeType" = \'STANDALONE_CUSTOMER\' AND "travelPackageId" IS NULL AND "customerId" IS NOT NULL');
  });
});
