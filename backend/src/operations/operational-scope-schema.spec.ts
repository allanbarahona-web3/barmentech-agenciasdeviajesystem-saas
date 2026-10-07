import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = () => readFileSync(resolve(__dirname, "../../prisma/migrations/20261006010000_add_operational_requirement_scope_foundation/migration.sql"), "utf8");
const schema = () => readFileSync(resolve(__dirname, "../../prisma/schema.prisma"), "utf8");
const operationalRequirementModel = () => schema().match(/model OperationalRequirement \{[\s\S]*?\n\}/)?.[0] ?? "";

describe("OperationalRequirement scope foundation", () => {
  it("declares direct TravelPackage and standalone-customer scope fields with tenant-safe relations", () => {
    const model = operationalRequirementModel();
    expect(schema()).toContain("enum OperationalScopeType");
    expect(schema()).toContain("TRAVEL_PACKAGE");
    expect(schema()).toContain("STANDALONE_CUSTOMER");
    expect(model).toContain("scopeType                       OperationalScopeType              @default(TRAVEL_PACKAGE)");
    expect(model).toContain("travelPackageId                 String?");
    expect(model).toContain("customerId                      String?");
    expect(model).toContain('references: [id, tenantId], onDelete: Restrict, map: "operational_requirements_customer_tenant_fkey"');
    expect(model).toContain('@@unique([id, tenantId], map: "operational_requirements_id_tenant_key")');
    expect(model).toContain('@@unique([id, tenantId, travelPackageId], map: "operational_requirements_id_tenant_travel_key")');
  });

  it("backfills existing requirements as TravelPackage scope and preserves the package hierarchy", () => {
    const sql = migration();
    expect(sql).toContain('UPDATE "operational_requirements"');
    expect(sql).toContain('SET "scopeType" = \'TRAVEL_PACKAGE\'');
    expect(sql).toContain('ALTER COLUMN "travelPackageId" DROP NOT NULL');
    expect(sql).toContain('operational_requirements_scope_context_chk');
    expect(sql).toContain('"scopeType" = \'TRAVEL_PACKAGE\' AND "travelPackageId" IS NOT NULL AND "customerId" IS NULL');
    expect(sql).toContain('"scopeType" = \'STANDALONE_CUSTOMER\' AND "travelPackageId" IS NULL AND "customerId" IS NOT NULL');
    expect(sql).toContain('FOREIGN KEY ("customerId", "tenantId") REFERENCES "Client"("id", "tenantId")');
    expect(sql).toContain('CREATE UNIQUE INDEX "operational_requirements_id_tenant_key"');
    expect(sql).not.toMatch(/DROP CONSTRAINT "operational_requirements_travel_tenant_fkey"/);
  });

  it("defers the global source identity index until its manual duplicate audit", () => {
    const sql = migration();
    expect(sql).toContain('A future migration may replace the package-qualified source identity');
    expect(sql).not.toContain('CREATE UNIQUE INDEX "operational_requirements_source_identity_global_unique_idx"');
  });
});
