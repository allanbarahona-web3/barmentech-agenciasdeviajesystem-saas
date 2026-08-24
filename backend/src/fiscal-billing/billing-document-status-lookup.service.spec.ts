import { ElectronicDocumentStatusError, type ElectronicDocumentStatusProvider, type ElectronicDocumentStatusResult } from "./providers/electronic-document-status.provider";
import { BillingDocumentStatusLookupService } from "./billing-document-status-lookup.service";
import { PrismaService } from "../prisma/prisma.service";

const NUMBER = "00100001010000000042";
const KEY = "50624082600310167816600100001010000000042142351111";
const HASH = "a".repeat(64);
const ATTEMPT = new Date("2026-08-24T12:00:00.123Z");

describe("BillingDocumentStatusLookupService", () => {
  it("performs one composite tenant read, maps persisted values, and returns the provider result unchanged", async () => {
    const c = context(row());
    const result = await c.service.lookupStatus("tenant-a", "document-a");

    expect(c.prisma.billingDocument.findUnique).toHaveBeenCalledTimes(1);
    expect(c.prisma.billingDocument.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id_tenantId: { id: "document-a", tenantId: "tenant-a" } },
    }));
    expect(c.provider.getDocumentStatus).toHaveBeenCalledTimes(1);
    expect(c.provider.getDocumentStatus).toHaveBeenCalledWith({
      providerDocumentId: "provider_a-1",
      expectedHaciendaKey: KEY,
      expectedConsecutive: NUMBER,
      expectedProviderEnvironment: "sandbox",
      expectedFiscalIssueDate: "2026-08-24",
      expectedDocumentType: "01",
    });
    expect(result.providerResult).toBe(c.providerResult);
    expect(result.persistedIdentity).toEqual({
      tenantId: "tenant-a", billingDocumentId: "document-a",
      billingDocumentNumberSequenceId: "sequence-a", allocatedSequenceNumber: "42",
      providerDocumentId: "provider_a-1", haciendaKey: KEY,
      issuanceIdempotencyKey: "billing-document:document-a:electronic-issuance:v1",
      fiscalEmissionAt: new Date("2026-08-24T05:59:59.987Z"), providerRequestHash: HASH,
      providerLastAttemptAt: ATTEMPT, fiscalNumber: NUMBER, documentTypeCode: "01",
      providerEnvironment: "sandbox", fiscalIssueDate: "2026-08-24",
      lifecycleStatus: "SUBMITTED", providerStatus: "PROCESSED",
      taxAuthorityStatus: "PROCESSING", providerReconciliationRequired: false,
      submittedAt: ATTEMPT, issuedAt: null,
      providerStatusCheckAttempts: 0, providerLastStatusCheckAt: null,
      providerNextStatusCheckAt: new Date(ATTEMPT.getTime()+10_000), providerStatusCheckLockOwner: null, providerStatusCheckLeaseUntil: null,
    });
    expect(result.persistedIdentity.providerLastAttemptAt).not.toBe(ATTEMPT);
    expect(result.persistedIdentity.fiscalEmissionAt.getTime()).toBe(new Date("2026-08-24T05:59:59.987Z").getTime());
    expect(result.persistedIdentity.fiscalEmissionAt.toISOString()).toBe("2026-08-24T05:59:59.987Z");
    expect(result.persistedIdentity.fiscalEmissionAt).not.toBe(c.persisted!.fiscalEmissionAt);
    noWrites(c);
  });

  it.each(["ACCEPTED", "REJECTED"] as const)("allows a complete final %s acknowledgement without interpreting the result", async (taxAuthorityStatus) => {
    const c = context(row({ taxAuthorityStatus, providerNextStatusCheckAt: null }));
    await expect(c.service.lookupStatus("tenant-a", "document-a")).resolves.toMatchObject({ persistedIdentity: { taxAuthorityStatus } });
    expect(c.provider.getDocumentStatus).toHaveBeenCalledTimes(1);
    noWrites(c);
  });

  it("defensively copies every scheduling timestamp and preserves the lock identity",async()=>{const last=new Date("2026-08-24T12:00:05.111Z"),next=new Date("2026-08-24T12:00:20.222Z"),lease=new Date("2026-08-24T12:01:00.333Z"),c=context(row({providerStatusCheckAttempts:2,providerLastStatusCheckAt:last,providerNextStatusCheckAt:next,providerStatusCheckLockOwner:"worker-a",providerStatusCheckLeaseUntil:lease}));
    const identity=(await c.service.lookupStatus("tenant-a","document-a")).persistedIdentity;expect(identity).toMatchObject({providerStatusCheckAttempts:2,providerStatusCheckLockOwner:"worker-a"});
    expect(identity.providerLastStatusCheckAt?.getTime()).toBe(last.getTime());expect(identity.providerNextStatusCheckAt?.getTime()).toBe(next.getTime());expect(identity.providerStatusCheckLeaseUntil?.getTime()).toBe(lease.getTime());
    expect(identity.providerLastStatusCheckAt).not.toBe(last);expect(identity.providerNextStatusCheckAt).not.toBe(next);expect(identity.providerStatusCheckLeaseUntil).not.toBe(lease);
  });

  it("allows an exact due unexpired lease and calls the provider once",async()=>{const now=new Date(ATTEMPT.getTime()+20_000),c=context(row({providerStatusCheckLockOwner:"worker-a",providerStatusCheckLeaseUntil:new Date(now.getTime()+60_000)}),undefined,now);await c.service.lookupStatus("tenant-a","document-a","worker-a");expect(c.clock.now).toHaveBeenCalledTimes(1);expect(c.provider.getDocumentStatus).toHaveBeenCalledTimes(1);});
  it.each<[string,{owner?:string;row?:Record<string,unknown>;leaseDelta?:number;nowDelta?:number}]>([["wrong owner",{owner:"worker-b"}],["missing lease",{row:{providerStatusCheckLockOwner:null,providerStatusCheckLeaseUntil:null}}],["expired",{leaseDelta:0}],["future",{nowDelta:0}]])("rejects a %s automatic lease before provider",async(_label,options)=>{const now=new Date(ATTEMPT.getTime()+(options.nowDelta??20_000)),lease=new Date(now.getTime()+(options.leaseDelta??60_000)),c=context(row({providerStatusCheckLockOwner:"worker-a",providerStatusCheckLeaseUntil:lease,...options.row}),undefined,now);await expect(c.service.lookupStatus("tenant-a","document-a",options.owner??"worker-a")).rejects.toBeDefined();expect(c.provider.getDocumentStatus).not.toHaveBeenCalled();});
  it.each(["ACCEPTED","REJECTED"] as const)("returns an already-completed %s retry without provider access",async taxAuthorityStatus=>{const c=context(row({taxAuthorityStatus,providerNextStatusCheckAt:null,providerStatusCheckLockOwner:null,providerStatusCheckLeaseUntil:null,providerStatusCheckAttempts:1,providerLastStatusCheckAt:new Date(ATTEMPT.getTime()+20_000),issuedAt:taxAuthorityStatus==="ACCEPTED"?new Date(ATTEMPT.getTime()+20_000):null}));await expect(c.service.lookupStatus("tenant-a","document-a","old-owner")).resolves.toEqual({classification:"ALREADY_COMPLETED",taxAuthorityStatus});expect(c.provider.getDocumentStatus).not.toHaveBeenCalled();expect(c.clock.now).not.toHaveBeenCalled();});

  it.each([{providerStatusCheckAttempts:-1},{providerStatusCheckAttempts:1.5},{providerLastStatusCheckAt:new Date(Number.NaN)},{providerStatusCheckLockOwner:"worker-a"},{providerStatusCheckLockOwner:" x ",providerStatusCheckLeaseUntil:new Date()},{taxAuthorityStatus:"ACCEPTED",providerNextStatusCheckAt:new Date()}])("rejects malformed scheduling state before provider access: %o",async override=>{const c=context(row(override));await expect(c.service.lookupStatus("tenant-a","document-a")).rejects.toBeDefined();expect(c.provider.getDocumentStatus).not.toHaveBeenCalled();});

  it.each([
    ["external mode", { billingMode: "EXTERNAL_REGISTRATION" }, "BILLING_DOCUMENT_STATUS_LOOKUP_INELIGIBLE"],
    ["unsupported type", { documentTypeCode: "03" }, "BILLING_DOCUMENT_STATUS_LOOKUP_INELIGIBLE"],
    ["allocation ID", { billingDocumentNumberSequenceId: null }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["allocation number", { allocatedSequenceNumber: null }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["provider ID", { providerDocumentId: null, haciendaKey: null, providerEnvironment: null, submittedAt: null }, "BILLING_DOCUMENT_STATUS_LOOKUP_INELIGIBLE"],
    ["partial acknowledgement", { providerDocumentId: null }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["Hacienda key", { haciendaKey: null }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["non-string Hacienda key", { haciendaKey: 506 }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["fiscal number", { fiscalNumber: null }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["environment", { providerEnvironment: null }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["issue date", { fiscalIssueDate: null }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["emission timestamp", { fiscalEmissionAt: null }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["invalid emission Date", { fiscalEmissionAt: new Date("invalid") }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["non-Date emission timestamp", { fiscalEmissionAt: "2026-08-24T05:59:59.987Z" }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["issuance key", { issuanceIdempotencyKey: null }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["non-string issuance key", { issuanceIdempotencyKey: 123 }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["request hash", { providerRequestHash: null }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["attempt timestamp", { providerLastAttemptAt: null }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["reconciliation", { providerReconciliationRequired: true }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["error pair", { providerLastErrorCode: "SAFE_ERROR", providerLastErrorAt: ATTEMPT }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["lifecycle", { lifecycleStatus: "CONFIRMED" }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["provider state", { providerStatus: "FAILED" }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["authority state", { taxAuthorityStatus: "NOT_SUBMITTED" }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["issued timestamp", { issuedAt: ATTEMPT }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["malformed date", { fiscalIssueDate: "not-a-date" }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["malformed BigInt", { allocatedSequenceNumber: 42 }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
  ] as const)("rejects %s before provider access", async (_label, override, code) => {
    const c = context(row(override));
    const error = await capture(c.service.lookupStatus("tenant-a", "document-a"));
    expect(error.getResponse()).toMatchObject({ code });
    expect(c.provider.getDocumentStatus).not.toHaveBeenCalled();
    noWrites(c);
  });

  it.each([["", "document-a"], [" tenant-a", "document-a"], ["tenant-a", ""], ["tenant-a", "x".repeat(192)]])("rejects invalid local identifiers before Prisma", async (tenantId, documentId) => {
    const c = context(row());
    const error = await capture(c.service.lookupStatus(tenantId, documentId));
    expect(error.getResponse()).toMatchObject({ code: "BILLING_DOCUMENT_NOT_FOUND" });
    expect(c.prisma.billingDocument.findUnique).not.toHaveBeenCalled();
    expect(c.provider.getDocumentStatus).not.toHaveBeenCalled();
  });

  it("gives missing and foreign-tenant rows the same safe not-found response", async () => {
    for (const persisted of [null, row({ tenantId: "tenant-b" })]) {
      const c = context(persisted);
      const error = await capture(c.service.lookupStatus("tenant-a", "document-a"));
      expect(error.getResponse()).toEqual({ statusCode: 404, error: "BILLING_DOCUMENT_NOT_FOUND", code: "BILLING_DOCUMENT_NOT_FOUND" });
      expect(c.provider.getDocumentStatus).not.toHaveBeenCalled();
    }
  });

  it("propagates existing safe provider errors and maps unexpected exceptions without secrets", async () => {
    let c = context(row(), new ElectronicDocumentStatusError("ELECTRONIC_DOCUMENT_STATUS_TIMEOUT"));
    await expect(c.service.lookupStatus("tenant-a", "document-a")).rejects.toBeInstanceOf(ElectronicDocumentStatusError);
    noWrites(c);
    c = context(row(), new Error(`secret ${KEY} provider_a-1`));
    const error = await capture(c.service.lookupStatus("tenant-a", "document-a"));
    expect(error.getResponse()).toMatchObject({ code: "BILLING_DOCUMENT_STATUS_LOOKUP_FAILED" });
    expect(JSON.stringify(error.getResponse())).not.toMatch(/provider_a-1|506240826|secret/);
    noWrites(c);
  });

  it("keeps the persisted Hacienda identity even when the normalized provider object is a different runtime value", async () => {
    const c = context(row());
    c.providerResult.haciendaKey = "9".repeat(50);
    const result = await c.service.lookupStatus("tenant-a", "document-a");
    expect(result.persistedIdentity.haciendaKey).toBe(KEY);
    expect(result.providerResult).toBe(c.providerResult);
    expect(result.providerResult.haciendaKey).toBe("9".repeat(50));
  });

  it("maps Prisma failures safely and never calls provider", async () => {
    const c = context(row());
    c.prisma.billingDocument.findUnique.mockRejectedValueOnce(new Error(`database ${KEY}`));
    const error = await capture(c.service.lookupStatus("tenant-a", "document-a"));
    expect(error.getResponse()).toMatchObject({ code: "BILLING_DOCUMENT_STATUS_LOOKUP_FAILED" });
    expect(c.provider.getDocumentStatus).not.toHaveBeenCalled();
    noWrites(c);
  });
});

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "document-a", tenantId: "tenant-a", billingMode: "ELECTRONIC_PROVIDER", lifecycleStatus: "SUBMITTED",
    providerStatus: "PROCESSED", taxAuthorityStatus: "PROCESSING", providerDocumentId: "provider_a-1",
    haciendaKey: KEY, fiscalNumber: NUMBER, documentTypeCode: "01", providerEnvironment: "sandbox",
    fiscalIssueDate: new Date("2026-08-24T00:00:00.000Z"), fiscalEmissionAt: new Date("2026-08-24T05:59:59.987Z"),
    billingDocumentNumberSequenceId: "sequence-a", allocatedSequenceNumber: 42n,
    issuanceIdempotencyKey: "billing-document:document-a:electronic-issuance:v1", providerRequestHash: HASH,
    providerLastAttemptAt: ATTEMPT, providerReconciliationRequired: false, providerLastErrorCode: null,
    providerLastErrorAt: null, submittedAt: ATTEMPT, issuedAt: null, providerStatusCheckAttempts:0,providerLastStatusCheckAt:null,
    providerNextStatusCheckAt:new Date(ATTEMPT.getTime()+10_000),providerStatusCheckLockOwner:null,providerStatusCheckLeaseUntil:null, ...overrides,
  };
}

function context(persisted: ReturnType<typeof row> | null, providerError?: Error, now=new Date(ATTEMPT.getTime()+20_000)) {
  const providerResult: ElectronicDocumentStatusResult = {
    classification: "ELECTRONIC_DOCUMENT_STATUS", providerDocumentId: "provider_a-1", haciendaKey: KEY,
    consecutive: NUMBER, providerEnvironment: "sandbox", providerStatus: "processing", final: false,
    finalDecision: null, fiscalIssuedAt: null, rejectionDetail: null,
  };
  const prisma = { billingDocument: {
    findUnique: jest.fn(async () => persisted), update: jest.fn(), updateMany: jest.fn(), create: jest.fn(), delete: jest.fn(),
  }, $transaction: jest.fn(), $executeRaw: jest.fn(), $queryRaw: jest.fn() };
  const provider = { getDocumentStatus: jest.fn(async () => { if (providerError) throw providerError; return providerResult; }) };
  const clock={now:jest.fn(()=>now)};
  return { prisma, provider, providerResult: providerResult as Mutable<ElectronicDocumentStatusResult>, persisted,
    clock,service: new BillingDocumentStatusLookupService(prisma as unknown as PrismaService, provider as ElectronicDocumentStatusProvider,clock) };
}

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

function noWrites(c: ReturnType<typeof context>) {
  expect(c.prisma.billingDocument.update).not.toHaveBeenCalled();
  expect(c.prisma.billingDocument.updateMany).not.toHaveBeenCalled();
  expect(c.prisma.billingDocument.create).not.toHaveBeenCalled();
  expect(c.prisma.billingDocument.delete).not.toHaveBeenCalled();
  expect(c.prisma.$transaction).not.toHaveBeenCalled();
  expect(c.prisma.$executeRaw).not.toHaveBeenCalled();
}

async function capture(promise: Promise<unknown>): Promise<{ getResponse(): unknown }> {
  try { await promise; throw new Error("expected rejection"); }
  catch (error) { return error as { getResponse(): unknown }; }
}
