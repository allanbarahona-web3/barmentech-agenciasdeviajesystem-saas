import { PaymentPurpose, PaymentStatus } from "@prisma/client";
import { PendingInvoicePaymentEvidenceService } from "./pending-invoice-payment-evidence.service";

describe("PendingInvoicePaymentEvidenceService", () => {
  it("stores a pending invoice-payment file only as PaymentEvidence", async () => {
    const c = context();

    await expect(c.service.attach(attachInput())).resolves.toMatchObject({
      id: "evidence-a",
      paymentId: "payment-a",
      originalFileName: "receipt.png",
      mimeType: "image/png",
      size: 12,
    });

    expect(c.storage.uploadObject).toHaveBeenCalledWith(expect.objectContaining({
      contentType: "image/png",
      body: Buffer.from("evidence-data"),
      objectKey: expect.stringContaining("finance/payment-evidence/tenant-a/customer-a/payment-a/"),
    }));
    expect(c.tx.paymentEvidence.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: "tenant-a", paymentId: "payment-a", originalFileName: "receipt.png", mimeType: "image/png", size: 12 }),
    }));
    expect(c.prisma).not.toHaveProperty("paymentReceiptImage");
    expect(c.tx).not.toHaveProperty("paymentAllocation");
    expect(c.tx).not.toHaveProperty("accountReceivable");
    expect(c.tx).not.toHaveProperty("billingDocument");
  });

  it("reuses the same evidence flow for a pending reported Contract installment", async () => {
    const c = context({ payment: payment({
      purpose: PaymentPurpose.CONTRACT_INSTALLMENT,
      contractId: "contract-a",
      allocationProposal: { kind: "CONTRACTS", targets: [{ targetType: "COMMERCIAL_OBLIGATION", targetId: "obligation-a", intendedAmount: "100.00" }] },
    }) });

    await expect(c.service.attach(attachInput())).resolves.toMatchObject({ id: "evidence-a", paymentId: "payment-a" });
    expect(c.tx.paymentEvidence.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: "tenant-a", paymentId: "payment-a" }),
    }));
    expect(c.tx).not.toHaveProperty("paymentAllocation");
    expect(c.tx).not.toHaveProperty("billingDocument");
  });

  it("rejects a non-pending Payment before uploading evidence", async () => {
    const c = context({ payment: payment({ status: PaymentStatus.RECEIVED }) });

    await expect(c.service.attach(attachInput())).rejects.toThrow("FINANCE_PENDING_PAYMENT_NOT_PENDING");
    expect(c.storage.uploadObject).not.toHaveBeenCalled();
    expect(c.tx.paymentEvidence.create).not.toHaveBeenCalled();
  });

  it.each([
    ["tenant", null],
    ["customer", payment({ customerId: "customer-other" })],
  ])("does not attach evidence outside the scoped %s", async (_, scopedPayment) => {
    const c = context({ payment: scopedPayment });

    await expect(c.service.attach(attachInput())).rejects.toThrow("FINANCE_PENDING_PAYMENT_NOT_FOUND");
    expect(c.storage.uploadObject).not.toHaveBeenCalled();
  });

  it("returns a tenant/customer-scoped signed evidence access URL", async () => {
    const c = context();
    c.prisma.paymentEvidence.findFirst.mockResolvedValue({ id: "evidence-a", originalFileName: "receipt.png", mimeType: "image/png", size: 12, objectKey: "finance/payment-evidence/file" });

    await expect(c.service.getAccess({ tenantId: "tenant-a", customerId: "customer-a", paymentId: "payment-a", evidenceId: "evidence-a" })).resolves.toMatchObject({
      id: "evidence-a",
      url: "https://signed.example/evidence",
    });
    expect(c.prisma.paymentEvidence.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "evidence-a", paymentId: "payment-a", tenantId: "tenant-a" }),
    }));
  });

  it("uses OpenAiVisionService for prefill-only extraction without persisting a file or financial data", async () => {
    const c = context();
    c.vision.extractPaymentDataFromImage.mockResolvedValue({
      success: true,
      data: { amount: 500, currency: "USD", date: "2026-09-13", reference: "BANK-500", payerName: "Customer A", confidence: 0.91 },
    });

    await expect(c.service.extract({ tenantId: "tenant-a", customerId: "customer-a", file: imageFile() })).resolves.toEqual({
      extractedData: { amount: 500, currency: "USD", date: "2026-09-13", reference: "BANK-500", payerName: "Customer A", confidence: 0.91 },
      destinationValidation: { status: "UNKNOWN", reason: "NO_IDENTIFIER" },
      warnings: [],
    });
    expect(c.vision.extractPaymentDataFromImage).toHaveBeenCalledWith(Buffer.from("evidence-data"), "image/png");
    expect(c.storage.uploadObject).not.toHaveBeenCalled();
    expect(c.prisma).not.toHaveProperty("paymentReceiptImage");
    expect(c.prisma).not.toHaveProperty("paymentAllocation");
    expect(c.prisma).not.toHaveProperty("accountReceivable");
  });

  it("persists untrusted extraction and server-computed destination validation only on PaymentEvidence", async () => {
    const c = context();
    c.destinationValidator.validate.mockResolvedValue({ status: "UNMATCHED", reason: "NOT_REGISTERED" });

    await c.service.attach({ ...attachInput(), extraction: {
      destinationAccount: "CR00 1234-5678", destinationBank: "Banco desconocido", reference: "REF-123", paymentCode: "LUC-123", confidence: 0.9,
    } });

    expect(c.destinationValidator.validate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-a", extractedDestinationAccount: "CR00 1234-5678" }));
    expect(c.tx.paymentEvidence.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      extractionMetadata: expect.objectContaining({
        extraction: expect.objectContaining({ destinationAccount: "CR00 1234-5678", reference: "REF-123", confidence: 0.9 }),
        destinationValidation: expect.objectContaining({ status: "UNMATCHED", reason: "NOT_REGISTERED", overrideAccepted: false }),
      }),
    }) }));
    expect(c.tx).not.toHaveProperty("paymentAllocation");
    expect(c.tx).not.toHaveProperty("billingDocument");
  });

  it("records one explicit unmatched-destination override with actor and timestamp", async () => {
    const c = context({ evidenceMetadata: metadata({ status: "UNMATCHED", reason: "NOT_REGISTERED" }) });

    await expect(c.service.acceptDestinationOverride({ tenantId: "tenant-a", customerId: "customer-a", paymentId: "payment-a", evidenceId: "evidence-a", actor: { userId: "agent-a", name: "Agent A" }, reason: "Cliente confirmó la cuenta" })).resolves.toMatchObject({
      status: "UNMATCHED", overrideAccepted: true, overrideAcceptedByUserId: "agent-a", overrideAcceptedByName: "Agent A", overrideReason: "Cliente confirmó la cuenta", overrideAcceptedAt: expect.any(String),
    });
    expect(c.tx.paymentEvidence.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ extractionMetadata: expect.objectContaining({ destinationValidation: expect.objectContaining({ overrideAccepted: true, overrideAcceptedByUserId: "agent-a" }) }) }) }));
    expect(c.tx.billingAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "PAYMENT_DESTINATION_OVERRIDE_ACCEPTED", actorUserId: "agent-a" }) }));
    expect(c.tx).not.toHaveProperty("paymentAllocation");
  });

  it.each([
    [null, "FINANCE_PAYMENT_DESTINATION_VALIDATION_NOT_FOUND"],
    [metadata({ status: "MATCHED" }), "FINANCE_PAYMENT_DESTINATION_OVERRIDE_NOT_REQUIRED"],
  ])("rejects an invalid destination override without mutation", async (evidenceMetadata, errorCode) => {
    const c = context({ evidenceMetadata });
    await expect(c.service.acceptDestinationOverride({ tenantId: "tenant-a", customerId: "customer-a", paymentId: "payment-a", evidenceId: "evidence-a", actor: { userId: "agent-a", name: "Agent A" } })).rejects.toThrow(errorCode);
    expect(c.tx.paymentEvidence.update).not.toHaveBeenCalled();
    expect(c.tx.billingAuditLog.create).not.toHaveBeenCalled();
  });

  it("tenant-scopes override evidence to the pending customer payment", async () => {
    const c = context({ evidenceMetadata: metadata({ status: "UNMATCHED", reason: "NOT_REGISTERED" }) });
    c.tx.paymentEvidence.findFirst.mockResolvedValue(null);

    await expect(c.service.acceptDestinationOverride({ tenantId: "tenant-a", customerId: "customer-a", paymentId: "payment-a", evidenceId: "evidence-other", actor: { userId: "agent-a", name: "Agent A" } })).rejects.toThrow("FINANCE_PENDING_PAYMENT_EVIDENCE_NOT_FOUND");
    expect(c.tx.paymentEvidence.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "evidence-other", paymentId: "payment-a", tenantId: "tenant-a" } }));
    expect(c.tx.paymentEvidence.update).not.toHaveBeenCalled();
  });

  it("requires a supported image for AI extraction without attempting conversion", async () => {
    const c = context();

    await expect(c.service.extract({ tenantId: "tenant-a", customerId: "customer-a", file: { ...imageFile(), mimetype: "application/pdf" } })).rejects.toThrow("FINANCE_PAYMENT_EVIDENCE_IMAGE_REQUIRED");
    expect(c.vision.extractPaymentDataFromImage).not.toHaveBeenCalled();
  });
});

function attachInput() {
  return { tenantId: "tenant-a", customerId: "customer-a", paymentId: "payment-a", file: imageFile() };
}

function imageFile() {
  return { buffer: Buffer.from("evidence-data"), mimetype: "image/png", originalname: "receipt.png", size: 12 };
}

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: "payment-a",
    tenantId: "tenant-a",
    customerId: "customer-a",
    purpose: PaymentPurpose.GENERAL,
    contractId: null,
    status: PaymentStatus.PENDING_VERIFICATION,
    allocationProposal: { kind: "INVOICES", targets: [{ targetType: "ACCOUNT_RECEIVABLE", targetId: "ar-a", intendedAmount: "100.00" }] },
    ...overrides,
  };
}

function metadata(validation: Record<string, unknown>) {
  return {
    schemaVersion: 1,
    extraction: { destinationAccount: "CR001234", sinpePhone: null, destinationBank: "Banco A", reference: "REF-1", paymentCode: null, confidence: 0.9 },
    destinationValidation: { evaluatedAt: "2026-09-14T00:00:00.000Z", overrideAccepted: false, ...validation },
  };
}

function context(options: { payment?: ReturnType<typeof payment> | null; accounts?: unknown[]; evidenceMetadata?: unknown } = {}) {
  const currentPayment = options.payment === undefined ? payment() : options.payment;
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue(currentPayment ? [{ id: "payment-a" }] : []),
    payment: { findFirst: jest.fn().mockResolvedValue(currentPayment) },
    paymentEvidence: {
      create: jest.fn().mockResolvedValue({ id: "evidence-a", paymentId: "payment-a", originalFileName: "receipt.png", mimeType: "image/png", size: 12, createdAt: new Date("2026-09-13T00:00:00.000Z") }),
      findFirst: jest.fn().mockResolvedValue({ id: "evidence-a", extractionMetadata: options.evidenceMetadata ?? null }),
      update: jest.fn().mockResolvedValue({ id: "evidence-a" }),
    },
    billingAuditLog: { create: jest.fn().mockResolvedValue({ id: "audit-a" }) },
  };
  const prisma = {
    $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)),
    payment: { findFirst: jest.fn().mockResolvedValue(currentPayment) },
    paymentEvidence: { findFirst: jest.fn() },
    client: { findFirst: jest.fn().mockResolvedValue({ id: "customer-a" }) },
  };
  const storage = { uploadObject: jest.fn().mockResolvedValue(undefined), deleteObject: jest.fn().mockResolvedValue(undefined), generateSignedUrl: jest.fn().mockResolvedValue("https://signed.example/evidence") };
  const vision = { extractPaymentDataFromImage: jest.fn() };
  const destinationValidator = { validate: jest.fn().mockResolvedValue({ status: "UNKNOWN", reason: "NO_IDENTIFIER" }) };
  return { service: new PendingInvoicePaymentEvidenceService(prisma as never, storage as never, vision as never, destinationValidator as never), prisma, tx, storage, vision, destinationValidator };
}
