import { PaymentPurpose, PaymentStatus, Prisma } from "@prisma/client";
import { ContractReservationReviewService } from "./contract-reservation-review.service";

describe("ContractReservationReviewService", () => {
  it("atomically confirms a pending reservation, numbers it once, delegates lifecycle effects, and audits", async () => {
    const c = context();

    const result = await c.service.approve("tenant-1", "payment-1", actor);

    expect(c.businessNumbers.next).toHaveBeenCalledTimes(1);
    expect(c.tx.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: "tenant-1", status: PaymentStatus.PENDING_VERIFICATION, receiptNumber: null }),
      data: expect.objectContaining({ status: PaymentStatus.RECEIVED, receiptNumber: "RCP-2026-000007", reviewedByUserId: "reviewer-1", rejectionReason: null }),
    }));
    expect(c.contracts.approveInTransaction).toHaveBeenCalledWith(c.tx, expect.objectContaining({ tenantId: "tenant-1", contractId: "contract-1", actor, afterCommercialObligation: expect.any(Function) }));
    expect(c.commercialObligationAllocations.allocateInTransaction).toHaveBeenCalledWith(c.tx, expect.objectContaining({
      tenantId: "tenant-1", paymentId: "payment-1", commercialObligationId: "obligation-1",
      allocationDeduplicationKey: "contract-reservation:payment-1:obligation-1",
    }));
    expect(c.tx.billingAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "RESERVATION_APPROVED" }) }));
    expect(result).toMatchObject({ status: PaymentStatus.FULLY_ALLOCATED, receiptNumber: "RCP-2026-000007" });
    expect(result.availableAmount.toFixed()).toBe("0");
    expect(c.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(c.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15000 });
    expect((c.tx as Record<string, unknown>).billingPayment).toBeUndefined();
    expect((c.tx as Record<string, unknown>).billingReceipt).toBeUndefined();
    expect((c.tx as Record<string, unknown>).billingInvoice).toBeUndefined();
  });

  it.each([
    [PaymentStatus.RECEIVED, "125.5"],
    [PaymentStatus.PARTIALLY_ALLOCATED, "25.5"],
    [PaymentStatus.FULLY_ALLOCATED, "0"],
  ])("returns an already approved %s payment without another number or lifecycle effect", async (status, availableAmount) => {
    const approved = approvedPayment(status, availableAmount);
    const c = context(approved, approved);

    await expect(c.service.approve("tenant-1", "payment-1", actor)).resolves.toBe(approved);
    expect(c.businessNumbers.next).not.toHaveBeenCalled();
    expect(c.contracts.approveInTransaction).not.toHaveBeenCalled();
    expect(c.commercialObligationAllocations.allocateInTransaction).not.toHaveBeenCalled();
    expect(c.tx.payment.updateMany).not.toHaveBeenCalled();
    expect(c.tx.billingAuditLog.create).not.toHaveBeenCalled();
  });

  it("rejects atomically without receipt, funds, or Contract/Travel approval effects", async () => {
    const rejected = { ...pendingPayment(), status: PaymentStatus.REJECTED, rejectionReason: "Comprobante ilegible", reviewedAt: new Date(), reviewedByUserId: "reviewer-1", reviewedByName: "Reviewer" };
    const c = context(pendingPayment(), rejected);

    const result = await c.service.reject("tenant-1", "payment-1", " Comprobante ilegible ", actor);

    expect(c.tx.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: PaymentStatus.REJECTED, receiptNumber: null, rejectionReason: "Comprobante ilegible" }) }));
    expect(c.businessNumbers.next).not.toHaveBeenCalled();
    expect(c.contracts.approveInTransaction).not.toHaveBeenCalled();
    expect(c.commercialObligationAllocations.allocateInTransaction).not.toHaveBeenCalled();
    expect(c.tx.billingAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "RESERVATION_REJECTED" }) }));
    expect(result.availableAmount.toFixed()).toBe("0");
  });

  it("approves a full initial Contract payment through the same obligation and allocation transaction", async () => {
    const initial = pendingPayment(PaymentPurpose.CONTRACT_PAYMENT, "1350");
    const final = allocatedPayment(PaymentPurpose.CONTRACT_PAYMENT, "1350");
    const c = context(initial, final);

    const result = await c.service.approve("tenant-1", "payment-1", actor);

    expect(c.contracts.approveInTransaction).toHaveBeenCalledWith(c.tx, expect.objectContaining({ contractId: "contract-1" }));
    expect(c.commercialObligationAllocations.allocateInTransaction).toHaveBeenCalledWith(c.tx, expect.objectContaining({
      amount: new Prisma.Decimal("1350"),
      allocationDeduplicationKey: "contract-payment:payment-1:obligation-1",
    }));
    expect(c.tx.billingAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "CONTRACT_PAYMENT_APPROVED" }),
    }));
    expect(result).toMatchObject({ purpose: PaymentPurpose.CONTRACT_PAYMENT, status: PaymentStatus.FULLY_ALLOCATED });
  });

  it("keeps CREDIT approval allocation equal to its reservation amount", async () => {
    const initial = pendingPayment(PaymentPurpose.CONTRACT_RESERVATION, "350");
    const final = allocatedPayment(PaymentPurpose.CONTRACT_RESERVATION, "350");
    const c = context(initial, final);

    await c.service.approve("tenant-1", "payment-1", actor);

    expect(c.commercialObligationAllocations.allocateInTransaction).toHaveBeenCalledWith(c.tx, expect.objectContaining({
      amount: new Prisma.Decimal("350"),
      allocationDeduplicationKey: "contract-reservation:payment-1:obligation-1",
    }));
  });

  it("rejects a full initial Contract payment without Contract approval or allocation", async () => {
    const rejected = { ...pendingPayment(PaymentPurpose.CONTRACT_PAYMENT, "1350"), status: PaymentStatus.REJECTED, rejectionReason: "No coincide", reviewedAt: new Date(), reviewedByUserId: "reviewer-1", reviewedByName: "Reviewer" };
    const c = context(pendingPayment(PaymentPurpose.CONTRACT_PAYMENT, "1350"), rejected);

    await expect(c.service.reject("tenant-1", "payment-1", "No coincide", actor)).resolves.toMatchObject({
      purpose: PaymentPurpose.CONTRACT_PAYMENT,
      status: PaymentStatus.REJECTED,
    });
    expect(c.contracts.approveInTransaction).not.toHaveBeenCalled();
    expect(c.commercialObligationAllocations.allocateInTransaction).not.toHaveBeenCalled();
    expect(c.tx.billingAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "CONTRACT_PAYMENT_REJECTED" }),
    }));
  });

  it("rolls back the approval callback when Contract obligation activation fails", async () => {
    const c = context();
    c.contracts.approveInTransaction.mockRejectedValueOnce(
      new Error("COMMERCIAL_OBLIGATION_PERSISTENCE_FAILED"),
    );

    await expect(
      c.service.approve("tenant-1", "payment-1", actor),
    ).rejects.toThrow("COMMERCIAL_OBLIGATION_PERSISTENCE_FAILED");

    expect(c.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(c.commercialObligationAllocations.allocateInTransaction).not.toHaveBeenCalled();
    expect(c.tx.billingAuditLog.create).not.toHaveBeenCalled();
  });

  it("rolls back reservation approval when commercial allocation fails", async () => {
    const c = context();
    c.commercialObligationAllocations.allocateInTransaction.mockRejectedValueOnce(
      new Error("COMMERCIAL_OBLIGATION_ALLOCATION_PERSISTENCE_FAILED"),
    );

    await expect(
      c.service.approve("tenant-1", "payment-1", actor),
    ).rejects.toThrow("COMMERCIAL_OBLIGATION_ALLOCATION_PERSISTENCE_FAILED");

    expect(c.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(c.tx.billingAuditLog.create).not.toHaveBeenCalled();
  });

  it("makes identical rejection retries idempotent and rejects the opposite terminal decision", async () => {
    const rejected = { ...pendingPayment(), status: PaymentStatus.REJECTED, rejectionReason: "Duplicado", reviewedAt: new Date(), reviewedByUserId: "reviewer-1", reviewedByName: "Reviewer" };
    const retry = context(rejected, rejected);
    await expect(retry.service.reject("tenant-1", "payment-1", "Duplicado", actor)).resolves.toBe(rejected);
    expect(retry.tx.payment.updateMany).not.toHaveBeenCalled();

    await expect(retry.service.approve("tenant-1", "payment-1", actor)).rejects.toThrow("CONTRACT_RESERVATION_REVIEW_ALREADY_DECIDED");
    const approved = context(approvedPayment(), approvedPayment());
    await expect(approved.service.reject("tenant-1", "payment-1", "No", actor)).rejects.toThrow("CONTRACT_RESERVATION_REVIEW_ALREADY_DECIDED");
  });

  it("uses a single tenant-scoped projection for pending review context", async () => {
    const c = context();
    c.prisma.payment.findMany.mockResolvedValue([]);
    await expect(c.service.listPending("tenant-1", 200)).resolves.toEqual({ payments: [] });
    expect(c.prisma.payment.findMany).toHaveBeenCalledTimes(1);
    expect(c.prisma.payment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: "tenant-1", purpose: { in: [PaymentPurpose.CONTRACT_RESERVATION, PaymentPurpose.CONTRACT_PAYMENT] }, status: PaymentStatus.PENDING_VERIFICATION },
      take: 200,
      select: expect.objectContaining({ evidence: expect.any(Object), contract: expect.any(Object) }),
    }));
  });

  it.each([Number.NaN, 0, -1, 1.5, 201, Number.POSITIVE_INFINITY])(
    "rejects invalid pending-list limit %p before Prisma",
    async (limit) => {
      const c = context();
      await expect(c.service.listPending("tenant-1", limit)).rejects.toThrow("CONTRACT_RESERVATION_PENDING_LIMIT_INVALID");
      expect(c.prisma.payment.findMany).not.toHaveBeenCalled();
    },
  );

  it("tenant-scopes payment evidence before signing its stored object key", async () => {
    const c = context();
    c.prisma.paymentEvidence.findFirst.mockResolvedValue({ id: "evidence-1", objectKey: "contracts/proof.pdf", originalFileName: "proof.pdf", mimeType: "application/pdf", size: 12 });
    await expect(c.service.getEvidenceUrl("tenant-1", "payment-1", "evidence-1")).resolves.toMatchObject({ url: "signed-url" });
    expect(c.prisma.paymentEvidence.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "evidence-1", paymentId: "payment-1", tenantId: "tenant-1" }) }));
    expect(c.storage.generateSignedUrl).toHaveBeenCalledWith("contracts/proof.pdf", 900);
  });
});

const actor = { userId: "reviewer-1", name: "Reviewer" };

function pendingPayment(
  purpose: PaymentPurpose = PaymentPurpose.CONTRACT_RESERVATION,
  amount = "125.5",
) {
  return {
    id: "payment-1", tenantId: "tenant-1", purpose,
    contractId: "contract-1", status: PaymentStatus.PENDING_VERIFICATION,
    receivedAmount: new Prisma.Decimal(amount), availableAmount: new Prisma.Decimal(0),
    receiptNumber: null, reviewedAt: null, reviewedByUserId: null, reviewedByName: null,
    rejectionReason: null,
  };
}

function approvedPayment(
  status: PaymentStatus = PaymentStatus.RECEIVED,
  availableAmount = "125.5",
  purpose: PaymentPurpose = PaymentPurpose.CONTRACT_RESERVATION,
  amount = "125.5",
) {
  return {
    ...pendingPayment(purpose, amount), status, receiptNumber: "RCP-2026-000007",
    availableAmount: new Prisma.Decimal(availableAmount), reviewedAt: new Date(),
    reviewedByUserId: "reviewer-1", reviewedByName: "Reviewer",
  };
}

function allocatedPayment(
  purpose: PaymentPurpose = PaymentPurpose.CONTRACT_RESERVATION,
  amount = "125.5",
) {
  return approvedPayment(PaymentStatus.FULLY_ALLOCATED, "0", purpose, amount);
}

function context(initial: any = pendingPayment(), final: any = allocatedPayment()) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: "payment-1" }]),
    payment: {
      findFirst: jest.fn().mockResolvedValue(final).mockResolvedValueOnce(initial),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    billingAuditLog: { create: jest.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  const prisma = {
    $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)),
    payment: { findMany: jest.fn() },
    paymentEvidence: { findFirst: jest.fn() },
  };
  const businessNumbers = { next: jest.fn().mockResolvedValue(7n) };
  const contracts = {
    approveInTransaction: jest.fn(async (_tx, input) => {
      await input.afterCommercialObligation?.({ commercialObligationId: "obligation-1" });
      return { applied: true, commercialObligationId: "obligation-1" };
    }),
  };
  const commercialObligationAllocations = { allocateInTransaction: jest.fn().mockResolvedValue({ allocation: { id: "allocation-1" }, applied: true }) };
  const storage = { generateSignedUrl: jest.fn().mockResolvedValue("signed-url") };
  return {
    service: Reflect.construct(ContractReservationReviewService, [prisma, businessNumbers, contracts, commercialObligationAllocations, storage]),
    prisma, tx, businessNumbers, contracts, commercialObligationAllocations, storage,
  };
}
