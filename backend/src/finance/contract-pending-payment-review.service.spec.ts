import { CommercialObligationStatus, PaymentPurpose, PaymentStatus, Prisma } from "@prisma/client";
import { ContractReservationReviewService } from "./contract-reservation-review.service";

describe("ContractReservationReviewService CONTRACTS pending review", () => {
  it("lists one pending Contract target through the shared review queue", async () => {
    const c = context();

    await expect(c.service.listPending("tenant-a")).resolves.toMatchObject({
      payments: [{
        id: "payment-contract-a",
        reviewKind: "CONTRACTS",
        receivedAmount: "23000",
        currencyCode: "CRC",
        contract: {
          contractId: "contract-a",
          contractNumber: "CTR-100",
          travelName: "Costa Rica",
          commercialObligationId: "obligation-a",
          obligationCurrencyCode: "USD",
          originalAmount: "1000",
          outstandingAmount: "1000",
          intendedAmount: "51.12",
        },
      }],
    });
    expect(c.prisma.payment.findMany).toHaveBeenCalledTimes(3);
    expect(c.prisma.commercialObligation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: "tenant-a", id: { in: ["obligation-a"] } },
    }));
  });

  it("returns the Contract target, evidence metadata, and distinct received/application currencies from detail", async () => {
    const c = context();

    await expect(c.service.getPendingPaymentDetail("tenant-a", "payment-contract-a")).resolves.toMatchObject({
      reviewKind: "CONTRACTS",
      payerDisplayName: "Customer A",
      currencyCode: "CRC",
      receivedAmount: "23000",
      contract: { contractId: "contract-a", commercialObligationId: "obligation-a", obligationCurrencyCode: "USD" },
      evidence: [{ id: "evidence-a", originalFileName: "receipt.png", destinationValidation: expect.anything() }],
    });
    expect(c.prisma.paymentEvidence.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: "tenant-a", paymentId: { in: ["payment-contract-a"] } },
    }));
  });

  it("passes the QA CRC 23,000 to USD 51.12 proposal against USD 1,000 outstanding without mutations", async () => {
    const c = context();

    await expect(c.service.precheckPendingPayment("tenant-a", "payment-contract-a")).resolves.toMatchObject({
      ok: true,
      paymentId: "payment-contract-a",
      settlementCurrencyCode: "USD",
      settlementAmount: "51.12",
      settlementExchangeRate: "449.94",
      settlementExchangeRateSource: "MANUAL",
      targets: [{ commercialObligationId: "obligation-a", intendedAmount: "51.12", currentOutstandingAmount: "1000" }],
    });
    expect(c.dailyExchangeRates.resolveDailyExchangeRate).toHaveBeenCalledTimes(1);
    expect(c.prisma).not.toHaveProperty("paymentAllocation");
    expect(c.prisma).not.toHaveProperty("commercialObligationAllocation");
    expect(c.prisma).not.toHaveProperty("billingDocument");
    expect(c.prisma).not.toHaveProperty("billingOutboxEvent");
    expect(c.prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong Contract linkage", undefined, { id: "contract-other" }, undefined, "CONTRACTS_PENDING_PAYMENT_CONTRACT_LINKAGE_MISMATCH"],
    ["cancelled Contract", undefined, { cancelledAt: new Date(), status: "CANCELLED" }, undefined, "CONTRACTS_PENDING_PAYMENT_CONTRACT_INACTIVE"],
    ["wrong obligation linkage", { sourceId: "contract-other" }, undefined, undefined, "CONTRACTS_PENDING_PAYMENT_OBLIGATION_CONTRACT_MISMATCH"],
    ["settled obligation", { status: CommercialObligationStatus.SETTLED, outstandingAmount: d("0") }, undefined, undefined, "CONTRACTS_PENDING_PAYMENT_OBLIGATION_STATUS_INVALID"],
    ["amount above outstanding", undefined, undefined, "1000.01", "CONTRACTS_PENDING_PAYMENT_INTENDED_EXCEEDS_OUTSTANDING"],
    ["application currency mismatch", undefined, undefined, undefined, "CONTRACTS_PENDING_PAYMENT_APPLICATION_CURRENCY_MISMATCH"],
  ])("reports %s with a distinct read-only precheck code", async (_, obligationOverride, contractOverride, intendedAmount, code) => {
    const allocationProposal = intendedAmount ? {
      kind: "CONTRACTS",
      targets: [{ targetType: "COMMERCIAL_OBLIGATION", targetId: "obligation-a", intendedAmount }],
    } : undefined;
    const paymentOverride = contractOverride || allocationProposal || code === "CONTRACTS_PENDING_PAYMENT_APPLICATION_CURRENCY_MISMATCH" ? payment({
      ...(contractOverride ? { contract: { ...payment().contract!, ...contractOverride } } : {}),
      ...(allocationProposal ? { allocationProposal } : {}),
      ...(code === "CONTRACTS_PENDING_PAYMENT_APPLICATION_CURRENCY_MISMATCH" ? { settlementCurrencyCode: "CRC", settlementAmount: d("23000"), settlementAvailableAmount: d("23000") } : {}),
    }) : undefined;
    const c = context({
      obligation: obligationOverride ? obligation(obligationOverride) : undefined,
      payment: paymentOverride,
    });

    await expect(c.service.precheckPendingPayment("tenant-a", "payment-contract-a")).rejects.toMatchObject({ response: { code } });
    expect(c.prisma.$transaction).not.toHaveBeenCalled();
    expect(c.prisma).not.toHaveProperty("paymentAllocation");
    expect(c.prisma).not.toHaveProperty("commercialObligationAllocation");
    expect(c.prisma).not.toHaveProperty("billingDocument");
    expect(c.prisma).not.toHaveProperty("billingOutboxEvent");
  });

  it("rejects a malformed multiple-Contract proposal before any mutation", async () => {
    const c = context({ payment: payment({ allocationProposal: {
      kind: "CONTRACTS",
      targets: [
        { targetType: "COMMERCIAL_OBLIGATION", targetId: "obligation-a", intendedAmount: "25.00" },
        { targetType: "COMMERCIAL_OBLIGATION", targetId: "obligation-b", intendedAmount: "25.00" },
      ],
    } }) });

    await expect(c.service.precheckPendingPayment("tenant-a", "payment-contract-a")).rejects.toMatchObject({
      response: { code: "CONTRACTS_PENDING_PAYMENT_WRONG_TARGET_COUNT" },
    });
    expect(c.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("reports a wrong CONTRACTS target type without any write", async () => {
    const c = context({ payment: payment({ allocationProposal: {
      kind: "CONTRACTS",
      targets: [{ targetType: "ACCOUNT_RECEIVABLE", targetId: "obligation-a", intendedAmount: "51.12" }],
    } }) });

    await expect(c.service.precheckPendingPayment("tenant-a", "payment-contract-a")).rejects.toMatchObject({
      response: { code: "CONTRACTS_PENDING_PAYMENT_WRONG_TARGET_TYPE" },
    });
    expect(c.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not expose a Contract pending payment outside its tenant", async () => {
    const c = context();

    await expect(c.service.precheckPendingPayment("tenant-other", "payment-contract-a")).rejects.toMatchObject({
      response: { message: "INVOICE_PENDING_PAYMENT_NOT_FOUND" },
    });
    expect(c.prisma.$transaction).not.toHaveBeenCalled();
  });
});

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: "payment-contract-a", tenantId: "tenant-a", customerId: "customer-a", payerDisplayName: "Customer A",
    currencyCode: "CRC", receivedAmount: d("23000"), availableAmount: d("0"),
    settlementCurrencyCode: null, settlementAmount: null, settlementAvailableAmount: null,
    settlementExchangeRate: null, settlementExchangeRateSource: null, settlementExchangeRateEffectiveDate: null,
    receivedAt: new Date("2026-09-14T10:00:00.000Z"), createdAt: new Date("2026-09-14T10:01:00.000Z"),
    paymentMethod: "BANK_TRANSFER", externalReference: "BANK-23000", description: "Reported", purpose: PaymentPurpose.CONTRACT_INSTALLMENT,
    contractId: "contract-a", status: PaymentStatus.PENDING_VERIFICATION, receiptNumber: null,
    reviewedAt: null, reviewedByUserId: null, reviewedByName: null, rejectionReason: null,
    allocationProposal: { kind: "CONTRACTS", targets: [{ targetType: "COMMERCIAL_OBLIGATION", targetId: "obligation-a", intendedAmount: "51.12" }] },
    contract: {
      id: "contract-a", tenantId: "tenant-a", clientId: "customer-a", contractNumber: "CTR-100", status: "SIGNED", cancelledAt: null,
      destination: "San José", travelPackage: { name: "Costa Rica" }, internalTrip: null,
    },
    ...overrides,
  };
}

function obligation(overrides: Record<string, unknown> = {}) {
  return {
    id: "obligation-a", customerId: "customer-a", sourceType: "CONTRACT", sourceId: "contract-a", currencyCode: "USD",
    originalAmount: d("1000"), outstandingAmount: d("1000"), status: CommercialObligationStatus.OPEN,
    ...overrides,
  };
}

function context(options: { payment?: ReturnType<typeof payment>; obligation?: ReturnType<typeof obligation> } = {}) {
  const currentPayment = options.payment ?? payment();
  const currentObligation = options.obligation ?? obligation();
  const prisma = {
    $transaction: jest.fn(),
    payment: {
      findMany: jest.fn(({ where }) => Promise.resolve(where.tenantId === currentPayment.tenantId && where.purpose === PaymentPurpose.CONTRACT_INSTALLMENT ? [currentPayment] : [])),
      findFirst: jest.fn(({ where }) => Promise.resolve(where.tenantId === currentPayment.tenantId && where.purpose === PaymentPurpose.CONTRACT_INSTALLMENT ? currentPayment : null)),
    },
    commercialObligation: { findMany: jest.fn().mockResolvedValue([currentObligation]) },
    paymentEvidence: { findMany: jest.fn().mockResolvedValue([{
      id: "evidence-a", paymentId: "payment-contract-a", originalFileName: "receipt.png", mimeType: "image/png", size: 12,
      createdAt: new Date("2026-09-14T10:02:00.000Z"), extractionMetadata: {
        schemaVersion: 1,
        extraction: { destinationAccount: "CR0012345678", sinpePhone: null, destinationBank: "Banco A", reference: "REF", paymentCode: null, confidence: 0.9 },
        destinationValidation: { status: "MATCHED", evaluatedAt: "2026-09-14T10:02:00.000Z" },
      },
    }]) },
  };
  const dailyExchangeRates = { resolveDailyExchangeRate: jest.fn().mockResolvedValue({
    baseCurrencyCode: "CRC", source: "MANUAL", effectiveDate: "2026-09-14", status: "AVAILABLE", rate: d("449.94"),
  }) };
  return {
    service: new ContractReservationReviewService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, dailyExchangeRates as never),
    prisma, dailyExchangeRates,
  };
}

function d(value: string) {
  return new Prisma.Decimal(value);
}
