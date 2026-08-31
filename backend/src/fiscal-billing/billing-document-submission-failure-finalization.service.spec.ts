import { PrismaService } from "../prisma/prisma.service";
import { FiscalIssuanceClock } from "./fiscal-issuance.clock";
import { BillingDocumentSubmissionFailureFinalizationService } from "./billing-document-submission-failure-finalization.service";

describe("BillingDocumentSubmissionFailureFinalizationService", () => {
  it("atomically finalizes only the tenant-scoped pristine pre-attempt state", async () => {
    const c = context(1);
    await expect(c.service.finalizePristineFailure(input())).resolves.toBe("FINALIZED");
    expect(c.tx.billingDocument.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "document-a", tenantId: "tenant-a", lifecycleStatus: "CONFIRMED", providerStatus: "PENDING", taxAuthorityStatus: "NOT_SUBMITTED", providerLastAttemptAt: null, providerRequestHash: null }),
      data: { providerStatus: "FAILED", providerLastErrorCode: "BILLING_DOCUMENT_SUBMISSION_PREPARATION_FAILED", providerLastErrorAt: NOW, providerReconciliationRequired: false },
    }));
  });

  it("is idempotent and never alters a claimed or already-final document", async () => {
    const c = context(0);
    await expect(c.service.finalizePristineFailure(input())).resolves.toBe("UNCHANGED");
    expect(c.tx.billingDocument.updateMany).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid input before opening a transaction", async () => {
    const c = context(1);
    await expect(c.service.finalizePristineFailure({ ...input(), errorCode: "unsafe error" })).resolves.toBe("UNCHANGED");
    expect(c.transaction).not.toHaveBeenCalled();
  });
});

const NOW = new Date("2026-08-30T12:00:00.000Z");
function input() { return { tenantId: "tenant-a", billingDocumentId: "document-a", errorCode: "BILLING_DOCUMENT_SUBMISSION_PREPARATION_FAILED" }; }
function context(count: number) {
  const tx = { $queryRaw: jest.fn().mockResolvedValue([{ id: "document-a" }]), billingDocument: { updateMany: jest.fn().mockResolvedValue({ count }) } };
  const transaction = jest.fn(async (work: (value: typeof tx) => unknown) => work(tx));
  const prisma = { $transaction: transaction } as unknown as PrismaService;
  return { tx, transaction, service: new BillingDocumentSubmissionFailureFinalizationService(prisma, { now: jest.fn(() => NOW) } as unknown as FiscalIssuanceClock) };
}
