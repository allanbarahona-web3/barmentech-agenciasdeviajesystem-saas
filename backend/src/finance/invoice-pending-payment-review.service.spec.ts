import { AccountReceivableStatus, PaymentPurpose, PaymentStatus, Prisma } from "@prisma/client";
import { ContractReservationReviewService } from "./contract-reservation-review.service";

describe("invoice pending-payment review integration", () => {
  it("includes invoice proposals and current AR balances in the shared pending-review list with set-based reads", async () => {
    const c = context();

    const result = await c.service.listPending("tenant-a");

    expect(result.payments).toHaveLength(1);
    expect(result.payments[0]).toMatchObject({
      id: "payment-invoice-a",
      reviewKind: "INVOICES",
      customerId: "customer-a",
      currencyCode: "USD",
      receivedAmount: "100",
      allocationProposal: {
        kind: "INVOICES",
        targets: [{ targetType: "ACCOUNT_RECEIVABLE", targetId: "ar-a", intendedAmount: "100.00" }],
      },
      targets: [{
        accountReceivableId: "ar-a",
        intendedAmount: "100.00",
        fiscalNumber: "50601012600010000000100100001010000000001",
        currentOutstandingAmount: "200",
        currentStatus: AccountReceivableStatus.OPEN,
      }],
    });
    expect(c.prisma.payment.findMany).toHaveBeenCalledTimes(3);
    expect(c.prisma.client.findMany).toHaveBeenCalledTimes(1);
    expect(c.prisma.accountReceivable.findMany).toHaveBeenCalledTimes(1);
    expect(c.prisma.billingDocument.findMany).toHaveBeenCalledTimes(1);
  });

  it("returns the same proposal and live target data from the invoice review detail", async () => {
    const c = context({ paymentEvidence: [paymentEvidence()] });

    await expect(c.service.getInvoicePendingDetail("tenant-a", "payment-invoice-a")).resolves.toMatchObject({
      reviewKind: "INVOICES",
      payerDisplayName: "Customer A",
      allocationProposal: { kind: "INVOICES" },
      targets: [{ accountReceivableId: "ar-a", currentOutstandingAmount: "200" }],
      evidence: [{ id: "evidence-a", originalFileName: "receipt.png", mimeType: "image/png", size: 12, createdAt: new Date("2026-09-13T10:01:00.000Z") }],
    });
    expect(c.prisma.paymentEvidence.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: "tenant-a", paymentId: { in: ["payment-invoice-a"] } },
      select: { id: true, paymentId: true, originalFileName: true, mimeType: true, size: true, createdAt: true, extractionMetadata: true },
    }));
  });

  it("exposes only safe persisted destination-validation metadata in invoice review detail", async () => {
    const c = context({ paymentEvidence: [paymentEvidence({ extractionMetadata: {
      schemaVersion: 1,
      extraction: { destinationAccount: "CR0012345678", sinpePhone: "88881234", destinationBank: "Banco A", reference: "REF-1", paymentCode: null, confidence: 0.9 },
      destinationValidation: { status: "UNMATCHED", reason: "NOT_REGISTERED", evaluatedAt: "2026-09-14T00:00:00.000Z", overrideAccepted: true, overrideAcceptedByUserId: "agent-a", overrideAcceptedAt: "2026-09-14T00:01:00.000Z" },
    } })] });

    await expect(c.service.getInvoicePendingDetail("tenant-a", "payment-invoice-a")).resolves.toMatchObject({
      evidence: [{ destinationValidation: {
        extraction: { destinationAccount: "****5678", sinpePhone: "****1234", destinationBank: "Banco A" },
        destinationValidation: { status: "UNMATCHED", reason: "NOT_REGISTERED", overrideAccepted: true, overrideAcceptedByUserId: "agent-a" },
      } }],
    });
  });

  it("keeps invoice evidence metadata out of the list read and never exposes storage internals", async () => {
    const c = context({ paymentEvidence: [paymentEvidence()] });

    const result = await c.service.listPending("tenant-a");

    expect(result.payments[0]).not.toHaveProperty("evidence");
    expect(c.prisma.paymentEvidence.findMany).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("objectKey");
    expect(c.prisma).not.toHaveProperty("paymentReceiptImage");
  });

  it("prechecks the proposal without creating allocations or mutating receivables", async () => {
    const c = context();

    await expect(c.service.precheckInvoicePendingPayment("tenant-a", "payment-invoice-a")).resolves.toMatchObject({
      ok: true,
      paymentId: "payment-invoice-a",
      currencyCode: "USD",
      amount: "100",
      targets: [{ accountReceivableId: "ar-a", currentOutstandingAmount: "200" }],
    });
    expect(c.prisma.accountReceivable.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: "tenant-a", id: { in: ["ar-a"] } },
    }));
    expect(c.prisma).not.toHaveProperty("paymentAllocation");
    expect(c.prisma).not.toHaveProperty("accountReceivable.update");
    expect(c.fiscalizationOutbox.enqueueConfirmedPaymentInTransaction).not.toHaveBeenCalled();
  });

  it("keeps the payment pending and returns a conflict when an AR is stale", async () => {
    const c = context({ receivable: receivable({ outstandingAmount: d("99") }) });

    await expect(c.service.precheckInvoicePendingPayment("tenant-a", "payment-invoice-a")).rejects.toMatchObject({
      response: { message: "INVOICE_PENDING_PAYMENT_STALE_TARGET" },
    });
    expect(c.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("blocks precheck when the current AR customer changes", async () => {
    const currentReceivable = receivable({ customerId: "customer-other" });
    const c = context({ receivable: currentReceivable });

    await expect(c.service.precheckInvoicePendingPayment("tenant-a", "payment-invoice-a")).rejects.toMatchObject({
      response: { message: "INVOICE_PENDING_PAYMENT_CUSTOMER_MISMATCH" },
    });
  });

  it("blocks a proposal greater than the verified payment amount", async () => {
    const c = context({ payment: pendingInvoicePayment({ receivedAmount: d("99") }) });

    await expect(c.service.precheckInvoicePendingPayment("tenant-a", "payment-invoice-a")).rejects.toMatchObject({
      response: { message: "INVOICE_PENDING_PAYMENT_INSUFFICIENT" },
    });
  });

  it("prechecks the same normalized cross-currency settlement amount shown by preview", async () => {
    const payment = pendingInvoicePayment({
      currencyCode: "CRC",
      receivedAmount: d("23000"),
      allocationProposal: { kind: "INVOICES", targets: [{ targetType: "ACCOUNT_RECEIVABLE", targetId: "ar-a", intendedAmount: "51.12" }] },
    });
    const c = context({ payment, receivable: receivable({ originalAmount: d("51.12"), outstandingAmount: d("51.12") }) });

    await expect(c.service.precheckInvoicePendingPayment("tenant-a", payment.id)).resolves.toMatchObject({
      settlementCurrencyCode: "USD", settlementAmount: "51.12",
    });
    expect(c.dailyExchangeRates.resolveDailyExchangeRate).toHaveBeenCalledTimes(1);
  });

  it("rejects an invoice pending payment without allocations, a receipt, or fiscal effects", async () => {
    const pending = pendingInvoicePayment();
    const rejected = { ...pending, status: PaymentStatus.REJECTED, reviewedAt: new Date("2026-09-13T12:00:00.000Z"), reviewedByUserId: "reviewer-a", reviewedByName: "Reviewer A", rejectionReason: "No coincide" };
    const c = context({ payment: pending, transactionFinal: rejected });

    await expect(c.service.reject("tenant-a", "payment-invoice-a", "No coincide", actor)).resolves.toMatchObject({
      status: PaymentStatus.REJECTED,
      receiptNumber: null,
      availableAmount: d("0"),
    });
    expect(c.tx.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: PaymentStatus.REJECTED, receiptNumber: null, availableAmount: d("0"), rejectionReason: "No coincide" }),
    }));
    expect(c.tx.paymentAllocation.createMany).not.toHaveBeenCalled();
    expect(c.tx.accountReceivable.update).not.toHaveBeenCalled();
    expect(c.fiscalizationOutbox.enqueueConfirmedPaymentInTransaction).not.toHaveBeenCalled();
    expect(c.tx.billingAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "REPORTED_INVOICE_PAYMENT_REJECTED" }),
    }));
  });

  it("approves multiple invoice targets with one receipt and leaves the unallocated remainder available", async () => {
    const pending = pendingInvoicePayment({
      receivedAmount: d("500"),
      allocationProposal: {
        kind: "INVOICES",
        targets: [
          { targetType: "ACCOUNT_RECEIVABLE", targetId: "ar-a", intendedAmount: "250.00" },
          { targetType: "ACCOUNT_RECEIVABLE", targetId: "ar-b", intendedAmount: "150.00" },
        ],
      },
    });
    const verified = approvedInvoicePayment(pending, { status: PaymentStatus.RECEIVED, availableAmount: d("500") });
    const allocated = approvedInvoicePayment(pending, { status: PaymentStatus.PARTIALLY_ALLOCATED, availableAmount: d("100") });
    const c = context({
      payment: pending,
      transactionVerified: verified,
      transactionFinal: allocated,
      receivables: [receivable({ id: "ar-a", originalAmount: d("300"), outstandingAmount: d("300") }), receivable({ id: "ar-b", sourceId: "document-b", originalAmount: d("200"), outstandingAmount: d("200") })],
    });
    c.tx.$queryRaw
      .mockResolvedValueOnce([{ id: pending.id }])
      .mockResolvedValueOnce([{ id: "ar-a" }, { id: "ar-b" }]);
    c.tx.paymentAllocation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "allocation-a", paymentId: pending.id, accountReceivableId: "ar-a", amount: d("250"), allocationDeduplicationKey: `reported-invoice-payment:${pending.id}:ar-a` },
        { id: "allocation-b", paymentId: pending.id, accountReceivableId: "ar-b", amount: d("150"), allocationDeduplicationKey: `reported-invoice-payment:${pending.id}:ar-b` },
      ]);

    await expect(c.service.approve("tenant-a", pending.id, actor)).resolves.toMatchObject({
      status: PaymentStatus.PARTIALLY_ALLOCATED,
      receiptNumber: "RCP-2026-000007",
      availableAmount: d("100"),
    });

    expect(c.businessNumbers.next).toHaveBeenCalledTimes(1);
    expect(c.tx.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: PaymentStatus.RECEIVED, receiptNumber: "RCP-2026-000007", availableAmount: d("500"), settlementCurrencyCode: "USD", settlementAmount: d("500"), settlementAvailableAmount: d("500"), reviewedByUserId: "reviewer-a" }),
    }));
    expect(c.tx.paymentAllocation.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ paymentId: pending.id, accountReceivableId: "ar-a", amount: d("250") }),
        expect.objectContaining({ paymentId: pending.id, accountReceivableId: "ar-b", amount: d("150") }),
      ]),
    }));
    expect(c.tx.accountReceivable.update).toHaveBeenCalledTimes(2);
    expect(c.tx.accountReceivable.update.mock.calls.map((call) => ({
      id: call[0].where.id,
      outstandingAmount: call[0].data.outstandingAmount.toFixed(),
      status: call[0].data.status,
    }))).toEqual([
      { id: "ar-a", outstandingAmount: "50", status: AccountReceivableStatus.PARTIALLY_SETTLED },
      { id: "ar-b", outstandingAmount: "50", status: AccountReceivableStatus.PARTIALLY_SETTLED },
    ]);
    expect(c.tx.payment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: PaymentStatus.PARTIALLY_ALLOCATED, availableAmount: d("100") }),
    }));
    expect(c.tx.billingAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "REPORTED_INVOICE_PAYMENT_APPROVED" }),
    }));
    expect(c.contracts.approveInTransaction).not.toHaveBeenCalled();
    expect(c.commercialObligationAllocations.allocateInTransaction).not.toHaveBeenCalled();
    expect(c.fiscalizationOutbox.enqueueConfirmedPaymentInTransaction).not.toHaveBeenCalled();
    expect(c.tx).not.toHaveProperty("billingDocument");
    expect(c.dailyExchangeRates.resolveDailyExchangeRate).not.toHaveBeenCalled();
  });

  it("normalizes CRC received money into allocatable USD settlement precision and persists that exact snapshot", async () => {
    const pending = pendingInvoicePayment({
      currencyCode: "CRC",
      receivedAmount: d("100000"),
      allocationProposal: { kind: "INVOICES", targets: [{ targetType: "ACCOUNT_RECEIVABLE", targetId: "ar-a", intendedAmount: "200.00000" }] },
    });
    const verified = approvedInvoicePayment(pending, {
      availableAmount: d("100000"),
      settlementCurrencyCode: "USD",
      settlementAmount: d("222.25"),
      settlementAvailableAmount: d("222.25"),
      settlementExchangeRate: d("449.94"),
      settlementExchangeRateSource: "MANUAL",
      settlementExchangeRateEffectiveDate: new Date("2026-09-14T00:00:00.000Z"),
    });
    const allocated = approvedInvoicePayment(verified, {
      status: PaymentStatus.PARTIALLY_ALLOCATED,
      availableAmount: d("10012"),
      settlementAvailableAmount: d("22.25"),
    });
    const c = context({ payment: pending, transactionVerified: verified, transactionFinal: allocated });
    c.tx.$queryRaw
      .mockResolvedValueOnce([{ id: pending.id }])
      .mockResolvedValueOnce([{ id: "ar-a" }]);
    c.tx.paymentAllocation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "allocation-a", paymentId: pending.id, accountReceivableId: "ar-a", amount: d("200"), allocationDeduplicationKey: `reported-invoice-payment:${pending.id}:ar-a` }]);

    await expect(c.service.approve("tenant-a", pending.id, actor)).resolves.toMatchObject({
      currencyCode: "CRC",
      receivedAmount: d("100000"),
      settlementCurrencyCode: "USD",
      settlementAvailableAmount: d("22.25"),
    });

    expect(c.dailyExchangeRates.resolveDailyExchangeRate).toHaveBeenCalledTimes(1);
    expect(c.dailyExchangeRates.resolveDailyExchangeRate).toHaveBeenCalledWith({ tenantId: "tenant-a", currencyCodes: ["CRC", "USD"] });
    expect(c.tx.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        settlementCurrencyCode: "USD",
        settlementAmount: d("222.25"),
        settlementAvailableAmount: d("222.25"),
        settlementExchangeRate: d("449.94"),
        settlementExchangeRateSource: "MANUAL",
      }),
    }));
    expect(c.tx.payment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ availableAmount: d("10012"), settlementAvailableAmount: d("22.25") }),
    }));
    expect(c.tx.accountReceivable.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ outstandingAmount: d("0"), status: AccountReceivableStatus.SETTLED }),
    }));
  });

  it("uses the same normalized USD amount for cross-currency approval when the preview rounds to 51.12", async () => {
    const pending = pendingInvoicePayment({
      currencyCode: "CRC",
      receivedAmount: d("23000"),
      allocationProposal: { kind: "INVOICES", targets: [{ targetType: "ACCOUNT_RECEIVABLE", targetId: "ar-a", intendedAmount: "51.12" }] },
    });
    const verified = approvedInvoicePayment(pending, {
      availableAmount: d("23000"), settlementCurrencyCode: "USD", settlementAmount: d("51.12"), settlementAvailableAmount: d("51.12"),
      settlementExchangeRate: d("449.94"), settlementExchangeRateSource: "MANUAL", settlementExchangeRateEffectiveDate: new Date("2026-09-14T00:00:00.000Z"),
    });
    const allocated = approvedInvoicePayment(verified, { status: PaymentStatus.FULLY_ALLOCATED, availableAmount: d("0"), settlementAvailableAmount: d("0") });
    const c = context({ payment: pending, transactionVerified: verified, transactionFinal: allocated, receivable: receivable({ originalAmount: d("51.12"), outstandingAmount: d("51.12") }) });
    c.tx.$queryRaw.mockResolvedValueOnce([{ id: pending.id }]).mockResolvedValueOnce([{ id: "ar-a" }]);
    c.tx.paymentAllocation.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "allocation-a", paymentId: pending.id, accountReceivableId: "ar-a", amount: d("51.12"), allocationDeduplicationKey: `reported-invoice-payment:${pending.id}:ar-a` }]);

    await expect(c.service.approve("tenant-a", pending.id, actor)).resolves.toMatchObject({
      settlementAmount: d("51.12"), settlementAvailableAmount: d("0"), status: PaymentStatus.FULLY_ALLOCATED,
    });
    expect(c.tx.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ settlementAmount: d("51.12"), settlementAvailableAmount: d("51.12") }) }));
  });

  it("treats all-null settlement snapshot fields as absent and resolves them during approval", async () => {
    const pending = pendingInvoicePayment({
      currencyCode: "CRC",
      receivedAmount: d("23000"),
      settlementCurrencyCode: null,
      settlementAmount: null,
      settlementAvailableAmount: null,
      settlementExchangeRate: null,
      settlementExchangeRateSource: null,
      settlementExchangeRateEffectiveDate: null,
      allocationProposal: { kind: "INVOICES", targets: [{ targetType: "ACCOUNT_RECEIVABLE", targetId: "ar-a", intendedAmount: "51.12" }] },
    });
    const verified = approvedInvoicePayment(pending, {
      availableAmount: d("23000"), settlementCurrencyCode: "USD", settlementAmount: d("51.12"), settlementAvailableAmount: d("51.12"),
      settlementExchangeRate: d("449.94"), settlementExchangeRateSource: "MANUAL", settlementExchangeRateEffectiveDate: new Date("2026-09-14T00:00:00.000Z"),
    });
    const allocated = approvedInvoicePayment(verified, { status: PaymentStatus.FULLY_ALLOCATED, availableAmount: d("0"), settlementAvailableAmount: d("0") });
    const c = context({ payment: pending, transactionVerified: verified, transactionFinal: allocated, receivable: receivable({ originalAmount: d("51.12"), outstandingAmount: d("51.12") }) });
    c.tx.$queryRaw.mockResolvedValueOnce([{ id: pending.id }]).mockResolvedValueOnce([{ id: "ar-a" }]);
    c.tx.paymentAllocation.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "allocation-a", paymentId: pending.id, accountReceivableId: "ar-a", amount: d("51.12"), allocationDeduplicationKey: `reported-invoice-payment:${pending.id}:ar-a` }]);

    await expect(c.service.approve("tenant-a", pending.id, actor)).resolves.toMatchObject({ settlementAmount: d("51.12") });
    expect(c.dailyExchangeRates.resolveDailyExchangeRate).toHaveBeenCalledTimes(1);
  });

  it("continues rejecting a partial settlement snapshot", async () => {
    const pending = pendingInvoicePayment({ settlementCurrencyCode: "USD", settlementAmount: null, settlementAvailableAmount: null });
    const c = context({ payment: pending });
    c.tx.$queryRaw.mockResolvedValueOnce([{ id: pending.id }]).mockResolvedValueOnce([{ id: "ar-a" }]);

    await expect(c.service.approve("tenant-a", pending.id, actor)).rejects.toMatchObject({
      response: { message: "INVOICE_PENDING_PAYMENT_SETTLEMENT_STATE_INVALID" },
    });
  });

  it("keeps the payment pending without a receipt or allocation when the daily FX rate is unavailable", async () => {
    const pending = pendingInvoicePayment({ currencyCode: "CRC", receivedAmount: d("89988") });
    const c = context({ payment: pending, dailyResolution: { status: "MISSING", source: "MANUAL", effectiveDate: "2026-09-14", baseCurrencyCode: "CRC" } });
    c.tx.$queryRaw
      .mockResolvedValueOnce([{ id: pending.id }])
      .mockResolvedValueOnce([{ id: "ar-a" }]);

    await expect(c.service.approve("tenant-a", pending.id, actor)).rejects.toMatchObject({
      response: { message: "INVOICE_PENDING_PAYMENT_EXCHANGE_RATE_UNAVAILABLE" },
    });
    expect(c.businessNumbers.next).not.toHaveBeenCalled();
    expect(c.tx.payment.updateMany).not.toHaveBeenCalled();
    expect(c.tx.paymentAllocation.createMany).not.toHaveBeenCalled();
    expect(c.tx.accountReceivable.update).not.toHaveBeenCalled();
  });

  it("settles USD received money against CRC invoices using the same daily rate direction", async () => {
    const pending = pendingInvoicePayment({
      currencyCode: "USD",
      receivedAmount: d("200"),
      allocationProposal: { kind: "INVOICES", targets: [{ targetType: "ACCOUNT_RECEIVABLE", targetId: "ar-a", intendedAmount: "89988.00000" }] },
    });
    const verified = approvedInvoicePayment(pending, {
      availableAmount: d("200"), settlementCurrencyCode: "CRC", settlementAmount: d("89988"), settlementAvailableAmount: d("89988"),
      settlementExchangeRate: d("449.94"), settlementExchangeRateSource: "MANUAL", settlementExchangeRateEffectiveDate: new Date("2026-09-14T00:00:00.000Z"),
    });
    const allocated = approvedInvoicePayment(verified, { status: PaymentStatus.FULLY_ALLOCATED, availableAmount: d("0"), settlementAvailableAmount: d("0") });
    const c = context({ payment: pending, transactionVerified: verified, transactionFinal: allocated, receivable: receivable({ currencyCode: "CRC", originalAmount: d("89988"), outstandingAmount: d("89988") }) });
    c.tx.$queryRaw.mockResolvedValueOnce([{ id: pending.id }]).mockResolvedValueOnce([{ id: "ar-a" }]);
    c.tx.paymentAllocation.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "allocation-a", paymentId: pending.id, accountReceivableId: "ar-a", amount: d("89988"), allocationDeduplicationKey: `reported-invoice-payment:${pending.id}:ar-a` }]);

    await expect(c.service.approve("tenant-a", pending.id, actor)).resolves.toMatchObject({ status: PaymentStatus.FULLY_ALLOCATED, currencyCode: "USD", settlementCurrencyCode: "CRC" });
    expect(c.tx.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ settlementAmount: d("89988"), settlementExchangeRateSource: "MANUAL" }) }));
    expect(c.tx.payment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ availableAmount: d("0"), settlementAvailableAmount: d("0") }) }));
  });

  it("rolls back an approval before receipt or allocations when a locked target is stale", async () => {
    const c = context({ receivables: [receivable({ outstandingAmount: d("99") })] });

    await expect(c.service.approve("tenant-a", "payment-invoice-a", actor)).rejects.toMatchObject({
      response: { message: "INVOICE_PENDING_PAYMENT_STALE_TARGET" },
    });
    expect(c.businessNumbers.next).not.toHaveBeenCalled();
    expect(c.tx.payment.updateMany).not.toHaveBeenCalled();
    expect(c.tx.paymentAllocation.createMany).not.toHaveBeenCalled();
    expect(c.tx.accountReceivable.update).not.toHaveBeenCalled();
  });

  it("returns an already approved invoice payment without another receipt, allocation, or audit", async () => {
    const approved = approvedInvoicePayment(pendingInvoicePayment(), { status: PaymentStatus.FULLY_ALLOCATED, availableAmount: d("0") });
    const c = context({ payment: approved, transactionFinal: approved });

    await expect(c.service.approve("tenant-a", approved.id, actor)).resolves.toBe(approved);
    expect(c.businessNumbers.next).not.toHaveBeenCalled();
    expect(c.tx.payment.updateMany).not.toHaveBeenCalled();
    expect(c.tx.paymentAllocation.createMany).not.toHaveBeenCalled();
    expect(c.tx.billingAuditLog.create).not.toHaveBeenCalled();
    expect(c.dailyExchangeRates.resolveDailyExchangeRate).not.toHaveBeenCalled();
  });
});

const actor = { userId: "reviewer-a", name: "Reviewer A" };

function d(value: string) {
  return new Prisma.Decimal(value);
}

function pendingInvoicePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "payment-invoice-a",
    tenantId: "tenant-a",
    customerId: "customer-a",
    payerDisplayName: "Customer A",
    contractId: null,
    currencyCode: "USD",
    receivedAmount: d("100"),
    availableAmount: d("0"),
    receivedAt: new Date("2026-09-13T10:00:00.000Z"),
    paymentMethod: "BANK_TRANSFER",
    externalReference: "BANK-100",
    description: "Customer-reported payment",
    purpose: PaymentPurpose.GENERAL,
    status: PaymentStatus.PENDING_VERIFICATION,
    receiptNumber: null,
    reviewedAt: null,
    reviewedByUserId: null,
    reviewedByName: null,
    rejectionReason: null,
    allocationProposal: {
      kind: "INVOICES",
      targets: [{ targetType: "ACCOUNT_RECEIVABLE", targetId: "ar-a", intendedAmount: "100.00" }],
    },
    ...overrides,
  };
}

function receivable(overrides: Record<string, unknown> = {}) {
  return {
    id: "ar-a",
    customerId: "customer-a",
    currencyCode: "USD",
    originalAmount: d("200"),
    outstandingAmount: d("200"),
    status: AccountReceivableStatus.OPEN,
    sourceType: "BILLING_DOCUMENT",
    sourceId: "document-a",
    sourceNumber: "INV-101",
    ...overrides,
  };
}

function approvedInvoicePayment(payment: any, overrides: Record<string, unknown> = {}) {
  return {
    ...payment,
    status: PaymentStatus.RECEIVED,
    receiptNumber: "RCP-2026-000007",
    availableAmount: payment.receivedAmount,
    reviewedAt: new Date("2026-09-13T12:00:00.000Z"),
    reviewedByUserId: "reviewer-a",
    reviewedByName: "Reviewer A",
    rejectionReason: null,
    ...overrides,
  };
}

function paymentEvidence(overrides: Record<string, unknown> = {}) {
  return {
    id: "evidence-a",
    tenantId: "tenant-a",
    paymentId: "payment-invoice-a",
    objectKey: "finance/payment-evidence/private-object-key",
    originalFileName: "receipt.png",
    mimeType: "image/png",
    size: 12,
    createdAt: new Date("2026-09-13T10:01:00.000Z"),
    ...overrides,
  };
}

function context(options: {
  payment?: any;
  transactionVerified?: any;
  transactionFinal?: any;
  receivables?: any[];
  receivable?: any;
  paymentEvidence?: any[];
  dailyResolution?: any;
} = {}) {
  const payment = options.payment ?? pendingInvoicePayment();
  const currentReceivables = options.receivables ?? [options.receivable ?? receivable()];
  const transactionFinal = options.transactionFinal ?? payment;
  const transactionVerified = options.transactionVerified ?? transactionFinal;
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: payment.id }]),
    payment: {
      findFirst: jest.fn().mockResolvedValue(transactionFinal).mockResolvedValueOnce(payment).mockResolvedValueOnce(transactionVerified),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue(transactionFinal),
    },
    accountReceivable: { findMany: jest.fn().mockResolvedValue(currentReceivables), update: jest.fn().mockResolvedValue({}) },
    paymentAllocation: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn().mockResolvedValue({ count: currentReceivables.length }) },
    billingAuditLog: { create: jest.fn().mockResolvedValue({ id: "audit-a" }), createMany: jest.fn().mockResolvedValue({ count: currentReceivables.length }) },
  };
  const prisma = {
    $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)),
    payment: {
      findMany: jest.fn(({ where }) => Promise.resolve(where.purpose === PaymentPurpose.GENERAL ? [payment] : [])),
      findFirst: jest.fn().mockResolvedValue(payment),
    },
    client: { findMany: jest.fn().mockResolvedValue([{ id: "customer-a", fullName: "Customer A", idNumber: "1", email: "customer@example.com", phone: "80000000" }]) },
    accountReceivable: { findMany: jest.fn().mockResolvedValue(currentReceivables) },
    billingDocument: { findMany: jest.fn().mockResolvedValue([{ id: "document-a", fiscalNumber: "50601012600010000000100100001010000000001", internalNumber: "INV-101", issuedAt: new Date("2026-09-01T00:00:00.000Z") }]) },
    paymentEvidence: { findMany: jest.fn().mockResolvedValue(options.paymentEvidence ?? []) },
  };
  const businessNumbers = { next: jest.fn().mockResolvedValue(7n) };
  const contracts = { approveInTransaction: jest.fn() };
  const commercialObligationAllocations = { allocateInTransaction: jest.fn() };
  const storage = { generateSignedUrl: jest.fn() };
  const fiscalizationOutbox = { enqueueConfirmedPaymentInTransaction: jest.fn() };
  const dailyExchangeRates = { resolveDailyExchangeRate: jest.fn().mockResolvedValue(options.dailyResolution ?? { status: "AVAILABLE", source: "MANUAL", effectiveDate: "2026-09-14", baseCurrencyCode: "CRC", rate: d("449.94") }) };
  return {
    service: Reflect.construct(ContractReservationReviewService, [prisma, businessNumbers, contracts, commercialObligationAllocations, storage, fiscalizationOutbox, dailyExchangeRates]),
    prisma, tx, businessNumbers, contracts, commercialObligationAllocations, fiscalizationOutbox, dailyExchangeRates,
  };
}
