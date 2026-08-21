import { Prisma } from "@prisma/client";
import { JobDispatcherService } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import { PrismaService } from "../../prisma/prisma.service";
import {
  FISCAL_ISSUANCE_JOB_NAME,
  FISCAL_OUTBOX_BATCH_SIZE,
  FISCAL_OUTBOX_EVENT_TYPE,
  FISCAL_OUTBOX_EVENT_VERSION,
  FISCAL_OUTBOX_POLL_INTERVAL_MS,
  FISCAL_OUTBOX_PROCESSING_LEASE_MS,
  FISCAL_OUTBOX_RETRY_BASE_MS,
  FISCAL_OUTBOX_RETRY_MAX_MS,
  fiscalIssuanceJobId,
} from "./fiscal-outbox-publisher.constants";
import { FiscalOutboxPublisherService } from "./fiscal-outbox-publisher.service";

describe("FiscalOutboxPublisherService", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("claims a bounded, correctly grouped batch with SKIP LOCKED and attempt handling", async () => {
    const { service, tx } = setup([]);

    await service.publishAvailableEvents();

    const sql = rawSql(tx.$queryRaw);
    expect(sql).toContain('"eventType" = ?');
    expect(sql).toContain('"eventVersion" = ?');
    expect(sql).toMatch(/AND \(\s*\(\s*"status" = 'PENDING'[\s\S]*\)\s*OR\s*\(\s*"status" = 'PROCESSING'[\s\S]*\)\s*\)/);
    expect(sql).toContain('"availableAt" <= ?');
    expect(sql).toContain('"lockedAt" < ?');
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("LIMIT ?");
    expect(sql).toContain("event.\"attemptCount\" + 1");
    expect(sql).toContain("ELSE event.\"attemptCount\"");
    expect(tx.$queryRaw.mock.calls[0]).toEqual(
      expect.arrayContaining([
        FISCAL_OUTBOX_EVENT_TYPE,
        FISCAL_OUTBOX_EVENT_VERSION,
        FISCAL_OUTBOX_BATCH_SIZE,
      ]),
    );
  });

  it("routes the exact safe payload to the dedicated queue with durable deterministic identity", async () => {
    const event = validEvent();
    const { service, dispatch, updateMany } = setup([event]);

    await service.publishAvailableEvents();

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      queueKey: PLATFORM_QUEUE_KEYS.FISCAL_BILLING,
      jobName: FISCAL_ISSUANCE_JOB_NAME,
      payload: {
        tenantId: "tenant-a",
        billingDocumentId: "document-a",
        eventVersion: 1,
      },
      metadata: { tenantId: "tenant-a" },
      options: {
        jobId: fiscalIssuanceJobId("outbox-a"),
        removeOnComplete: false,
        removeOnFail: false,
      },
    });
    expect(fiscalIssuanceJobId("outbox-a")).toBe("fiscal-issuance-outbox-a");
    expect(fiscalIssuanceJobId("outbox-a")).not.toContain(":");
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "outbox-a",
        tenantId: "tenant-a",
        status: "PROCESSING",
        lockedBy: expect.stringMatching(/^fiscal-outbox-/),
      },
      data: {
        status: "PROCESSED",
        processedAt: expect.any(Date),
        lastError: null,
        lockedAt: null,
        lockedBy: null,
      },
    });
  });

  it.each([
    ["tenant mismatch", { payload: { tenantId: "tenant-b", billingDocumentId: "document-a", eventVersion: 1 } }],
    ["aggregate mismatch", { aggregateId: "document-b" }],
    ["aggregate type mismatch", { aggregateType: "Other" }],
    ["additional payload data", { payload: { tenantId: "tenant-a", billingDocumentId: "document-a", eventVersion: 1, fiscalNumber: "forbidden" } }],
  ])("marks malformed event FAILED without dispatch: %s", async (_, override) => {
    const { service, dispatch, updateMany } = setup([
      validEvent(override as Partial<ReturnType<typeof validEvent>>),
    ]);

    await service.publishAvailableEvents();

    expect(dispatch).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "outbox-a", tenantId: "tenant-a" }),
        data: expect.objectContaining({
          status: "FAILED",
          lastError: "FISCAL_OUTBOX_EVENT_INVALID",
          lockedAt: null,
          lockedBy: null,
        }),
      }),
    );
  });

  it("schedules bounded exponential retry after enqueue failure", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-20T12:00:00.000Z"));
    const { service, dispatch, updateMany } = setup([
      validEvent({ attemptCount: 4, maximumAttempts: 8 }),
    ]);
    dispatch.mockRejectedValue(new Error("sensitive transport detail"));

    await service.publishAvailableEvents();

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING",
          availableAt: new Date("2026-08-20T12:00:08.000Z"),
          lastError: "FISCAL_OUTBOX_DISPATCH_FAILED",
        }),
      }),
    );
    expect(FISCAL_OUTBOX_RETRY_BASE_MS).toBe(1_000);
    expect(FISCAL_OUTBOX_RETRY_MAX_MS).toBe(60_000);
  });

  it("marks the matching claim FAILED when maximum attempts are reached", async () => {
    const { service, dispatch, updateMany } = setup([
      validEvent({ attemptCount: 5, maximumAttempts: 5 }),
    ]);
    dispatch.mockRejectedValue(new Error("transport"));

    await service.publishAvailableEvents();

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "outbox-a",
          tenantId: "tenant-a",
          status: "PROCESSING",
          lockedBy: expect.any(String),
        }),
        data: expect.objectContaining({
          status: "FAILED",
          lastError: "FISCAL_OUTBOX_DISPATCH_FAILED",
        }),
      }),
    );
  });

  it("continues the batch when one event cannot be enqueued", async () => {
    const first = validEvent();
    const second = validEvent({
      id: "outbox-b",
      tenantId: "tenant-b",
      aggregateId: "document-b",
      payload: { tenantId: "tenant-b", billingDocumentId: "document-b", eventVersion: 1 },
    });
    const { service, dispatch } = setup([first, second]);
    dispatch.mockRejectedValueOnce(new Error("transport")).mockResolvedValueOnce({ id: "job-b" });

    await service.publishAvailableEvents();

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[1][0].options.jobId).toBe("fiscal-issuance-outbox-b");
  });

  it("re-enqueues an abandoned claim with the same BullMQ job ID", async () => {
    const event = validEvent({ attemptCount: 1 });
    const { service, dispatch, tx } = setup([event]);

    await service.publishAvailableEvents();
    tx.$queryRaw.mockResolvedValueOnce([event]);
    await service.publishAvailableEvents();

    expect(dispatch.mock.calls.map((call) => call[0].options.jobId)).toEqual([
      "fiscal-issuance-outbox-a",
      "fiscal-issuance-outbox-a",
    ]);
  });

  it("uses one atomic SKIP LOCKED claim per instance so a row is dispatched once", async () => {
    const sharedQuery = jest
      .fn()
      .mockResolvedValueOnce([validEvent()])
      .mockResolvedValueOnce([]);
    const first = setupWithQuery(sharedQuery);
    const second = setupWithQuery(sharedQuery);

    await Promise.all([
      first.service.publishAvailableEvents(),
      second.service.publishAvailableEvents(),
    ]);

    expect(first.dispatch).toHaveBeenCalledTimes(1);
    expect(second.dispatch).not.toHaveBeenCalled();
    expect(rawSql(sharedQuery)).toContain("FOR UPDATE SKIP LOCKED");
  });

  it("expresses fresh-versus-expired PROCESSING recovery with a bounded lease", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-20T12:00:00.000Z"));
    const { service, tx } = setup([]);

    await service.publishAvailableEvents();

    const call = tx.$queryRaw.mock.calls[0];
    expect(rawSql(tx.$queryRaw)).toContain('"status" = \'PROCESSING\'');
    expect(call).toContainEqual(new Date("2026-08-20T11:59:00.000Z"));
    expect(FISCAL_OUTBOX_PROCESSING_LEASE_MS).toBe(60_000);
  });

  it("filters unsupported event types in SQL so they are never modified", async () => {
    const { service, tx, dispatch, updateMany } = setup([]);

    await service.publishAvailableEvents();

    expect(tx.$queryRaw.mock.calls[0]).toContain(FISCAL_OUTBOX_EVENT_TYPE);
    expect(tx.$queryRaw.mock.calls[0]).toContain(FISCAL_OUTBOX_EVENT_VERSION);
    expect(dispatch).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("does not overlap poll cycles and schedules only after completion", async () => {
    jest.useFakeTimers();
    const { service } = setup([]);
    const pending = deferred<void>();
    const publish = jest
      .spyOn(service, "publishAvailableEvents")
      .mockReturnValue(pending.promise);

    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(FISCAL_OUTBOX_POLL_INTERVAL_MS * 2);
    expect(publish).toHaveBeenCalledTimes(1);

    pending.resolve();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(FISCAL_OUTBOX_POLL_INTERVAL_MS);
    expect(publish).toHaveBeenCalledTimes(2);
    await service.onModuleDestroy();
  });

  it("shutdown cancels future polling and awaits the active cycle", async () => {
    jest.useFakeTimers();
    const { service } = setup([]);
    const pending = deferred<void>();
    const publish = jest
      .spyOn(service, "publishAvailableEvents")
      .mockReturnValue(pending.promise);

    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    let destroyed = false;
    const shutdown = service.onModuleDestroy().then(() => {
      destroyed = true;
    });
    await Promise.resolve();
    expect(destroyed).toBe(false);

    pending.resolve();
    await shutdown;
    await jest.advanceTimersByTimeAsync(FISCAL_OUTBOX_POLL_INTERVAL_MS * 2);
    expect(destroyed).toBe(true);
    expect(publish).toHaveBeenCalledTimes(1);
  });
});

function setup(events: ReturnType<typeof validEvent>[]) {
  return setupWithQuery(jest.fn().mockResolvedValue(events));
}

function setupWithQuery(queryRaw: jest.Mock) {
  const tx = { $queryRaw: queryRaw };
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    $transaction: jest.fn((work) => work(tx)),
    billingOutboxEvent: { updateMany },
  } as unknown as PrismaService;
  const dispatch = jest.fn().mockResolvedValue({ id: "job-a" });
  const service = new FiscalOutboxPublisherService(
    prisma,
    { dispatch } as unknown as JobDispatcherService,
  );
  return { service, tx, dispatch, updateMany };
}

function validEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "outbox-a",
    tenantId: "tenant-a",
    eventType: FISCAL_OUTBOX_EVENT_TYPE,
    eventVersion: FISCAL_OUTBOX_EVENT_VERSION,
    aggregateType: "BillingDocument",
    aggregateId: "document-a",
    payload: {
      tenantId: "tenant-a",
      billingDocumentId: "document-a",
      eventVersion: 1,
    } as Prisma.JsonObject,
    attemptCount: 1,
    maximumAttempts: 5,
    ...overrides,
  };
}

function rawSql(mock: jest.Mock) {
  return (mock.mock.calls[0][0] as TemplateStringsArray).join("?");
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
