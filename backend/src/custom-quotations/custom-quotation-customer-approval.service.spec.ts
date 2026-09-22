import { ConflictException, NotFoundException } from "@nestjs/common";
import { CustomQuotationApprovalService } from "./custom-quotation-approval.service";
import { CustomQuotationCustomerApprovalService } from "./custom-quotation-customer-approval.service";

describe("CustomQuotationCustomerApprovalService", () => {
  it("resolves only a CUSTOM_QUOTATION_VERSION commercial-proposal token and returns commercial-safe immutable data", async () => {
    const c = context();
    c.access.resolve.mockResolvedValue(access());
    c.tx.customQuotationVersion.findFirst.mockResolvedValue(publicVersion());
    c.documents.getSignedUrl.mockResolvedValue("https://signed.example/proposal.pdf");

    const result = await c.service.getPublicProposal("secure-token");

    expect(c.access.resolve).toHaveBeenCalledWith("secure-token", "APPROVAL");
    expect(c.documents.getSignedUrl).toHaveBeenCalledWith("tenant-a", "document-a", 900);
    expect(result).toEqual(expect.objectContaining({
      quotationNumber: "CQ-2026-000001", versionNumber: 1, currency: "USD", finalSellingPrice: "1450.12345", status: "ISSUED",
      lines: [
        { displayOrder: 1, description: "Vuelo SJO – MAD", quantity: "1.0000", commercialNote: null },
        { displayOrder: 2, description: "Hospedaje 5 noches", quantity: "1.0000", commercialNote: "Incluye desayuno" },
      ],
      document: expect.objectContaining({ url: "https://signed.example/proposal.pdf", expiresInSeconds: 900 }),
    }));
    for (const forbidden of ["authoritativeCostAmount", "supplier", "cabysCode", "taxCode", "riskMarginPercent", "agencyProfit", "tenantId"]) {
      expect(result).not.toHaveProperty(forbidden);
      expect(JSON.stringify(result)).not.toContain(forbidden);
    }
  });

  it("rejects unrelated owner/type tokens and expired/purpose-invalid tokens", async () => {
    const wrongOwner = context();
    wrongOwner.access.resolve.mockResolvedValue(access({ generatedDocument: document({ ownerType: "ADDITIONAL_SERVICE_ORDER" }) }));
    await expect(wrongOwner.service.getPublicProposal("token")).rejects.toBeInstanceOf(NotFoundException);
    expect(wrongOwner.tx.customQuotationVersion.findFirst).not.toHaveBeenCalled();

    const wrongType = context();
    wrongType.access.resolve.mockResolvedValue(access({ generatedDocument: document({ documentType: "INVOICE" }) }));
    await expect(wrongType.service.getPublicProposal("token")).rejects.toBeInstanceOf(NotFoundException);

    const expired = context();
    expired.access.resolve.mockRejectedValue(new NotFoundException("Approval link is invalid or expired."));
    await expect(expired.service.getPublicProposal("expired-token")).rejects.toBeInstanceOf(NotFoundException);
    expect(expired.tx.customQuotationVersion.findFirst).not.toHaveBeenCalled();
  });

  it("accepts an ISSUED version atomically, consumes the token, and records an external customer without fabricating a user id", async () => {
    const c = context();
    c.access.resolve.mockResolvedValue(access());
    c.tx.customQuotationVersion.findFirst
      .mockResolvedValueOnce(transitionTarget())
      .mockResolvedValueOnce(lifecycleVersion());

    const result = await c.service.accept("secure-token");

    expect(c.access.consumeInTransaction).toHaveBeenCalledWith(c.tx, "access-a");
    expect(c.tx.customQuotationVersion.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "ACCEPTED", acceptedByUserId: null, acceptedByName: "Ana Cliente" }),
    }));
    expect(c.tx.customQuotation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: "ACCEPTED", updatedByUserId: null, updatedByName: "Ana Cliente" },
    }));
    expect(result).toMatchObject({ status: "ACCEPTED", acceptedBy: { userId: null, name: "Ana Cliente" } });
    noDownstreamSideEffects(c);
  });

  it("does not accept an expired quotation and does not create a Sales Order, Billing, or email side effect", async () => {
    const c = context();
    c.access.resolve.mockResolvedValue(access());
    c.tx.customQuotationVersion.findFirst
      .mockResolvedValueOnce(transitionTarget())
      .mockResolvedValueOnce(lifecycleVersion({ quotationValidUntil: new Date("2020-01-01T12:00:00.000Z") }));

    await expect(c.service.accept("secure-token")).rejects.toThrow("CUSTOM_QUOTATION_VERSION_EXPIRED");

    expect(c.tx.customQuotationVersion.updateMany).not.toHaveBeenCalled();
    expect(c.tx.customQuotation.updateMany).not.toHaveBeenCalled();
    noDownstreamSideEffects(c);
  });

  it("rejects an ISSUED version with the same one-use token protection", async () => {
    const c = context();
    c.access.resolve.mockResolvedValue(access());
    c.tx.customQuotationVersion.findFirst
      .mockResolvedValueOnce(transitionTarget())
      .mockResolvedValueOnce(lifecycleVersion());

    const result = await c.service.reject("secure-token");

    expect(c.access.consumeInTransaction).toHaveBeenCalledWith(c.tx, "access-a");
    expect(c.tx.customQuotationVersion.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "REJECTED", rejectedAt: expect.any(Date) } }));
    expect(c.tx.customQuotation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "REJECTED", updatedByUserId: null, updatedByName: "Ana Cliente" } }));
    expect(result).toMatchObject({ status: "REJECTED" });
  });

  it("keeps terminal lifecycle rules shared with internal approval", async () => {
    const c = context();
    c.access.resolve.mockResolvedValue(access());
    c.tx.customQuotationVersion.findFirst
      .mockResolvedValueOnce(transitionTarget())
      .mockResolvedValueOnce(lifecycleVersion({ status: "ACCEPTED", acceptedAt: new Date(), acceptedByUserId: "admin-a", acceptedByName: "Admin A" }));

    await expect(c.service.reject("secure-token")).rejects.toBeInstanceOf(ConflictException);
    expect(c.tx.customQuotationVersion.updateMany).not.toHaveBeenCalled();
    expect(c.tx.customQuotation.updateMany).not.toHaveBeenCalled();
  });
});

function context() {
  const tx = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([{ id: "locked" }]),
    customQuotation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    customQuotationVersion: { findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Costa_Rica" }) },
    generatedDocumentAccessToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    tenant: { findUnique: jest.fn().mockResolvedValue({ name: "Viajes Ejemplo", logoUrl: "https://example.test/logo.png" }) },
  } as any;
  const prisma = { $transaction: jest.fn(async (work: (value: typeof tx) => Promise<unknown>) => work(tx)) };
  const access = { resolve: jest.fn(), consumeInTransaction: jest.fn().mockResolvedValue(true) };
  const documents = { getSignedUrl: jest.fn() };
  const internalApprovals = new CustomQuotationApprovalService(prisma as never);
  return {
    tx, access, documents,
    service: new CustomQuotationCustomerApprovalService(prisma as never, access as never, documents as never, internalApprovals),
  };
}

function access(overrides: Record<string, unknown> = {}) {
  return { id: "access-a", generatedDocument: document(), ...overrides };
}

function document(overrides: Record<string, unknown> = {}) {
  return { id: "document-a", tenantId: "tenant-a", ownerType: "CUSTOM_QUOTATION_VERSION", ownerId: "version-a", documentType: "COMMERCIAL_PROPOSAL", variant: "GENERATED", version: 1, fileName: "propuesta-comercial.pdf", mimeType: "application/pdf", size: 2048, ...overrides };
}

function publicVersion() {
  return {
    id: "version-a", versionNumber: 1, status: "ISSUED", currency: "USD", finalSellingPrice: "1450.12345", quotationValidUntil: new Date("2099-12-31T12:00:00.000Z"), paymentConditionType: "CREDIT", paymentTermValue: 30, paymentTermUnit: "DAYS", commercialObservations: "Tarifa sujeta a disponibilidad",
    lines: [{ displayOrder: 1, description: "Vuelo SJO – MAD", quantity: "1.0000", commercialNote: null }, { displayOrder: 2, description: "Hospedaje 5 noches", quantity: "1.0000", commercialNote: "Incluye desayuno" }],
    customQuotation: { quotationNumber: "CQ-2026-000001" },
  };
}

function transitionTarget() {
  return { id: "version-a", customQuotationId: "quotation-a", customQuotation: { customer: { fullName: "Ana Cliente" } } };
}

function lifecycleVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: "version-a", customQuotationId: "quotation-a", costingProjectId: "project-a", pricingCalculationVersionId: "pricing-a", status: "ISSUED", currency: "USD", finalSellingPrice: "1450.12345", quotationValidUntil: new Date("2099-12-31T12:00:00.000Z"), fiscalDescription: "Transporte privado", fiscalItemCategory: "SERVICE", cabysCode: "1234567890123", unitOfMeasureCode: "Unid", taxCode: "01", taxRateCode: "08", fiscalTaxPercentage: "13.0000", acceptedAt: null, acceptedByUserId: null, acceptedByName: null, rejectedAt: null, lines: [{ id: "line-a" }], pricingCalculationVersion: { id: "pricing-a", status: "APPROVED", currency: "USD" }, ...overrides,
  };
}

function noDownstreamSideEffects(c: ReturnType<typeof context>) {
  expect(c.tx.salesOrder).toBeUndefined();
  expect(c.tx.billingDocument).toBeUndefined();
  expect(c.tx.email).toBeUndefined();
}
