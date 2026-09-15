import { CommercialObligationStatus, PaymentPurpose, PaymentStatus, Prisma } from "@prisma/client";
import { ContractReservationReviewService } from "./contract-reservation-review.service";

const actor = { userId: "reviewer-a", name: "Reviewer A" };

describe("ContractReservationReviewService CONTRACTS financial approval", () => {
  it("creates exactly one allocation for the intended Contract amount, assigns one receipt, and enqueues fiscalization", async () => {
    const c = context();

    await expect(c.service.approve("tenant-a", "payment-contract-a", actor)).resolves.toMatchObject({
      status: PaymentStatus.FULLY_ALLOCATED,
      receiptNumber: "RCP-2026-000007",
    });

    expect(c.businessNumbers.next).toHaveBeenCalledTimes(1);
    expect(c.commercialObligationAllocations.allocateInTransaction).toHaveBeenCalledWith(c.tx, expect.objectContaining({
      paymentId: "payment-contract-a",
      commercialObligationId: "obligation-a",
      amount: d("300"),
      allocationDeduplicationKey: "reported-contract-payment:payment-contract-a:obligation-a",
    }));
    expect(c.tx.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      status: PaymentStatus.RECEIVED,
      receiptNumber: "RCP-2026-000007",
      settlementCurrencyCode: "USD",
      settlementAmount: d("300"),
      settlementAvailableAmount: d("300"),
    }) }));
    expect(c.fiscalizationOutbox.enqueueConfirmedPaymentInTransaction).toHaveBeenCalledWith(c.tx, expect.objectContaining({
      id: "payment-contract-a", purpose: PaymentPurpose.CONTRACT_INSTALLMENT, status: PaymentStatus.FULLY_ALLOCATED,
    }));
    expectContractApprovalLocks(c);
    expect(c.tx).not.toHaveProperty("billingDocument");
    expect(c.tx).not.toHaveProperty("billingOutboxEvent");
  });

  it("persists the shared CRC-to-USD settlement snapshot and allocates USD rather than CRC", async () => {
    const c = context({
      payment: pendingPayment({ currencyCode: "CRC", receivedAmount: d("135000") }),
      verified: verifiedPayment({ currencyCode: "CRC", receivedAmount: d("135000") }),
      approved: approvedPayment({ currencyCode: "CRC", receivedAmount: d("135000") }),
    });

    await c.service.approve("tenant-a", "payment-contract-a", actor);

    expect(c.dailyExchangeRates.resolveDailyExchangeRate).toHaveBeenCalledWith({ tenantId: "tenant-a", currencyCodes: ["CRC", "USD"] });
    expect(c.tx.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      availableAmount: d("135000"), settlementCurrencyCode: "USD", settlementAmount: d("300"),
      settlementExchangeRate: d("450"), settlementExchangeRateSource: "MANUAL",
    }) }));
    expect(c.commercialObligationAllocations.allocateInTransaction).toHaveBeenCalledWith(c.tx, expect.objectContaining({ amount: d("300") }));
    expect(c.fiscalizationOutbox.enqueueConfirmedPaymentInTransaction).toHaveBeenCalledTimes(1);
  });

  it("keeps the QA CRC 23,000 to USD 51.12 proposal valid under locked approval", async () => {
    const c = context({
      payment: pendingPayment({
        currencyCode: "CRC",
        receivedAmount: d("23000"),
        allocationProposal: { kind: "CONTRACTS", targets: [{ targetType: "COMMERCIAL_OBLIGATION", targetId: "obligation-a", intendedAmount: "51.12" }] },
      }),
      obligation: obligation({ originalAmount: d("1000"), outstandingAmount: d("1000") }),
      dailyRate: d("449.94"),
    });

    await c.service.approve("tenant-a", "payment-contract-a", actor);

    expect(c.tx.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      settlementCurrencyCode: "USD", settlementAmount: d("51.12"), settlementAvailableAmount: d("51.12"),
    }) }));
    expect(c.commercialObligationAllocations.allocateInTransaction).toHaveBeenCalledWith(c.tx, expect.objectContaining({ amount: d("51.12") }));
  });

  it("preserves a settlement remainder as a partially allocated Payment", async () => {
    const c = context({
      payment: pendingPayment({ currencyCode: "CRC", receivedAmount: d("157500") }),
      verified: verifiedPayment({ currencyCode: "CRC", receivedAmount: d("157500"), settlementAmount: d("350"), settlementAvailableAmount: d("350") }),
      approved: approvedPayment({ currencyCode: "CRC", receivedAmount: d("157500"), availableAmount: d("22500"), settlementAmount: d("350"), settlementAvailableAmount: d("50"), status: PaymentStatus.PARTIALLY_ALLOCATED }),
      dailyAmount: d("350"),
    });

    await expect(c.service.approve("tenant-a", "payment-contract-a", actor)).resolves.toMatchObject({
      status: PaymentStatus.PARTIALLY_ALLOCATED,
      availableAmount: d("22500"),
      settlementAvailableAmount: d("50"),
    });
    expect(c.commercialObligationAllocations.allocateInTransaction).toHaveBeenCalledWith(c.tx, expect.objectContaining({ amount: d("300") }));
    expect(c.fiscalizationOutbox.enqueueConfirmedPaymentInTransaction).toHaveBeenCalledWith(c.tx, expect.objectContaining({ status: PaymentStatus.PARTIALLY_ALLOCATED }));
  });

  it.each([
    ["stale obligation", { outstandingAmount: d("299") }, undefined, "CONTRACTS_PENDING_PAYMENT_INTENDED_EXCEEDS_OUTSTANDING"],
    ["cancelled Contract", undefined, { status: "CANCELLED", cancelledAt: new Date() }, "CONTRACTS_PENDING_PAYMENT_CONTRACT_INACTIVE"],
  ])("rejects %s before a receipt or allocation", async (_, obligationOverride, contractOverride, code) => {
    const c = context({ obligation: obligation(obligationOverride), contract: contract(contractOverride) });

    await expect(c.service.approve("tenant-a", "payment-contract-a", actor)).rejects.toMatchObject({
      response: { code },
    });
    expect(c.businessNumbers.next).not.toHaveBeenCalled();
    expect(c.tx.payment.updateMany).not.toHaveBeenCalled();
    expect(c.commercialObligationAllocations.allocateInTransaction).not.toHaveBeenCalled();
    expect(c.tx.billingAuditLog.create).not.toHaveBeenCalled();
    expect(c.fiscalizationOutbox.enqueueConfirmedPaymentInTransaction).not.toHaveBeenCalled();
  });

  it("is idempotent for an already approved Contract Payment", async () => {
    const approved = approvedPayment();
    const c = context({ payment: approved, verified: approved, approved });

    await expect(c.service.approve("tenant-a", approved.id, actor)).resolves.toBe(approved);
    expect(c.businessNumbers.next).not.toHaveBeenCalled();
    expect(c.commercialObligationAllocations.allocateInTransaction).not.toHaveBeenCalled();
    expect(c.fiscalizationOutbox.enqueueConfirmedPaymentInTransaction).not.toHaveBeenCalled();
  });

  it("rejects a pending Contract Payment without any allocation or receipt", async () => {
    const rejected = { ...pendingPayment(), status: PaymentStatus.REJECTED, reviewedAt: new Date(), reviewedByUserId: actor.userId, reviewedByName: actor.name, rejectionReason: "Evidence invalid" };
    const c = context({ verified: rejected, approved: rejected });

    await expect(c.service.reject("tenant-a", "payment-contract-a", "Evidence invalid", actor)).resolves.toMatchObject({ status: PaymentStatus.REJECTED });
    expect(c.commercialObligationAllocations.allocateInTransaction).not.toHaveBeenCalled();
    expect(c.businessNumbers.next).not.toHaveBeenCalled();
    expect(c.fiscalizationOutbox.enqueueConfirmedPaymentInTransaction).not.toHaveBeenCalled();
  });
});

function d(value: string) { return new Prisma.Decimal(value); }

function expectContractApprovalLocks(c: ReturnType<typeof context>) {
  const locks = c.tx.$queryRaw.mock.calls;
  expect(locks).toHaveLength(3);
  expect(rawSql(locks[0]!)).toContain('FROM "payments"');
  expect(rawSql(locks[1]!)).toContain('FROM "Contract"');
  expect(rawSql(locks[2]!)).toContain('FROM "commercial_obligations"');
  for (const lock of locks) {
    expect(rawSql(lock)).toContain('"id" = ? AND "tenantId" = ?');
    expect(rawSql(lock)).toContain("FOR UPDATE");
    expect(lock[2]).toBe("tenant-a");
  }
  expect(locks[0]![1]).toBe("payment-contract-a");
  expect(locks[1]![1]).toBe("contract-a");
  expect(locks[2]![1]).toBe("obligation-a");
}

function rawSql(call: unknown[]): string {
  return Array.from(call[0] as ArrayLike<string>).join("?");
}

function contract(overrides: Record<string, unknown> = {}) {
  return { id: "contract-a", tenantId: "tenant-a", clientId: "customer-a", contractNumber: "CTR-100", status: "SIGNED", cancelledAt: null, destination: "San José", ...overrides };
}

function obligation(overrides: Record<string, unknown> = {}) {
  return { id: "obligation-a", customerId: "customer-a", sourceType: "CONTRACT", sourceId: "contract-a", currencyCode: "USD", originalAmount: d("300"), outstandingAmount: d("300"), status: CommercialObligationStatus.OPEN, ...overrides };
}

function pendingPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "payment-contract-a", tenantId: "tenant-a", customerId: "customer-a", payerDisplayName: "Customer A", contractId: "contract-a",
    currencyCode: "USD", receivedAmount: d("300"), availableAmount: d("0"), purpose: PaymentPurpose.CONTRACT_INSTALLMENT,
    status: PaymentStatus.PENDING_VERIFICATION, receiptNumber: null, reviewedAt: null, reviewedByUserId: null, reviewedByName: null, rejectionReason: null,
    settlementCurrencyCode: null, settlementAmount: null, settlementAvailableAmount: null, settlementExchangeRate: null, settlementExchangeRateSource: null, settlementExchangeRateEffectiveDate: null,
    allocationProposal: { kind: "CONTRACTS", targets: [{ targetType: "COMMERCIAL_OBLIGATION", targetId: "obligation-a", intendedAmount: "300.00" }] },
    ...overrides,
  };
}

function verifiedPayment(overrides: Record<string, unknown> = {}) {
  return { ...pendingPayment(), status: PaymentStatus.RECEIVED, receiptNumber: "RCP-2026-000007", availableAmount: d("300"), settlementCurrencyCode: "USD", settlementAmount: d("300"), settlementAvailableAmount: d("300"), settlementExchangeRate: d("450"), settlementExchangeRateSource: "MANUAL", settlementExchangeRateEffectiveDate: new Date("2026-09-14T00:00:00.000Z"), reviewedAt: new Date(), reviewedByUserId: actor.userId, reviewedByName: actor.name, ...overrides };
}

function approvedPayment(overrides: Record<string, unknown> = {}) {
  return { ...verifiedPayment(), status: PaymentStatus.FULLY_ALLOCATED, availableAmount: d("0"), settlementAvailableAmount: d("0"), ...overrides };
}

function context(options: { payment?: any; verified?: any; approved?: any; contract?: any; obligation?: any; dailyAmount?: Prisma.Decimal; dailyRate?: Prisma.Decimal } = {}) {
  const payment = options.payment ?? pendingPayment();
  const verified = options.verified ?? verifiedPayment();
  const approved = options.approved ?? approvedPayment();
  const currentContract = options.contract ?? contract();
  const currentObligation = options.obligation ?? obligation();
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: payment.id }]),
    payment: { findFirst: jest.fn().mockResolvedValueOnce(payment).mockResolvedValueOnce(verified).mockResolvedValue(approved), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    contract: { findFirst: jest.fn().mockResolvedValue(currentContract) },
    commercialObligation: { findFirst: jest.fn().mockResolvedValue(currentObligation) },
    billingAuditLog: { create: jest.fn().mockResolvedValue({ id: "audit-a" }) },
  };
  const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)), payment: { findFirst: jest.fn() } };
  const businessNumbers = { next: jest.fn().mockResolvedValue(7n) };
  const commercialObligationAllocations = { allocateInTransaction: jest.fn().mockResolvedValue({ applied: true }) };
  const fiscalizationOutbox = { enqueueConfirmedPaymentInTransaction: jest.fn() };
  const dailyExchangeRates = { resolveDailyExchangeRate: jest.fn().mockResolvedValue({ baseCurrencyCode: "CRC", source: "MANUAL", effectiveDate: "2026-09-14", status: "AVAILABLE", rate: options.dailyRate ?? d("450") }) };
  return {
    service: new ContractReservationReviewService(prisma as never, businessNumbers as never, {} as never, commercialObligationAllocations as never, {} as never, fiscalizationOutbox as never, dailyExchangeRates as never),
    tx, businessNumbers, commercialObligationAllocations, fiscalizationOutbox, dailyExchangeRates,
  };
}
