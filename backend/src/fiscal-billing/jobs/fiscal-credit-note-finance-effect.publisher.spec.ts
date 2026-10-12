import { Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { JobDispatcherService } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import type { PrismaService } from "../../prisma/prisma.service";
import {
  FISCAL_ACCEPTED_FANOUT_AGGREGATE_TYPE,
  FISCAL_CREDIT_NOTE_FINANCE_EFFECT_REQUESTED_EVENT_TYPE,
  FISCAL_CREDIT_NOTE_FINANCE_EFFECT_REQUESTED_EVENT_VERSION,
} from "./fiscal-accepted-fanout.constants";
import {
  FISCAL_CREDIT_NOTE_FINANCE_EFFECT_BATCH_SIZE,
  FISCAL_CREDIT_NOTE_FINANCE_EFFECT_JOB_NAME,
  FISCAL_CREDIT_NOTE_FINANCE_EFFECT_POLL_INTERVAL_MS,
} from "./fiscal-credit-note-finance-effect.constants";
import { FiscalCreditNoteFinanceEffectPublisher } from "./fiscal-credit-note-finance-effect.publisher";

describe("FiscalCreditNoteFinanceEffectPublisher", () => {
  afterEach(() => jest.useRealTimers());

  it("claims through one direct SKIP LOCKED query and preserves the returned event dispatch", async () => {
    const c = context([event()]);

    await c.publisher.publishAvailableEvents();

    expect(c.prisma.$transaction).not.toHaveBeenCalled();
    expect(c.query).toHaveBeenCalledTimes(1);
    expect(c.query.mock.calls[0]).toEqual(expect.arrayContaining([
      FISCAL_CREDIT_NOTE_FINANCE_EFFECT_REQUESTED_EVENT_TYPE,
      FISCAL_CREDIT_NOTE_FINANCE_EFFECT_REQUESTED_EVENT_VERSION,
      FISCAL_CREDIT_NOTE_FINANCE_EFFECT_BATCH_SIZE,
    ]));
    const sql = rawSql(c.query);
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("UPDATE \"billing_outbox_events\"");
    expect(sql).toContain("\"status\"='PROCESSING'");
    expect(c.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      queueKey: PLATFORM_QUEUE_KEYS.FISCAL_CREDIT_NOTE_FINANCE_EFFECT,
      jobName: FISCAL_CREDIT_NOTE_FINANCE_EFFECT_JOB_NAME,
      payload: expect.objectContaining({ tenantId: "tenant-a", outboxEventId: "event-a", eventVersion: 1 }),
      metadata: { tenantId: "tenant-a" },
    }));
    expect(c.updateMany).not.toHaveBeenCalled();
  });

  it("contains P2028 claim failures, leaves events untouched, and schedules the next cycle", async () => {
    jest.useFakeTimers();
    const diagnostic = jest.spyOn(Logger.prototype, "error").mockImplementation();
    const c = context([]);
    c.query.mockRejectedValue(Object.assign(new Error("postgres://secret-db.example.test"), { code: "P2028" }));

    await expect(cycle(c.publisher)).resolves.toBeUndefined();

    expect(c.dispatch).not.toHaveBeenCalled();
    expect(c.updateMany).not.toHaveBeenCalled();
    expect(diagnostic).toHaveBeenCalledWith(
      "FISCAL_POLLER_FAILURE poller=FiscalCreditNoteFinanceEffectPublisher phase=POLLING_CYCLE category=PRISMA code=P2028",
    );
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain("secret-db");

    await jest.advanceTimersByTimeAsync(FISCAL_CREDIT_NOTE_FINANCE_EFFECT_POLL_INTERVAL_MS);
    expect(c.query).toHaveBeenCalledTimes(2);
    await c.publisher.onModuleDestroy();
    diagnostic.mockRestore();
  });

  it("keeps successful cycles on the existing cadence", async () => {
    jest.useFakeTimers();
    const c = context([]);

    c.publisher.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    expect(c.query).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(FISCAL_CREDIT_NOTE_FINANCE_EFFECT_POLL_INTERVAL_MS);
    expect(c.query).toHaveBeenCalledTimes(2);
    await c.publisher.onModuleDestroy();
  });

  it("does not overlap same-process cycles while a direct claim is pending", async () => {
    jest.useFakeTimers();
    let resolveClaim!: (events: ReturnType<typeof event>[]) => void;
    const c = context([]);
    c.query.mockReturnValue(new Promise((resolve) => { resolveClaim = resolve; }));

    const first = cycle(c.publisher);
    const second = cycle(c.publisher);
    expect(c.query).toHaveBeenCalledTimes(1);

    resolveClaim([]);
    await Promise.all([first, second]);
    await c.publisher.onModuleDestroy();
  });
});

function context(events: ReturnType<typeof event>[]) {
  const query = jest.fn().mockResolvedValue(events);
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    $queryRaw: query,
    $transaction: jest.fn(),
    billingOutboxEvent: { updateMany },
  } as unknown as PrismaService & { $queryRaw: jest.Mock; $transaction: jest.Mock };
  const dispatch = jest.fn().mockResolvedValue({ id: "job-a" });
  return {
    publisher: new FiscalCreditNoteFinanceEffectPublisher(prisma, { dispatch } as unknown as JobDispatcherService),
    prisma,
    query,
    updateMany,
    dispatch,
  };
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-a",
    tenantId: "tenant-a",
    aggregateType: FISCAL_ACCEPTED_FANOUT_AGGREGATE_TYPE,
    aggregateId: "document-a",
    causationId: "causation-a",
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

function cycle(publisher: FiscalCreditNoteFinanceEffectPublisher): Promise<void> {
  return (publisher as unknown as { cycle(): Promise<void> }).cycle();
}

function rawSql(mock: jest.Mock): string {
  return (mock.mock.calls[0][0] as TemplateStringsArray).join("?");
}
