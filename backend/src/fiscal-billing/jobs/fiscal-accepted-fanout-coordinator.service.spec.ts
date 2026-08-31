/// <reference types="jest" />

import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_TYPE,
  ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_VERSION,
  accountReceivableRecognitionDeduplicationKey,
  FISCAL_ACCEPTED_FANOUT_PARENT_EVENT_TYPE,
  FISCAL_ACCEPTED_FANOUT_PARENT_EVENT_VERSION,
} from "./fiscal-accepted-fanout.constants";
import { FiscalAcceptedFanoutCoordinatorService } from "./fiscal-accepted-fanout-coordinator.service";

describe("FiscalAcceptedFanoutCoordinatorService", () => {
  it("creates one exact provider-neutral receivable child and completes its parent in the fan-out transaction", async () => {
    const c = context([parent()]);

    await c.service.fanOutAvailableEvents();

    expect(c.tx.billingOutboxEvent.createMany).toHaveBeenCalledWith({
      data: [childData(parent())], skipDuplicates: true,
    });
    expect(c.tx.billingOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "parent-a", tenantId: "tenant-a", status: "PROCESSING" }),
      data: expect.objectContaining({ status: "PROCESSED", lockedAt: null, lockedBy: null }),
    }));
    expect(c.prisma.$transaction).toHaveBeenCalledTimes(2);
    const data = c.tx.billingOutboxEvent.createMany.mock.calls[0][0].data;
    for (const row of data) expect(Object.keys(row.payload).sort()).toEqual(["billingDocumentId", "eventVersion", "tenantId"]);
    expect(JSON.stringify(data)).not.toMatch(/provider|hacienda|factura|customer|amount|money/i);
    expect(JSON.stringify(data)).not.toContain("billing-document.invoice-auto-delivery-requested");
  });

  it("does not complete the parent when child persistence fails", async () => {
    const c = context([parent()]);
    c.tx.billingOutboxEvent.createMany.mockRejectedValueOnce(new Error("insert failed"));

    await c.service.fanOutAvailableEvents();

    expect(c.tx.billingOutboxEvent.updateMany).not.toHaveBeenCalled();
    expect(c.root.billingOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "PENDING", lastError: "FISCAL_ACCEPTED_FANOUT_FAILED" }),
    }));
  });

  it("accepts an existing exact child without creating a duplicate", async () => {
    const event = parent();
    const c = context([event], { createCount: 0, child: child(event) });

    await c.service.fanOutAvailableEvents();

    expect(c.tx.billingOutboxEvent.createMany).toHaveBeenCalledWith({ data: [childData(event)], skipDuplicates: true });
    expect(c.tx.billingOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "PROCESSED" }),
    }));
  });

  it("keeps repeated coordinator cycles to one exact child through the tenant deduplication key", async () => {
    const event = parent();
    const c = context([event], { child: child(event) });
    c.tx.$queryRaw.mockReset()
      .mockResolvedValueOnce([event])
      .mockResolvedValueOnce([{ id: event.id }])
      .mockResolvedValueOnce([event])
      .mockResolvedValueOnce([{ id: event.id }]);
    c.tx.billingOutboxEvent.createMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await c.service.fanOutAvailableEvents();
    await c.service.fanOutAvailableEvents();

    expect(c.tx.billingOutboxEvent.createMany).toHaveBeenCalledTimes(2);
    expect(c.tx.billingOutboxEvent.createMany.mock.calls.every((call) => call[0].skipDuplicates)).toBe(true);
    expect(c.tx.billingOutboxEvent.findUnique.mock.calls.filter((call) => "tenantId_deduplicationKey" in call[0].where)).toHaveLength(2);
  });

  it.each([
    ["tenant", { tenantId: "tenant-b" }],
    ["type", { eventType: "other" }],
    ["version", { eventVersion: 2 }],
    ["aggregate", { aggregateId: "document-b" }],
    ["causation", { causationId: "parent-b" }],
    ["deduplication", { deduplicationKey: "other" }],
    ["payload", { payload: { tenantId: "tenant-a", billingDocumentId: "document-a", eventVersion: 1, extra: true } }],
  ])("fails safely for a contradictory existing child: %s", async (_, override) => {
    const event = parent();
    const c = context([event], { createCount: 0, child: child(event, override) });

    await c.service.fanOutAvailableEvents();

    expect(c.tx.billingOutboxEvent.updateMany).not.toHaveBeenCalled();
    expect(c.root.billingOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "FAILED", lastError: "FISCAL_ACCEPTED_FANOUT_CHILD_CONFLICT" }),
    }));
  });

  it("claims only the accepted parent version with bounded SKIP LOCKED leasing", async () => {
    const c = context([]);

    await c.service.fanOutAvailableEvents();

    const sql = rawSql(c.tx.$queryRaw);
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain('"eventType" = ?');
    expect(sql).toContain('"eventVersion" = ?');
    expect(c.tx.$queryRaw.mock.calls[0]).toEqual(expect.arrayContaining([
      FISCAL_ACCEPTED_FANOUT_PARENT_EVENT_TYPE,
      FISCAL_ACCEPTED_FANOUT_PARENT_EVENT_VERSION,
    ]));
    expect(sql).not.toContain("electronic-issuance-requested");
    expect(sql).not.toContain(ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_TYPE);
  });

  it.each([
    ["additional payload data", { payload: { tenantId: "tenant-a", billingDocumentId: "document-a", eventVersion: 1, providerId: "forbidden" } }],
    ["wrong aggregate", { aggregateType: "Other" }],
    ["tenant mismatch", { payload: { tenantId: "tenant-b", billingDocumentId: "document-a", eventVersion: 1 } }],
  ])("fails malformed claimed parents without creating a child: %s", async (_, override) => {
    const c = context([parent(override)]);

    await c.service.fanOutAvailableEvents();

    expect(c.tx.billingOutboxEvent.createMany).not.toHaveBeenCalled();
    expect(c.root.billingOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "FAILED", lastError: "FISCAL_ACCEPTED_FANOUT_PARENT_INVALID" }),
    }));
  });

  it("uses tenant-scoped child identity and preserves parent causation and aggregate identity", async () => {
    const first = parent();
    const second = parent({ id: "parent-b", tenantId: "tenant-b", aggregateId: "document-a", payload: { tenantId: "tenant-b", billingDocumentId: "document-a", eventVersion: 1 } });
    const c = context([first, second]);

    await c.service.fanOutAvailableEvents();

    expect(c.tx.billingOutboxEvent.createMany.mock.calls.map((call) => call[0].data)).toEqual([
      [childData(first)], [childData(second)],
    ]);
    expect(accountReceivableRecognitionDeduplicationKey("document-a")).toBe(
      "billing-document.fiscal-accepted:receivable:document-a:v1",
    );
  });
});

function context(events: ReturnType<typeof parent>[], options: { createCount?: number; child?: Record<string, unknown> | null } = {}) {
  const queryRaw = jest.fn()
    .mockResolvedValueOnce(events)
    .mockImplementation(async () => [{ id: "parent-a" }]);
  const tx = {
    $queryRaw: queryRaw,
    billingOutboxEvent: {
      findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if ("id" in where) return events.find((event) => event.id === where.id) ?? null;
        const deduplicationKey = (where.tenantId_deduplicationKey as { deduplicationKey?: string } | undefined)?.deduplicationKey;
        return options.child === undefined ? child(events[0]) : options.child;
      }),
      createMany: jest.fn().mockResolvedValue({ count: options.createCount ?? 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const root = { billingOutboxEvent: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
  const prisma = {
    $transaction: jest.fn(async (work: (value: typeof tx) => unknown) => work(tx)),
    ...root,
  } as unknown as PrismaService;
  return { service: new FiscalAcceptedFanoutCoordinatorService(prisma), prisma, tx, root };
}

function parent(overrides: Record<string, unknown> = {}) {
  return {
    id: "parent-a", tenantId: "tenant-a",
    eventType: FISCAL_ACCEPTED_FANOUT_PARENT_EVENT_TYPE,
    eventVersion: FISCAL_ACCEPTED_FANOUT_PARENT_EVENT_VERSION,
    aggregateType: "BillingDocument", aggregateId: "document-a",
    payload: { tenantId: "tenant-a", billingDocumentId: "document-a", eventVersion: 1 } as Prisma.JsonObject,
    attemptCount: 1, maximumAttempts: 5, ...overrides,
  };
}

function child(event: ReturnType<typeof parent>, overrides: Record<string, unknown> = {}) {
  return { id: "child-a", ...childData(event), ...overrides };
}

function childData(event: ReturnType<typeof parent>) {
  const payload = event.payload as { tenantId: string; billingDocumentId: string; eventVersion: number };
  return {
    tenantId: event.tenantId,
    eventType: ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_TYPE,
    eventVersion: ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_VERSION,
    aggregateType: "BillingDocument", aggregateId: payload.billingDocumentId,
    causationId: event.id,
    deduplicationKey: accountReceivableRecognitionDeduplicationKey(payload.billingDocumentId),
    payload,
  };
}

function rawSql(mock: jest.Mock): string {
  return (mock.mock.calls[0][0] as TemplateStringsArray).join("?");
}
