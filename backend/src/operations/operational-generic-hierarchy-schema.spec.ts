import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = () => readFileSync(resolve(__dirname, "../../prisma/migrations/20261006020000_add_operational_generic_hierarchy_keys/migration.sql"), "utf8");
const schema = () => readFileSync(resolve(__dirname, "../../prisma/schema.prisma"), "utf8");
const model = (name: string) => schema().match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";

describe("Operations generic aggregate hierarchy keys", () => {
  it("uses tenant-safe generic parents for fulfillment, purchase, and evidence", () => {
    expect(model("OperationalFulfillment")).toContain('fields: [operationalRequirementId, tenantId], references: [id, tenantId], onDelete: Restrict, map: "operational_fulfillments_requirement_tenant_fkey"');
    expect(model("OperationalFulfillment")).toContain('@@unique([id, tenantId], map: "operational_fulfillments_id_tenant_key")');
    expect(model("OperationalPurchase")).toContain('fields: [operationalFulfillmentId, tenantId], references: [id, tenantId], onDelete: Restrict, map: "operational_purchases_fulfillment_tenant_fkey"');
    expect(model("OperationalPurchase")).toContain('@@unique([id, tenantId, operationalFulfillmentId], map: "operational_purchases_id_tenant_fulfillment_key")');
    expect(model("OperationalEvidence")).toContain('fields: [operationalFulfillmentId, tenantId], references: [id, tenantId], onDelete: Restrict, map: "operational_evidence_fulfillment_tenant_fkey"');
    expect(model("OperationalEvidence")).toContain('fields: [operationalPurchaseId, tenantId, operationalFulfillmentId], references: [id, tenantId, operationalFulfillmentId], onDelete: Restrict, map: "operational_evidence_purchase_fulfillment_tenant_fkey"');
  });

  it("adds generic keys without removing travel package keys or passenger constraints", () => {
    const sql = migration();
    for (const name of [
      "operational_fulfillments_id_tenant_key",
      "operational_purchases_id_tenant_key",
      "operational_purchases_id_tenant_fulfillment_key",
      "operational_fulfillments_requirement_tenant_fkey",
      "operational_purchases_fulfillment_tenant_fkey",
      "operational_evidence_fulfillment_tenant_fkey",
      "operational_evidence_purchase_fulfillment_tenant_fkey",
    ]) expect(sql).toContain(name);
    expect(sql).not.toMatch(/DROP CONSTRAINT|DROP COLUMN/i);
    expect(sql).toContain("Passenger tables remain package-specific");
    expect(model("OperationalRequirementPassenger")).toContain("travelPackageId            String");
    expect(model("OperationalFulfillmentPassenger")).toContain("travelPackageId            String");
  });
});
