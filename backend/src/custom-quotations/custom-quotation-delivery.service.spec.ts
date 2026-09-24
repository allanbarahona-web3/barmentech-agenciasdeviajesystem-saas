import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { CustomQuotationDeliveryEmailMapper } from "./custom-quotation-delivery-email.mapper";
import { CustomQuotationDeliveryService } from "./custom-quotation-delivery.service";

const actor = { userId: "agent-a", email: "agent@example.com", name: "Agent A" };

describe("CustomQuotationDeliveryService", () => {
  it("sends an ISSUED immutable proposal with its stored PDF and secure customer approval URL", async () => {
    const c = context();
    c.tx.customQuotationVersion.findFirst.mockResolvedValue(version());
    c.documents.findLatest.mockResolvedValue(document());
    c.documents.download.mockResolvedValue(Buffer.from("proposal-pdf"));
    c.access.issue.mockResolvedValue("approval-token");
    c.email.sendEmail.mockResolvedValue({ success: true, emailId: "email-a" });

    const result = await c.service.send("tenant-a", "quotation-a", "version-a", actor);

    expect(c.documents.findLatest).toHaveBeenCalledWith({ tenantId: "tenant-a", ownerType: "CUSTOM_QUOTATION_VERSION", ownerId: "version-a", documentType: "COMMERCIAL_PROPOSAL", variant: "GENERATED", version: 1 });
    expect(c.documents.download).toHaveBeenCalledWith("tenant-a", "document-a");
    expect(c.access.issue).toHaveBeenCalledWith("document-a", "APPROVAL", expect.any(Date));
    expect(c.email.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a", to: "ana@example.com", template: "business-document-attachment",
      templateData: expect.objectContaining({
        recipientName: "Ana Cliente", documentNumber: "CQ-2026-000001", actionLabel: "Ver y responder cotización",
        actionUrl: "https://app.example.com/custom-quotation-approval/approval-token",
      }),
      attachments: [{ filename: "propuesta-comercial.pdf", content: Buffer.from("proposal-pdf").toString("base64"), contentType: "application/pdf" }],
      triggeredBy: { userId: "agent-a", email: "agent@example.com", fullName: "Agent A" },
      idempotencyKey: expect.stringMatching(/^custom-quotation-proposal:tenant-a:document-a:delivery:/),
    }));
    const sent = c.email.sendEmail.mock.calls[0][0];
    expect(sent.templateData.message).toContain("USD 1.450,12");
    expect(sent.templateData.message).toContain("Propuesta congelada");
    for (const forbidden of ["authoritativeCostAmount", "supplier", "riskMarginPercent", "cabysCode", "commission"]) {
      expect(JSON.stringify(sent)).not.toContain(forbidden);
    }
    expect(result).toEqual({ documentId: "document-a", sentTo: "ana@example.com" });
    expect(result).not.toHaveProperty("emailId");
    expect(c.tx.customQuotationVersion.updateMany).toHaveBeenCalledWith({
      where: { id: "version-a", tenantId: "tenant-a", customQuotationId: "quotation-a" },
      data: { deliverySentAt: expect.any(Date), deliveryRecipientEmail: "ana@example.com" },
    });
    expect(c.email.sendEmail.mock.invocationCallOrder[0]).toBeLessThan(c.tx.customQuotationVersion.updateMany.mock.invocationCallOrder[0]);
    expect(c.tx.customQuotationVersion.findFirst).toHaveBeenCalledTimes(1);
    noLifecycleOrDownstreamSideEffects(c);
  });

  it("rejects expired, terminal, missing-email, and cross-tenant delivery before email/document work", async () => {
    const expired = context();
    expired.tx.customQuotationVersion.findFirst.mockResolvedValue(version({ quotationValidUntil: new Date("2020-01-01T12:00:00.000Z") }));
    await expect(expired.service.send("tenant-a", "quotation-a", "version-a", actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(expired.documents.findLatest).not.toHaveBeenCalled();

    const terminal = context();
    terminal.tx.customQuotationVersion.findFirst.mockResolvedValue(version({ status: "ACCEPTED" }));
    await expect(terminal.service.send("tenant-a", "quotation-a", "version-a", actor)).rejects.toBeInstanceOf(ConflictException);
    expect(terminal.documents.findLatest).not.toHaveBeenCalled();

    const missingEmail = context();
    missingEmail.tx.customQuotationVersion.findFirst.mockResolvedValue(version({ recipientEmail: null }));
    await expect(missingEmail.service.send("tenant-a", "quotation-a", "version-a", actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(missingEmail.documents.findLatest).not.toHaveBeenCalled();

    const missingRecipient = context();
    missingRecipient.tx.customQuotationVersion.findFirst.mockResolvedValue(version({ recipientFullName: null }));
    await expect(missingRecipient.service.send("tenant-a", "quotation-a", "version-a", actor))
      .rejects.toThrow("CUSTOM_QUOTATION_RECIPIENT_SNAPSHOT_REQUIRED");
    expect(missingRecipient.documents.findLatest).not.toHaveBeenCalled();
    expect(missingRecipient.tx.customQuotationVersion.findFirst).toHaveBeenCalledTimes(1);

    const crossTenant = context();
    crossTenant.tx.customQuotationVersion.findFirst.mockResolvedValue(null);
    await expect(crossTenant.service.send("tenant-a", "quotation-b", "version-b", actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(crossTenant.documents.findLatest).not.toHaveBeenCalled();
    expect(crossTenant.tx.customQuotationVersion.updateMany).not.toHaveBeenCalled();
  });

  it("revokes the newly issued token if the generic email provider fails", async () => {
    const c = context();
    c.tx.customQuotationVersion.findFirst.mockResolvedValue(version());
    c.documents.findLatest.mockResolvedValue(document());
    c.documents.download.mockResolvedValue(Buffer.from("proposal-pdf"));
    c.access.issue.mockResolvedValue("approval-token");
    c.email.sendEmail.mockResolvedValue({ success: false, error: "provider unavailable" });

    await expect(c.service.send("tenant-a", "quotation-a", "version-a", actor)).rejects.toThrow("provider unavailable");

    expect(c.access.revoke).toHaveBeenCalledWith("approval-token");
    expect(c.tx.customQuotationVersion.updateMany).not.toHaveBeenCalled();
    noLifecycleOrDownstreamSideEffects(c);
  });

  it("uses the existing provider idempotency convention for each explicit delivery action", async () => {
    const c = context();
    c.tx.customQuotationVersion.findFirst.mockResolvedValue(version());
    c.documents.findLatest.mockResolvedValue(document());
    c.documents.download.mockResolvedValue(Buffer.from("proposal-pdf"));
    c.access.issue.mockResolvedValue("approval-token");
    c.email.sendEmail.mockResolvedValue({ success: true, emailId: "email-a" });

    await c.service.send("tenant-a", "quotation-a", "version-a", actor);
    await c.service.send("tenant-a", "quotation-a", "version-a", actor);

    expect(c.email.sendEmail.mock.calls).toHaveLength(2);
    expect(c.tx.customQuotationVersion.updateMany).toHaveBeenCalledTimes(2);
    const writes = c.tx.customQuotationVersion.updateMany.mock.calls.map((call: any[]) => call[0].data);
    expect(writes.map((write: any) => write.deliveryRecipientEmail)).toEqual(["ana@example.com", "ana@example.com"]);
    expect(writes.every((write: any) => write.deliverySentAt instanceof Date)).toBe(true);
    expect(writes[1].deliverySentAt.getTime()).toBeGreaterThanOrEqual(writes[0].deliverySentAt.getTime());
    expect(c.email.sendEmail.mock.calls.every(([input]) => /^custom-quotation-proposal:tenant-a:document-a:delivery:/.test(input.idempotencyKey))).toBe(true);
    expect(c.access.issue).toHaveBeenCalledTimes(2);
  });

  it("does not fall back to the mutable quotation title when the title snapshot is absent", async () => {
    const c = context();
    c.tx.customQuotationVersion.findFirst.mockResolvedValue(version({ title: null }));
    c.documents.findLatest.mockResolvedValue(document());
    c.documents.download.mockResolvedValue(Buffer.from("proposal-pdf"));
    c.access.issue.mockResolvedValue("approval-token");
    c.email.sendEmail.mockResolvedValue({ success: true, emailId: "email-a" });

    await c.service.send("tenant-a", "quotation-a", "version-a", actor);

    const sent = c.email.sendEmail.mock.calls[0][0];
    expect(sent.templateData.message).not.toContain("Título mutable");
    expect(c.tx.customQuotationVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ customQuotation: { select: { quotationNumber: true, status: true } } }),
    }));
  });
});

function context() {
  const tx = {
    $executeRaw: jest.fn(), $queryRaw: jest.fn(),
    customQuotation: {}, customQuotationVersion: { findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Costa_Rica" }) },
  } as any;
  const prisma = { $transaction: jest.fn(async (work: (value: typeof tx) => Promise<unknown>) => work(tx)) };
  const documents = { findLatest: jest.fn(), download: jest.fn() };
  const access = { issue: jest.fn(), revoke: jest.fn() };
  const email = { sendEmail: jest.fn() };
  const tenants = { getTenantConfig: jest.fn().mockResolvedValue({ subdomain: "acme" }) };
  const config = { get: jest.fn((key: string) => key === "PUBLIC_APP_BASE_URL" ? "https://app.example.com" : "") };
  return { tx, documents, access, email, tenants, config, service: new CustomQuotationDeliveryService(prisma as never, documents as never, access as never, email as never, tenants as never, config as never, new CustomQuotationDeliveryEmailMapper()) };
}

function version(overrides: Record<string, unknown> = {}) {
  return {
    id: "version-a", status: "ISSUED", currency: "USD", finalSellingPrice: "1450.12345", quotationValidUntil: new Date("2099-12-31T12:00:00.000Z"),
    recipientFullName: "Ana Cliente", recipientEmail: " Ana@Example.com ", recipientPhone: "+506 8888-8888", recipientCompanyName: null,
    title: "Propuesta congelada",
    customQuotation: { quotationNumber: "CQ-2026-000001", title: "Título mutable", status: "ISSUED" },
    ...overrides,
  };
}

function document() {
  return { id: "document-a", ownerType: "CUSTOM_QUOTATION_VERSION", ownerId: "version-a", fileName: "propuesta-comercial.pdf", mimeType: "application/pdf" };
}

function noLifecycleOrDownstreamSideEffects(c: ReturnType<typeof context>) {
  expect(c.tx.customQuotation.updateMany).toBeUndefined();
  expect(c.tx.salesOrder).toBeUndefined();
  expect(c.tx.billingDocument).toBeUndefined();
}
