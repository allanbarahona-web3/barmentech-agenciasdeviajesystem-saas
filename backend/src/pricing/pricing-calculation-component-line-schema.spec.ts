import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = () => readFileSync(
  resolve(__dirname, "../../prisma/migrations/20261003000000_add_pricing_calculation_component_lines/migration.sql"),
  "utf8",
);
const schema = () => readFileSync(resolve(__dirname, "../../prisma/schema.prisma"), "utf8");

describe("Pricing calculation component-line schema foundation", () => {
  it("keeps one immutable component snapshot per tenant/version/component", () => {
    const sql = migration();
    expect(sql).toContain('CREATE TABLE "pricing_calculation_component_lines"');
    expect(sql).toContain('CREATE UNIQUE INDEX "pricing_calc_component_lines_tenant_version_component_key"');
    expect(sql).toContain('"tenantId", "pricingCalculationVersionId", "costComponentId"');
    expect(sql).not.toMatch(/UPDATE POLICY|FOR UPDATE|FOR DELETE/i);
  });

  it("uses tenant-safe Pricing, CostComponent, and CostSnapshot relationships", () => {
    const sql = migration();
    expect(sql).toContain('REFERENCES "pricing_calculation_versions"("id", "tenantId", "costingProjectId")');
    expect(sql).toContain('REFERENCES "cost_components"("id", "tenantId", "costingProjectId")');
    expect(sql).toContain('REFERENCES "cost_snapshots"("id", "tenantId", "costComponentId", "costingProjectId")');
    expect(schema()).toContain('model PricingCalculationComponentLine');
    expect(schema()).toContain('componentLines                       PricingCalculationComponentLine[]');
  });

  it("persists the five-decimal calculator outputs with high-precision weight", () => {
    const sql = migration();
    for (const field of [
      '"baseCost" DECIMAL(19,5)',
      '"allocatedOperationalExpense" DECIMAL(19,5)',
      '"risk" DECIMAL(19,5)',
      '"effectiveSellingValue" DECIMAL(19,5)',
      '"roundingAdjustment" DECIMAL(19,5)',
    ]) expect(sql).toContain(field);
    expect(sql).toContain('"weight" DECIMAL(30,24)');
  });

  it("uses append-only tenant RLS and does not fabricate historical lines", () => {
    const sql = migration();
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
    expect(sql).toContain('pricing_calculation_component_lines_tenant_select');
    expect(sql).toContain('pricing_calculation_component_lines_tenant_insert');
    expect(sql).not.toMatch(/INSERT INTO "pricing_calculation_component_lines"/);
  });
});
