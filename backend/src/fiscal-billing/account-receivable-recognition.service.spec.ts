import { AccountReceivableStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS,
  AccountReceivableRecognitionService,
} from "./account-receivable-recognition.service";
import {
  ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_TYPE,
  ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_VERSION,
} from "./jobs/fiscal-accepted-fanout.constants";

describe("AccountReceivableRecognitionService", () => {
  it("creates a CASH OPEN receivable immediately due at collectible currency precision", async () => {
    const c = context();

    await c.service.recognizeClaimedEvent(claim());

    const data = c.tx.accountReceivable.createMany.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: "tenant-a", sourceType: "BILLING_DOCUMENT", sourceId: "document-a",
      sourceNumber: "00100001010000000042", sourceDocumentType: "01", customerId: "customer-a",
      debtorDisplayName: "Receiver", debtorIdentificationType: "02", debtorIdentificationNumber: "3101999999",
      currencyCode: "CRC", paymentTermDays: null, status: AccountReceivableStatus.OPEN,
      recognizedAt: FINALIZED, settledAt: null, cancelledAt: null,
    });
    expect(data.originalAmount.toFixed(5)).toBe("113.12000");
    expect(data.outstandingAmount.toFixed(5)).toBe("113.12000");
    expect(data.dueDate).toEqual(ISSUE_DATE);
    expect(c.tx.billingOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "child-a", tenantId: "tenant-a", status: "PROCESSING", lockedBy: "owner-a" }),
      data: expect.objectContaining({ status: "PROCESSED", lockedAt: null, lockedBy: null }),
    }));
  });

  it.each([
    ["USD", "110.17500", "110.18000"],
    ["USD", "110.18000", "110.18000"],
    ["USD", "110.17400", "110.17000"],
    ["CRC", "110.17500", "110.18000"],
  ])("recognizes %s %s as collectible %s without mutating the fiscal total", async (currencyCode, total, expected) => {
    const doc = document({ currencyCode, total: d(total) });
    const c = context({ document: doc });

    await c.service.recognizeClaimedEvent(claim());

    const data = c.tx.accountReceivable.createMany.mock.calls[0][0].data;
    expect(data.originalAmount.toFixed(5)).toBe(expected);
    expect(data.outstandingAmount.toFixed(5)).toBe(expected);
    expect(doc.total.toFixed(5)).toBe(total);
  });

  it("derives CREDIT due date with UTC calendar-day arithmetic", async () => {
    const c = context({ document: document({ paymentConditionCode: "02", creditTermDays: 5, fiscalIssueDate: new Date("2026-02-27T00:00:00.000Z") }) });

    await c.service.recognizeClaimedEvent(claim());

    const data = c.tx.accountReceivable.createMany.mock.calls[0][0].data;
    expect(data.dueDate.toISOString()).toBe("2026-03-04T00:00:00.000Z");
    expect(data.paymentTermDays).toBe(5);
  });

  it.each([["customer-a"], [null]])("copies BillingDocument customerId exactly: %s", async (customerId) => {
    const c = context({ document: document({ customerId }) });
    await c.service.recognizeClaimedEvent(claim());
    expect(c.tx.accountReceivable.createMany.mock.calls[0][0].data.customerId).toBe(customerId);
  });

  it("accepts an exact existing receivable winner without overwriting it", async () => {
    const doc = document();
    const c = context({ document: doc, createCount: 0, receivable: receivableFor(doc) });

    await c.service.recognizeClaimedEvent(claim());

    expect(c.tx.accountReceivable.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    expect(c.tx.billingOutboxEvent.updateMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["amount", { outstandingAmount: d("1.00000") }],
    ["due date", { dueDate: new Date("2026-08-25T00:00:00.000Z") }],
    ["status", { status: AccountReceivableStatus.SETTLED }],
    ["customer", { customerId: null }],
  ])("rejects a contradictory receivable winner: %s", async (_, override) => {
    const doc = document();
    const c = context({ document: doc, createCount: 0, receivable: receivableFor(doc, override) });

    await expectCode(c.service.recognizeClaimedEvent(claim()), ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.RECEIVABLE_CONFLICT);
    expect(c.tx.billingOutboxEvent.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["not accepted", { taxAuthorityStatus: "PROCESSING" }, ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.DOCUMENT_INVALID],
    ["credit note", { documentTypeCode: "03" }, ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.DOCUMENT_TYPE_UNSUPPORTED],
    ["missing fiscal number", { fiscalNumber: " " }, ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.DOCUMENT_INVALID],
    ["missing receiver", { receiverName: null }, ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.DOCUMENT_INVALID],
    ["cash with term", { creditTermDays: 1 }, ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.COMMERCIAL_CONDITION_INVALID],
    ["credit without term", { paymentConditionCode: "02", creditTermDays: null }, ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.COMMERCIAL_CONDITION_INVALID],
    ["credit zero term", { paymentConditionCode: "02", creditTermDays: 0 }, ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.COMMERCIAL_CONDITION_INVALID],
    ["unknown term", { paymentConditionCode: "99", creditTermDays: null }, ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.COMMERCIAL_CONDITION_INVALID],
  ])("rejects invalid authoritative document snapshots: %s", async (_, override, code) => {
    const c = context({ document: document(override) });
    await expectCode(c.service.recognizeClaimedEvent(claim()), code);
    expect(c.tx.accountReceivable.createMany).not.toHaveBeenCalled();
    expect(c.tx.billingOutboxEvent.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["zero", d("0")], ["negative", d("-0.00001")], ["overflow", d("100000000000000.00000")], ["malformed", {}],
  ])("rejects invalid totals without floating point conversion: %s", async (_, total) => {
    const c = context({ document: document({ total }) });
    await expectCode(c.service.recognizeClaimedEvent(claim()), ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.AMOUNT_INVALID);
    expect(c.tx.accountReceivable.createMany).not.toHaveBeenCalled();
  });

  it.each([
    ["extra payload", { payload: { tenantId: "tenant-a", billingDocumentId: "document-a", eventVersion: 1, providerId: "forbidden" } }],
    ["wrong type", { eventType: "other" }],
    ["wrong version", { eventVersion: 2 }],
    ["foreign tenant", { tenantId: "tenant-b", payload: { tenantId: "tenant-b", billingDocumentId: "document-a", eventVersion: 1 } }],
    ["wrong aggregate", { aggregateId: "document-b" }],
    ["missing causation", { causationId: null }],
  ])("rejects malformed or foreign child events: %s", async (_, override) => {
    const c = context({ child: child(override) });
    await expectCode(c.service.recognizeClaimedEvent(claim()), ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.CHILD_INVALID);
    expect(c.tx.billingDocument.findFirst).not.toHaveBeenCalled();
  });

  it("does not complete a lease/CAS loser", async () => {
    const c = context({ locked: [] });
    await expectCode(c.service.recognizeClaimedEvent(claim()), ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.CLAIM_INVALID);
    expect(c.tx.billingOutboxEvent.findUnique).not.toHaveBeenCalled();
    expect(c.tx.billingOutboxEvent.updateMany).not.toHaveBeenCalled();
  });

  it("does not complete the child when receivable persistence fails", async () => {
    const c = context();
    c.tx.accountReceivable.createMany.mockRejectedValueOnce(new Error("database"));
    await expect(c.service.recognizeClaimedEvent(claim())).rejects.toThrow("database");
    expect(c.tx.billingOutboxEvent.updateMany).not.toHaveBeenCalled();
  });

  it("rolls back recognition when child completion loses its compare-and-set", async () => {
    const c = context({ childCompletionCount: 0 });
    await expectCode(c.service.recognizeClaimedEvent(claim()), ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.CLAIM_INVALID);
    expect(c.tx.accountReceivable.createMany).toHaveBeenCalledTimes(1);
  });

  it("uses only bounded event, document, and receivable queries", async () => {
    const c = context();
    await c.service.recognizeClaimedEvent(claim());
    expect(Object.keys(c.tx).sort()).toEqual(["$queryRaw", "accountReceivable", "billingDocument", "billingOutboxEvent"]);
    expect(c.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(c.tx.billingOutboxEvent.findUnique).toHaveBeenCalledTimes(1);
    expect(c.tx.billingDocument.findFirst).toHaveBeenCalledTimes(1);
    expect(c.tx.accountReceivable.createMany).toHaveBeenCalledTimes(1);
    expect(c.tx.accountReceivable.findUnique).toHaveBeenCalledTimes(1);
    expect(c.tx.billingOutboxEvent.updateMany).toHaveBeenCalledTimes(1);
  });

  it("conditionally marks only its owned structural failure as FAILED", async () => {
    const c = context();
    await c.service.failClaim(claim(), ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.DOCUMENT_INVALID);
    expect(c.rootUpdate).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "child-a", tenantId: "tenant-a", status: "PROCESSING", lockedBy: "owner-a" }),
      data: { status: "FAILED", lastError: ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.DOCUMENT_INVALID, lockedAt: null, lockedBy: null },
    });
  });

  it("returns a final transient failure to the owned outbox lifecycle with backoff", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-24T12:00:00.000Z"));
    const c = context({ outboxAttemptCount: 2, outboxMaximumAttempts: 5 });
    await c.service.releaseClaimAfterWorkerFailure(claim());
    expect(c.tx.billingOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "child-a", lockedBy: "owner-a" }),
      data: expect.objectContaining({ status: "PENDING", availableAt: new Date("2026-08-24T12:00:02.000Z"), lastError: "ACCOUNT_RECEIVABLE_RECOGNITION_WORKER_FAILED" }),
    }));
    jest.useRealTimers();
  });
});

const ISSUE_DATE = new Date("2026-08-24T00:00:00.000Z");
const FINALIZED = new Date("2026-08-24T12:01:00.000Z");
function d(value: string) { return new Prisma.Decimal(value); }

function claim() { return { tenantId: "tenant-a", billingOutboxEventId: "child-a", lockOwner: "owner-a" }; }

function context(options: { child?: ReturnType<typeof child>; document?: ReturnType<typeof document>; locked?: Array<{ id: string }>; createCount?: number; receivable?: Record<string, unknown>; childCompletionCount?: number; outboxAttemptCount?: number; outboxMaximumAttempts?: number } = {}) {
  const event = options.child ?? child();
  const doc = options.document ?? document();
  const createMany = jest.fn().mockResolvedValue({ count: options.createCount ?? 1 });
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue(options.locked ?? [{ id: "child-a" }]),
    billingOutboxEvent: { findUnique: jest.fn(async (args: { select?: unknown }) => args.select ? { attemptCount: options.outboxAttemptCount ?? 1, maximumAttempts: options.outboxMaximumAttempts ?? 5 } : event), updateMany: jest.fn().mockResolvedValue({ count: options.childCompletionCount ?? 1 }) },
    billingDocument: { findFirst: jest.fn().mockResolvedValue(doc) },
    accountReceivable: {
      createMany,
      findUnique: jest.fn(async () => options.receivable ?? { id: "receivable-a", ...createMany.mock.calls[0][0].data }),
    },
  };
  const rootUpdate = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = { $transaction: jest.fn(async (work: (value: typeof tx) => unknown) => work(tx)), billingOutboxEvent: { updateMany: rootUpdate } } as unknown as PrismaService;
  return { service: new AccountReceivableRecognitionService(prisma), tx, rootUpdate };
}

function child(overrides: Record<string, unknown> = {}) {
  return {
    id: "child-a", tenantId: "tenant-a", eventType: ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_TYPE,
    eventVersion: ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_VERSION, aggregateType: "BillingDocument",
    aggregateId: "document-a", causationId: "parent-a",
    payload: { tenantId: "tenant-a", billingDocumentId: "document-a", eventVersion: 1 } as Prisma.JsonObject,
    ...overrides,
  };
}

function document(overrides: Record<string, unknown> = {}) {
  return {
    id: "document-a", tenantId: "tenant-a", taxAuthorityStatus: "ACCEPTED", documentTypeCode: "01",
    fiscalNumber: "00100001010000000042", customerId: "customer-a", receiverName: "Receiver",
    receiverIdentificationType: "02", receiverIdentification: "3101999999", currencyCode: "CRC",
    total: d("113.12345"), fiscalIssueDate: ISSUE_DATE, paymentConditionCode: "01", creditTermDays: null,
    taxAuthorityFinalizedAt: FINALIZED, ...overrides,
  };
}

function receivableFor(doc: ReturnType<typeof document>, overrides: Record<string, unknown> = {}) {
  const credit = doc.paymentConditionCode === "02";
  const dueDate = credit ? new Date(Date.UTC(doc.fiscalIssueDate.getUTCFullYear(), doc.fiscalIssueDate.getUTCMonth(), doc.fiscalIssueDate.getUTCDate() + (doc.creditTermDays ?? 0))) : doc.fiscalIssueDate;
  const collectibleAmount = doc.total.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return {
    id: "receivable-a", tenantId: doc.tenantId, sourceType: "BILLING_DOCUMENT", sourceId: doc.id,
    sourceNumber: doc.fiscalNumber, sourceDocumentType: doc.documentTypeCode, customerId: doc.customerId,
    debtorDisplayName: doc.receiverName, debtorIdentificationType: doc.receiverIdentificationType,
    debtorIdentificationNumber: doc.receiverIdentification, currencyCode: doc.currencyCode,
    originalAmount: collectibleAmount, outstandingAmount: collectibleAmount, dueDate,
    paymentTermDays: credit ? doc.creditTermDays : null, status: AccountReceivableStatus.OPEN,
    recognizedAt: doc.taxAuthorityFinalizedAt, settledAt: null, cancelledAt: null, ...overrides,
  };
}

async function expectCode(value: Promise<unknown>, code: string): Promise<void> {
  await expect(value).rejects.toThrow(code);
}
