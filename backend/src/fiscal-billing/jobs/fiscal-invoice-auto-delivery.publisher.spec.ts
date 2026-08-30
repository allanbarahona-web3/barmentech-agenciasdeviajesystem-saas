import { Prisma } from "@prisma/client";
import type { JobDispatcherService } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import type { PrismaService } from "../../prisma/prisma.service";
import { FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_TYPE, FISCAL_INVOICE_MANUAL_RESEND_REQUESTED_EVENT_TYPE } from "./fiscal-accepted-fanout.constants";
import { FISCAL_INVOICE_AUTO_DELIVERY_JOB_NAME } from "./fiscal-invoice-auto-delivery.constants";
import { FiscalInvoiceAutoDeliveryPublisher } from "./fiscal-invoice-auto-delivery.publisher";

describe("FiscalInvoiceAutoDeliveryPublisher", () => {
  it("claims and dispatches only the exact child with a deterministic attempt identity", async () => {
    const c = context([child()]); await c.publisher.publishAvailableEvents();
    expect(c.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      queueKey: PLATFORM_QUEUE_KEYS.FISCAL_INVOICE_AUTO_DELIVERY,
      jobName: FISCAL_INVOICE_AUTO_DELIVERY_JOB_NAME,
      payload: { tenantId: "tenant-a", outboxEventId: "child-a", lockOwner: expect.stringMatching(/^fiscal-invoice-auto-delivery-/), eventVersion: 1 },
      options: expect.objectContaining({ jobId: expect.stringContaining("fiscal-invoice-auto-delivery-child-a-1-"), attempts: 3 }),
    }));
    expect(c.update).not.toHaveBeenCalled();
    expect(rawSql(c.query)).toContain("FOR UPDATE SKIP LOCKED");
  });

  it("fails malformed children without dispatching", async () => {
    const c = context([child({ payload: { tenantId: "tenant-a", billingDocumentId: "document-a", eventVersion: 1, email: "forbidden" } })]);
    await c.publisher.publishAvailableEvents();
    expect(c.dispatch).not.toHaveBeenCalled();
    expect(c.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", lastError: "FISCAL_INVOICE_AUTO_DELIVERY_OUTBOX_INVALID" }) }));
  });

  it("releases transient dispatch failure with bounded backoff and owned CAS", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-30T12:00:00Z"));
    const c = context([child({ attemptCount: 2 })]); c.dispatch.mockRejectedValueOnce(new Error("redis"));
    await c.publisher.publishAvailableEvents();
    expect(c.update).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "child-a", tenantId: "tenant-a", status: "PROCESSING", lockedBy: expect.any(String) }), data: expect.objectContaining({ status: "PENDING", availableAt: new Date("2026-08-30T12:00:02Z") }) }));
    jest.useRealTimers();
  });

  it("dispatches manual resend work through the same queue while preserving request identity in the durable child", async () => {
    const c = context([manualChild()]); await c.publisher.publishAvailableEvents();
    expect(c.dispatch).toHaveBeenCalledWith(expect.objectContaining({ queueKey: PLATFORM_QUEUE_KEYS.FISCAL_INVOICE_AUTO_DELIVERY, jobName: FISCAL_INVOICE_AUTO_DELIVERY_JOB_NAME, payload: expect.objectContaining({ outboxEventId: "manual-child-a" }) }));
    const sql = rawSql(c.query); expect(sql).toContain('"eventType" IN (?, ?)');
  });
});

function context(events: ReturnType<typeof child>[]) {
  const query = jest.fn().mockResolvedValue(events); const update = jest.fn().mockResolvedValue({ count: 1 }); const dispatch = jest.fn().mockResolvedValue({ id: "job-a" });
  const prisma = { $transaction: jest.fn(async (work: (tx: { $queryRaw: jest.Mock }) => unknown) => work({ $queryRaw: query })), billingOutboxEvent: { updateMany: update } } as unknown as PrismaService;
  return { publisher: new FiscalInvoiceAutoDeliveryPublisher(prisma, { dispatch } as unknown as JobDispatcherService, { failClaim: jest.fn() } as any), query, update, dispatch };
}
function child(overrides: Record<string, unknown> = {}) { return { id: "child-a", tenantId: "tenant-a", eventType: FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_TYPE, eventVersion: 1, aggregateType: "BillingDocument", aggregateId: "document-a", causationId: "parent-a", correlationId: null, payload: { tenantId: "tenant-a", billingDocumentId: "document-a", eventVersion: 1 } as Prisma.JsonObject, attemptCount: 1, maximumAttempts: 5, ...overrides }; }
function manualChild() { const requestId = "request-a"; return child({ id: "manual-child-a", eventType: FISCAL_INVOICE_MANUAL_RESEND_REQUESTED_EVENT_TYPE, causationId: null, correlationId: requestId, payload: { tenantId: "tenant-a", billingDocumentId: "document-a", requestId, to: "to@example.com", cc: ["cc@example.com"], requestedByUserId: "user-a", eventVersion: 1 } as Prisma.JsonObject }); }
function rawSql(mock: jest.Mock): string { return (mock.mock.calls[0][0] as TemplateStringsArray).join("?"); }
