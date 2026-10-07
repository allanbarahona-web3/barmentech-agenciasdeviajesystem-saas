import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = () => readFileSync(resolve(__dirname, "../../prisma/migrations/20261006030000_enable_standalone_operational_requirement_materialization/migration.sql"), "utf8");
const schema = () => readFileSync(resolve(__dirname, "../../prisma/schema.prisma"), "utf8");
const model = (name: string) => schema().match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";

describe("Standalone Operations materialization schema", () => {
  it("permits future generic descendants without changing travel-only passenger tables", () => {
    expect(model("OperationalFulfillment")).toContain("travelPackageId          String?");
    expect(model("OperationalPurchase")).toContain("travelPackageId          String?");
    expect(model("OperationalEvidence")).toContain("travelPackageId          String?");
    expect(model("OperationalRequirementPassenger")).toContain("travelPackageId            String");
    expect(model("OperationalFulfillmentPassenger")).toContain("travelPackageId            String");
  });

  it("adds null-safe standalone source identity without removing travel constraints", () => {
    const sql = migration();
    expect(sql).toContain('ALTER COLUMN "travelPackageId" DROP NOT NULL');
    expect(sql).toContain('CREATE UNIQUE INDEX "operational_requirements_standalone_source_identity_unique_idx"');
    expect(sql).toContain('"scopeType" = \'STANDALONE_CUSTOMER\'');
    expect(sql).toContain('"tenantId", "sourceType", "sourceId", "sourceLineId"');
    expect(sql).toContain("Passenger tables are intentionally unchanged");
    expect(sql).not.toMatch(/DROP CONSTRAINT|DROP COLUMN/i);
  });
});
