import { ConflictException } from "@nestjs/common";
import {
  CUSTOM_QUOTATION_LINE_SOURCE,
  CustomQuotationOperationsIntakeOutboxProducer,
  OPERATIONS_SOURCE_ITEM_APPROVED_EVENT,
} from "./custom-quotation-operations-intake-outbox.producer";

describe("CustomQuotationOperationsIntakeOutboxProducer", () => {
  it("writes one standalone event per accepted immutable version line", async () => {
    const c = context();
    await expect(c.producer.persistMaterializedVersion(c.tx as never, "tenant-a", "version-a")).resolves.toBe(2);
    expect(c.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        expect.objectContaining({ tenantId: "tenant-a", scopeType: "STANDALONE_CUSTOMER", travelPackageId: null, customerId: "customer-a", eventType: OPERATIONS_SOURCE_ITEM_APPROVED_EVENT, eventVersion: 1, sourceType: CUSTOM_QUOTATION_LINE_SOURCE, sourceId: "version-a", sourceLineId: "line-a", sourceVersionId: "version-a", availableAt: acceptedAt }),
        expect.objectContaining({ sourceLineId: "line-b" }),
      ],
    });
  });

  it("is idempotent through the existing outbox source-event unique key", async () => {
    const c = context({ inserted: 0 });
    await expect(c.producer.persistMaterializedVersion(c.tx as never, "tenant-a", "version-a")).resolves.toBe(0);
    expect(c.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
  });

  it.each([
    ["ISSUED", "ACCEPTED", "customer-a"],
    ["ACCEPTED", "REJECTED", "customer-a"],
    ["ACCEPTED", "ACCEPTED", null],
  ])("rejects non-authoritative source state", async (versionStatus, quotationStatus, customerId) => {
    const c = context({ version: version({ status: versionStatus, customQuotation: { status: quotationStatus, customerId } }) });
    await expect(c.producer.persistMaterializedVersion(c.tx as never, "tenant-a", "version-a")).rejects.toBeInstanceOf(ConflictException);
    expect(c.createMany).not.toHaveBeenCalled();
  });

  it("rejects an accepted version with no immutable lines", async () => {
    const c = context({ version: version({ lines: [] }) });
    await expect(c.producer.persistMaterializedVersion(c.tx as never, "tenant-a", "version-a")).rejects.toBeInstanceOf(ConflictException);
    expect(c.createMany).not.toHaveBeenCalled();
  });
});

const acceptedAt = new Date("2026-10-06T12:00:00.000Z");

function context(options: { inserted?: number; version?: Record<string, unknown> | null } = {}) {
  const createMany = jest.fn().mockResolvedValue({ count: options.inserted ?? 2 });
  const tx = {
    customQuotationVersion: { findFirst: jest.fn().mockResolvedValue(options.version === undefined ? version() : options.version) },
    operationsIntakeOutboxEvent: { createMany },
  };
  return { tx, createMany, producer: new CustomQuotationOperationsIntakeOutboxProducer() };
}

function version(overrides: Record<string, unknown> = {}) {
  return {
    id: "version-a", status: "ACCEPTED", acceptedAt, salesOrderId: "sales-a",
    customQuotation: { status: "ACCEPTED", customerId: "customer-a" },
    lines: [{ id: "line-a" }, { id: "line-b" }],
    ...overrides,
  };
}
