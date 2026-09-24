import { ConflictException, NotFoundException } from "@nestjs/common";
import { CustomQuotationProposalMapper } from "./custom-quotation-proposal.mapper";
import { CustomQuotationProposalService } from "./custom-quotation-proposal.service";

describe("CustomQuotationProposalService", () => {
  it("generates and registers a deterministic proposal from immutable version snapshots", async () => {
    const c = context();
    c.tx.customQuotationVersion.findFirst.mockResolvedValue(version());

    const result = await c.service.persist("tenant-a", "quotation-a", "version-a");

    const html = c.pdf.renderDocumentToBuffer.mock.calls[0][0] as string;
    expect(html).toContain("CQ-2026-000001");
    expect(html).toContain("Versión");
    expect(html).toContain("Traslado privado");
    expect(html).toContain("Hospedaje 5 noches");
    expect(html.indexOf("Traslado privado")).toBeLessThan(html.indexOf("Hospedaje 5 noches"));
    expect(html).toContain("USD 1.450,12");
    expect(html).toContain("Ana Cliente");
    expect(html).toContain("Propuesta congelada");
    expect(html).toContain("Crédito");
    for (const forbidden of ["CABYS", "1234567890123", "authoritativeCostAmount", "riskMarginPercent", "bankCommission", "supplier"]) {
      expect(html).not.toContain(forbidden);
    }
    expect(c.tx.customQuotationLine).toBeUndefined();
    expect(c.storage.uploadObject).toHaveBeenCalledWith(expect.objectContaining({
      objectKey: "production/acme/custom-quotations/proposals/CQ-2026-000001/v1/proposal.pdf",
      contentType: "application/pdf",
      body: Buffer.from("proposal-pdf"),
    }));
    expect(c.generated.register).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a", ownerType: "CUSTOM_QUOTATION_VERSION", ownerId: "version-a",
      documentType: "COMMERCIAL_PROPOSAL", variant: "GENERATED", fileName: "propuesta-comercial.pdf",
    }));
    expect(result).toEqual({ id: "document-a" });
    expect(c.tx.salesOrder).toBeUndefined();
    expect(c.tx.billingDocument).toBeUndefined();
  });

  it("uses tenant branding, recipient, and title snapshots without reading mutable quotation content", async () => {
    const c = context();
    c.tx.customQuotationVersion.findFirst.mockResolvedValue(version());

    const proposal = await c.service.prepareDocument("tenant-a", "quotation-a", "version-a");

    expect(c.tenants.getTenantConfig).toHaveBeenCalledWith("tenant-a");
    expect(proposal.company).toMatchObject({ name: "Viajes Ejemplo", logoSrc: "https://example.test/logo.png", primaryColor: "#123456" });
    expect(proposal.finalSellingPrice).toBe("1450.12345");
    expect(proposal.title).toBe("Propuesta congelada");
    expect(proposal.lines).toEqual([
      { displayOrder: 1, description: "Traslado privado", quantity: "1.2500", commercialNote: "Hotel al aeropuerto" },
      { displayOrder: 2, description: "Hospedaje 5 noches", quantity: "1.0000", commercialNote: null },
    ]);
    expect(proposal).not.toHaveProperty("fiscalClassification");
    expect(proposal).not.toHaveProperty("authoritativeCostAmount");
    expect(c.tx.customQuotationVersion.findFirst).toHaveBeenCalledTimes(1);
  });

  it("renders an absent title snapshot without falling back to the mutable quotation title", async () => {
    const c = context();
    c.tx.customQuotationVersion.findFirst.mockResolvedValue(version({ title: null }));

    const proposal = await c.service.prepareDocument("tenant-a", "quotation-a", "version-a");

    expect(proposal.title).toBeNull();
    expect(c.tx.customQuotationVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ customQuotation: { select: { quotationNumber: true } } }),
    }));
  });

  it("provides tenant-safe persisted proposal access without changing approval or commercial state", async () => {
    const c = context();
    const sentAt = new Date("2026-09-23T16:05:00.000Z");
    c.tx.customQuotationVersion.findFirst.mockResolvedValue(version({ deliverySentAt: sentAt, deliveryRecipientEmail: "ana@example.com" }));
    c.generated.findLatest.mockResolvedValue({ id: "document-a", fileName: "propuesta-comercial.pdf", mimeType: "application/pdf", size: 2048, createdAt: new Date(), updatedAt: new Date() });
    c.generated.getSignedUrl.mockResolvedValue("https://signed.example/proposal.pdf");

    const result = await c.service.getPersistedPreview("tenant-a", "quotation-a", "version-a");

    expect(c.generated.findLatest).toHaveBeenCalledWith({
      tenantId: "tenant-a", ownerType: "CUSTOM_QUOTATION_VERSION", ownerId: "version-a",
      documentType: "COMMERCIAL_PROPOSAL", variant: "GENERATED", version: 1,
    });
    expect(result).toMatchObject({ id: "document-a", url: "https://signed.example/proposal.pdf", expiresInSeconds: 900, delivery: { sentAt, recipientEmail: "ana@example.com" } });
    expect(JSON.stringify(result.delivery)).not.toContain("emailId");
    expect(JSON.stringify(result.delivery)).not.toContain("provider");
    expect(c.tx.customQuotationVersion.updateMany).toBeUndefined();
  });

  it("rejects cross-tenant, non-issued, and missing immutable versions before rendering", async () => {
    const crossTenant = context();
    crossTenant.tx.customQuotationVersion.findFirst.mockResolvedValue(null);
    await expect(crossTenant.service.persist("tenant-a", "quotation-a", "version-b")).rejects.toBeInstanceOf(NotFoundException);
    expect(crossTenant.pdf.renderDocumentToBuffer).not.toHaveBeenCalled();

    const notIssued = context();
    notIssued.tx.customQuotationVersion.findFirst.mockResolvedValue(version({ status: "CANCELLED" }));
    await expect(notIssued.service.persist("tenant-a", "quotation-a", "version-a")).rejects.toBeInstanceOf(ConflictException);
    expect(notIssued.pdf.renderDocumentToBuffer).not.toHaveBeenCalled();

    const missingRecipient = context();
    missingRecipient.tx.customQuotationVersion.findFirst.mockResolvedValue(version({ recipientFullName: null }));
    await expect(missingRecipient.service.persist("tenant-a", "quotation-a", "version-a"))
      .rejects.toThrow("CUSTOM_QUOTATION_RECIPIENT_SNAPSHOT_REQUIRED");
    expect(missingRecipient.pdf.renderDocumentToBuffer).not.toHaveBeenCalled();
    expect(missingRecipient.tx.customQuotationVersion.findFirst).toHaveBeenCalledTimes(1);
  });
});

function context() {
  const tx = {
    $executeRaw: jest.fn(),
    customQuotationVersion: { findFirst: jest.fn() },
    tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Costa_Rica" }) },
  } as any;
  const prisma = { $transaction: jest.fn(async (work: (value: typeof tx) => Promise<unknown>) => work(tx)) };
  const tenants = { getTenantConfig: jest.fn().mockResolvedValue({ name: "Viajes Ejemplo", legalId: "3-101-123456", contactEmail: "ventas@example.com", contactPhone: "+506 2222-2222", logoUrl: "https://example.test/logo.png", primaryColor: "#123456", subdomain: "acme" }) };
  const pdf = { renderDocumentToBuffer: jest.fn().mockResolvedValue({ pdfBuffer: Buffer.from("proposal-pdf") }) };
  const storage = { uploadObject: jest.fn().mockResolvedValue(undefined) };
  const generated = { register: jest.fn().mockResolvedValue({ id: "document-a" }), findLatest: jest.fn(), getSignedUrl: jest.fn() };
  const config = { get: jest.fn().mockReturnValue("production") };
  return {
    tx, tenants, pdf, storage, generated, config,
    service: new CustomQuotationProposalService(prisma as never, new CustomQuotationProposalMapper(), tenants as never, pdf as never, storage as never, generated as never, config as never),
  };
}

function version(overrides: Record<string, unknown> = {}) {
  return {
    id: "version-a", status: "ISSUED", versionNumber: 1, currency: "USD", finalSellingPrice: "1450.12345",
    quotationValidUntil: new Date("2026-12-31T00:00:00.000Z"), paymentConditionType: "CREDIT", paymentTermValue: 30, paymentTermUnit: "DAYS",
    commercialObservations: "Incluye traslados y hospedaje", createdAt: new Date("2026-09-21T02:00:00.000Z"),
    lines: [
      { displayOrder: 1, description: "Traslado privado", quantity: "1.2500", commercialNote: "Hotel al aeropuerto" },
      { displayOrder: 2, description: "Hospedaje 5 noches", quantity: "1.0000", commercialNote: null },
    ],
    recipientFullName: "Ana Cliente", recipientEmail: "ana@example.com", recipientPhone: "+506 8888-8888", recipientCompanyName: "Orbit Travel",
    title: "Propuesta congelada",
    customQuotation: { quotationNumber: "CQ-2026-000001", title: "Título mutable" },
    ...overrides,
  };
}
