import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = () => readFileSync(resolve(__dirname, "../../prisma/migrations/20260930000000_add_operations_intake_outbox/migration.sql"), "utf8");
const schema = () => readFileSync(resolve(__dirname, "../../prisma/schema.prisma"), "utf8");

describe("Operations intake outbox schema foundation", () => {
  it("uses a partial source identity index without affecting MANUAL or incomplete historical rows", () => {
    const sql = migration();
    expect(sql).toContain('CREATE UNIQUE INDEX "operational_requirements_source_identity_unique_idx"');
    expect(sql).toContain('"tenantId", "travelPackageId", "sourceType", "sourceId", "sourceLineId"');
    expect(sql).toContain('AND "sourceType" <> \'MANUAL\'');
    expect(sql).toContain('AND "sourceId" IS NOT NULL');
    expect(sql).toContain('AND "sourceLineId" IS NOT NULL');
  });

  it("adds a neutral, one-event-per-source-line outbox with bounded retry and lease metadata", () => {
    const sql = migration();
    for (const field of ['"eventType"', '"sourceType"', '"sourceId"', '"sourceLineId"', '"availableAt"', '"attemptCount"', '"maximumAttempts"', '"lockedAt"', '"lockedBy"', '"lastAttemptAt"', '"lastError"', '"processedAt"']) expect(sql).toContain(field);
    expect(sql).toContain('CREATE UNIQUE INDEX "operations_intake_outbox_source_event_key"');
    expect(sql).toContain('"tenantId", "eventType", "sourceType", "sourceId", "sourceLineId"');
    expect(sql).not.toMatch(/additional_service_order|additionalServiceOrder/i);
  });

  it("keeps the outbox tenant/package safe and represented in Prisma", () => {
    const sql = migration();
    expect(sql).toContain('REFERENCES "TravelPackage"("id", "tenantId")');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
    for (const operation of ['tenant_select', 'tenant_insert', 'tenant_update', 'tenant_delete']) expect(sql).toContain(`operations_intake_outbox_events_${operation}`);
    expect(schema()).toContain('model OperationsIntakeOutboxEvent');
    expect(schema()).toContain('@@map("operations_intake_outbox_events")');
  });
});
