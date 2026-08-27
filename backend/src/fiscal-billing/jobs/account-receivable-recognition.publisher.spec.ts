import { Prisma } from "@prisma/client";
import type { JobDispatcherService } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import type { PrismaService } from "../../prisma/prisma.service";
import {
  ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_TYPE,
  ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_VERSION,
} from "./fiscal-accepted-fanout.constants";
import {
  ACCOUNT_RECEIVABLE_RECOGNITION_JOB_NAME,
  accountReceivableRecognitionJobId,
} from "./account-receivable-recognition.constants";
import { AccountReceivableRecognitionPublisher } from "./account-receivable-recognition.publisher";

describe("AccountReceivableRecognitionPublisher", () => {
  afterEach(() => jest.useRealTimers());

  it("claims and dispatches only the exact child while leaving it PROCESSING", async () => {
    const event = child(); const c = context([event]);
    await c.publisher.publishAvailableEvents();
    const payload = { tenantId: "tenant-a", outboxEventId: "child-a", lockOwner: expect.stringMatching(/^account-receivable-recognition-/), eventVersion: 1 };
    expect(c.dispatch).toHaveBeenCalledWith({
      queueKey: PLATFORM_QUEUE_KEYS.ACCOUNT_RECEIVABLE_RECOGNITION,
      jobName: ACCOUNT_RECEIVABLE_RECOGNITION_JOB_NAME,
      payload, metadata: { tenantId: "tenant-a" },
      options: expect.objectContaining({ attempts: 3, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: false, removeOnFail: false }),
    });
    expect(c.updateMany).not.toHaveBeenCalled();
    const dispatched = c.dispatch.mock.calls[0][0];
    expect(dispatched.options.jobId).toContain("account-receivable-recognition-child-a-1-");
    expect(Object.keys(dispatched.payload).sort()).toEqual(["eventVersion", "lockOwner", "outboxEventId", "tenantId"]);
  });

  it("filters other event types and versions in its bounded SKIP LOCKED claim", async () => {
    const c = context([]); await c.publisher.publishAvailableEvents();
    const sql = rawSql(c.query);
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(c.query.mock.calls[0]).toEqual(expect.arrayContaining([ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_TYPE, ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_VERSION]));
    expect(sql).not.toContain("electronic-issuance-requested");
    expect(sql).not.toContain("billing-document.fiscal-accepted");
  });

  it("releases dispatch failures with bounded backoff and never touches receivables", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-24T12:00:00.000Z"));
    const c = context([child({ attemptCount: 2, maximumAttempts: 5 })]); c.dispatch.mockRejectedValueOnce(new Error("redis"));
    await c.publisher.publishAvailableEvents();
    expect(c.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PENDING", availableAt: new Date("2026-08-24T12:00:02.000Z"), lastError: "ACCOUNT_RECEIVABLE_RECOGNITION_DISPATCH_FAILED" }) }));
    expect(c.prisma).not.toHaveProperty("accountReceivable");
  });

  it("fails malformed children and exhausted dispatch attempts safely", async () => {
    let c = context([child({ payload: { tenantId: "tenant-a", billingDocumentId: "document-a", eventVersion: 1, amount: "forbidden" } })]);
    await c.publisher.publishAvailableEvents();
    expect(c.dispatch).not.toHaveBeenCalled();
    expect(c.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", lastError: "ACCOUNT_RECEIVABLE_RECOGNITION_OUTBOX_INVALID" }) }));
    c = context([child({ attemptCount: 5, maximumAttempts: 5 })]); c.dispatch.mockRejectedValueOnce(new Error("redis"));
    await c.publisher.publishAvailableEvents();
    expect(c.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", lastError: "ACCOUNT_RECEIVABLE_RECOGNITION_DISPATCH_FAILED" }) }));
  });

  it("uses delivery-specific deterministic job IDs and reclaims expired leases", async () => {
    const c = context([child({ attemptCount: 2 })]); await c.publisher.publishAvailableEvents();
    const first = c.dispatch.mock.calls[0][0];
    expect(first.options.jobId).toBe(accountReceivableRecognitionJobId("child-a", 2, first.payload.lockOwner));
    expect(rawSql(c.query)).toContain('"status" = \'PROCESSING\'');
    expect(rawSql(c.query)).toContain('"lockedAt" < ?');
    expect(rawSql(c.query)).toContain('event."attemptCount" + 1');
  });

  it("cannot release a foreign or stale claim", async () => {
    const c = context([child()]); c.dispatch.mockRejectedValueOnce(new Error("redis"));
    await c.publisher.publishAvailableEvents();
    expect(c.updateMany.mock.calls[0][0].where).toEqual(expect.objectContaining({ id: "child-a", tenantId: "tenant-a", status: "PROCESSING", lockedBy: expect.stringMatching(/^account-receivable-recognition-/) }));
  });
});

function context(events: ReturnType<typeof child>[]) {
  const query = jest.fn().mockResolvedValue(events);
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = { $transaction: jest.fn(async (work: (tx: { $queryRaw: jest.Mock }) => unknown) => work({ $queryRaw: query })), billingOutboxEvent: { updateMany } } as unknown as PrismaService;
  const dispatch = jest.fn().mockResolvedValue({ id: "job-a" });
  return { publisher: new AccountReceivableRecognitionPublisher(prisma, { dispatch } as unknown as JobDispatcherService), query, updateMany, dispatch, prisma };
}
function child(overrides: Record<string, unknown> = {}) { return { id: "child-a", tenantId: "tenant-a", eventType: ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_TYPE, eventVersion: ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_VERSION, aggregateType: "BillingDocument", aggregateId: "document-a", causationId: "parent-a", payload: { tenantId: "tenant-a", billingDocumentId: "document-a", eventVersion: 1 } as Prisma.JsonObject, attemptCount: 1, maximumAttempts: 5, ...overrides }; }
function rawSql(mock: jest.Mock): string { return (mock.mock.calls[0][0] as TemplateStringsArray).join("?"); }
