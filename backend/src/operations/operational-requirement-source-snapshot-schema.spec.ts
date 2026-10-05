import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = () => readFileSync(resolve(__dirname, "../../prisma/migrations/20261004000000_add_operational_requirement_source_snapshot/migration.sql"), "utf8");
const schema = () => readFileSync(resolve(__dirname, "../../prisma/schema.prisma"), "utf8");
const operationsFoundationMigration = () => readFileSync(resolve(__dirname, "../../prisma/migrations/20260929030000_add_operations_core_foundation/migration.sql"), "utf8");
const operationalRequirementModel = () => schema().match(/model OperationalRequirement \{[\s\S]*?\n\}/)?.[0] ?? "";

describe("OperationalRequirement immutable source snapshot schema foundation", () => {
  it("adds a nullable, source-neutral JSON snapshot while preserving sourceVersionId", () => {
    const prismaSchema = operationalRequirementModel();
    expect(prismaSchema).toContain("sourceVersionId                 String?");
    expect(prismaSchema).toContain("sourceSnapshot                  Json?");
    expect(prismaSchema).not.toMatch(/costComponentTitle|supplierName|costAmount|costingProjectId\s+String/);
  });

  it("uses one additive nullable JSONB column without a fabricated default or backfill", () => {
    const sql = migration();
    expect(sql).toContain('ALTER TABLE "operational_requirements"');
    expect(sql).toContain('ADD COLUMN "sourceSnapshot" JSONB');
    expect(sql).not.toMatch(/\bUPDATE\b|\bINSERT\b|\bDELETE\b|DEFAULT\s+/i);
  });

  it("does not alter existing OperationalRequirement RLS or add speculative JSON indexes", () => {
    const sql = migration();
    expect(sql).not.toMatch(/ROW LEVEL SECURITY|CREATE POLICY|CREATE INDEX/i);
    const foundationSql = operationsFoundationMigration();
    expect(foundationSql).toContain('ALTER TABLE "operational_requirements" ENABLE ROW LEVEL SECURITY');
    expect(foundationSql).toContain('ALTER TABLE "operational_requirements" FORCE ROW LEVEL SECURITY');
  });
});
