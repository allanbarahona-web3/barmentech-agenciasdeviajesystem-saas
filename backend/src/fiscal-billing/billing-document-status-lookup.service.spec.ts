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
      providerDocumentId: "provider_a-1", providerRequestHash: HASH,
      providerLastAttemptAt: ATTEMPT, fiscalNumber: NUMBER, documentTypeCode: "01",
      providerEnvironment: "sandbox", fiscalIssueDate: "2026-08-24",
      lifecycleStatus: "SUBMITTED", providerStatus: "PROCESSED",
      taxAuthorityStatus: "PROCESSING", providerReconciliationRequired: false,
      submittedAt: ATTEMPT, issuedAt: null,
    });
    expect(result.persistedIdentity.providerLastAttemptAt).not.toBe(ATTEMPT);
    noWrites(c);
  });

  it.each(["ACCEPTED", "REJECTED"] as const)("allows a complete final %s acknowledgement without interpreting the result", async (taxAuthorityStatus) => {
    const c = context(row({ taxAuthorityStatus }));
    await expect(c.service.lookupStatus("tenant-a", "document-a")).resolves.toMatchObject({ persistedIdentity: { taxAuthorityStatus } });
    expect(c.provider.getDocumentStatus).toHaveBeenCalledTimes(1);
    noWrites(c);
  });

  it.each([
    ["external mode", { billingMode: "EXTERNAL_REGISTRATION" }, "BILLING_DOCUMENT_STATUS_LOOKUP_INELIGIBLE"],
    ["unsupported type", { documentTypeCode: "03" }, "BILLING_DOCUMENT_STATUS_LOOKUP_INELIGIBLE"],
    ["allocation ID", { billingDocumentNumberSequenceId: null }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["allocation number", { allocatedSequenceNumber: null }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["provider ID", { providerDocumentId: null, haciendaKey: null, providerEnvironment: null, submittedAt: null }, "BILLING_DOCUMENT_STATUS_LOOKUP_INELIGIBLE"],
    ["partial acknowledgement", { providerDocumentId: null }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["Hacienda key", { haciendaKey: null }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["fiscal number", { fiscalNumber: null }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["environment", { providerEnvironment: null }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["issue date", { fiscalIssueDate: null }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
    ["emission timestamp", { fiscalEmissionAt: null }, "BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"],
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
    fiscalIssueDate: new Date("2026-08-24T00:00:00.000Z"), fiscalEmissionAt: new Date("2026-08-24T05:59:59.000Z"),
    billingDocumentNumberSequenceId: "sequence-a", allocatedSequenceNumber: 42n,
    issuanceIdempotencyKey: "billing-document:document-a:electronic-issuance:v1", providerRequestHash: HASH,
    providerLastAttemptAt: ATTEMPT, providerReconciliationRequired: false, providerLastErrorCode: null,
    providerLastErrorAt: null, submittedAt: ATTEMPT, issuedAt: null, ...overrides,
  };
}

function context(persisted: ReturnType<typeof row> | null, providerError?: Error) {
  const providerResult: ElectronicDocumentStatusResult = {
    classification: "ELECTRONIC_DOCUMENT_STATUS", providerDocumentId: "provider_a-1", haciendaKey: KEY,
    consecutive: NUMBER, providerEnvironment: "sandbox", providerStatus: "processing", final: false,
    finalDecision: null, fiscalIssuedAt: null, rejectionDetail: null,
  };
  const prisma = { billingDocument: {
    findUnique: jest.fn(async () => persisted), update: jest.fn(), updateMany: jest.fn(), create: jest.fn(), delete: jest.fn(),
  }, $transaction: jest.fn(), $executeRaw: jest.fn(), $queryRaw: jest.fn() };
  const provider = { getDocumentStatus: jest.fn(async () => { if (providerError) throw providerError; return providerResult; }) };
  return { prisma, provider, providerResult, service: new BillingDocumentStatusLookupService(prisma as unknown as PrismaService, provider as ElectronicDocumentStatusProvider) };
}

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
