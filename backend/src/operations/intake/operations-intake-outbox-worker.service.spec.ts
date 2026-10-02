import { OperationsIntakeOutboxWorkerService } from "./operations-intake-outbox-worker.service";
import { OperationalWorkMaterializationError } from "./operational-work-source-reader.port";
import {
  OPERATIONS_INTAKE_OUTBOX_BATCH_SIZE,
  OPERATIONS_INTAKE_OUTBOX_PROCESSING_LEASE_MS,
  OPERATIONS_INTAKE_OUTBOX_RETRY_BASE_MS,
} from "./operations-intake-outbox.constants";

describe("OperationsIntakeOutboxWorkerService", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("atomically claims a bounded available or expired-lease batch under the event tenant", async () => {
    const c = context([]);
    await c.worker.processAvailableBatch("tenant-a");
    const sql = rawSql(c.tx.$queryRaw);
    expect(sql).toContain('"tenantId" = ?');
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain('"status" = \'PENDING\'');
    expect(sql).toContain('"status" = \'PROCESSING\'');
    expect(sql).toContain('"lockedAt" < ?');
    expect(sql).toContain('event."attemptCount" + 1');
    expect(sql).toContain('"attemptCount" >= "maximumAttempts"');
    expect(c.tx.$queryRaw.mock.calls[0]).toContain(OPERATIONS_INTAKE_OUTBOX_BATCH_SIZE);
    expect(c.tx.$executeRaw).toHaveBeenCalledWith(expect.anything(), "tenant-a");
  });

  it("marks CREATED and ALREADY_MATERIALIZED outcomes PROCESSED", async () => {
    const c = context([event(), event({ id: "event-b", sourceLineId: "line-b" })]);
    c.materialize.mockResolvedValueOnce({ status: "CREATED", operationalRequirementId: "requirement-a" })
      .mockResolvedValueOnce({ status: "ALREADY_MATERIALIZED", operationalRequirementId: "requirement-a" });

    await expect(c.worker.processAvailableBatch("tenant-a")).resolves.toMatchObject({ claimed: 2, processed: 2 });
    expect(c.materialize).toHaveBeenCalledTimes(2);
    expect(c.tx.operationsIntakeOutboxEvent.updateMany).toHaveBeenCalledTimes(2);
    for (const call of c.tx.operationsIntakeOutboxEvent.updateMany.mock.calls) {
      expect(call[0]).toMatchObject({
        where: { tenantId: "tenant-a", status: "PROCESSING", lockedBy: expect.stringMatching(/^operations-intake-/) },
        data: { status: "PROCESSED", processedAt: expect.any(Date), lastError: null, lockedAt: null, lockedBy: null },
      });
    }
  });

  it("schedules a bounded retry for a missing participant without creating partial work", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
    const c = context([event({ attemptCount: 1, maximumAttempts: 5 })]);
    c.materialize.mockRejectedValue(new OperationalWorkMaterializationError("PARTICIPANT_NOT_FOUND", true, { missingParticipantCount: 1 }));

    await expect(c.worker.processAvailableBatch("tenant-a")).resolves.toMatchObject({ retried: 1, failed: 0 });
    expect(c.tx.operationsIntakeOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "PENDING",
        availableAt: new Date("2026-10-01T12:01:00.000Z"),
        lastError: "PARTICIPANT_NOT_FOUND: 1 participant(s) missing",
      }),
    }));
    expect(OPERATIONS_INTAKE_OUTBOX_RETRY_BASE_MS).toBe(60_000);
  });

  it.each(["SOURCE_NOT_ELIGIBLE", "PACKAGE_MISMATCH", "SOURCE_CONFLICT"] as const)("marks %s terminal", async (code) => {
    const c = context([event()]);
    c.materialize.mockRejectedValue(new OperationalWorkMaterializationError(code, false));
    await expect(c.worker.processAvailableBatch("tenant-a")).resolves.toMatchObject({ failed: 1, retried: 0 });
    expect(c.tx.operationsIntakeOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "FAILED", lastError: code }),
    }));
  });

  it("marks unsupported event/source combinations FAILED without calling the materializer", async () => {
    const c = context([event({ eventType: "SOURCE_ITEM_CANCELLED" })]);
    await expect(c.worker.processAvailableBatch("tenant-a")).resolves.toMatchObject({ failed: 1 });
    expect(c.materialize).not.toHaveBeenCalled();
    expect(c.tx.operationsIntakeOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "FAILED", lastError: "OPERATIONS_INTAKE_UNSUPPORTED_EVENT" }),
    }));
  });

  it("fails a retryable event after its final claimed attempt", async () => {
    const c = context([event({ attemptCount: 5, maximumAttempts: 5 })]);
    c.materialize.mockRejectedValue(new OperationalWorkMaterializationError("PARTICIPANT_NOT_FOUND", true));
    await c.worker.processAvailableBatch("tenant-a");
    expect(c.tx.operationsIntakeOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "FAILED", lastError: "PARTICIPANT_NOT_FOUND" }),
    }));
  });

  it("uses one atomic claim for competing worker instances", async () => {
    const sharedClaim = jest.fn().mockResolvedValueOnce([event()]).mockResolvedValueOnce([]);
    const first = contextWithClaim(sharedClaim);
    const second = contextWithClaim(sharedClaim);
    await Promise.all([first.worker.processAvailableBatch("tenant-a"), second.worker.processAvailableBatch("tenant-a")]);
    expect(first.materialize).toHaveBeenCalledTimes(1);
    expect(second.materialize).not.toHaveBeenCalled();
    expect(rawSql(sharedClaim)).toContain("FOR UPDATE SKIP LOCKED");
  });

  it("safely replays after a successful materialization whose outcome update failed", async () => {
    const c = context([event()]);
    c.tx.operationsIntakeOutboxEvent.updateMany.mockRejectedValueOnce(new Error("status persistence unavailable"));
    await c.worker.processAvailableBatch("tenant-a");
    c.tx.$queryRaw.mockResolvedValueOnce([event({ attemptCount: 2, recoveredLease: true })]);
    await c.worker.processAvailableBatch("tenant-a");
    expect(c.materialize).toHaveBeenCalledTimes(2);
    expect(c.tx.operationsIntakeOutboxEvent.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PROCESSED" }) }));
  });

  it("uses a 60-second lease and tenant-scoped recovery", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
    const c = context([]);
    await c.worker.processAvailableBatch("tenant-a");
    expect(c.tx.$queryRaw.mock.calls[0]).toContainEqual(new Date("2026-10-01T11:59:00.000Z"));
    expect(OPERATIONS_INTAKE_OUTBOX_PROCESSING_LEASE_MS).toBe(60_000);
  });
});

function context(events: ReturnType<typeof event>[]) {
  const tx = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue(events),
    operationsIntakeOutboxEvent: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
    tenant: { findMany: jest.fn() },
  };
  const materialize = jest.fn().mockResolvedValue({ status: "CREATED", operationalRequirementId: "requirement-a" });
  const worker = new OperationsIntakeOutboxWorkerService(prisma as never, { materialize } as never);
  return { worker, tx, materialize };
}

function contextWithClaim(queryRaw: jest.Mock) {
  const c = context([]);
  c.tx.$queryRaw = queryRaw;
  return c;
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-a",
    tenantId: "tenant-a",
    travelPackageId: "travel-a",
    eventType: "SOURCE_ITEM_APPROVED",
    eventVersion: 1,
    sourceType: "ADDITIONAL_SERVICE_ORDER_LINE",
    sourceId: "order-a",
    sourceLineId: "line-a",
    sourceVersionId: "1",
    attemptCount: 1,
    maximumAttempts: 5,
    recoveredLease: false,
    ...overrides,
  };
}

function rawSql(query: jest.Mock) {
  return query.mock.calls[0][0].join("?");
}
