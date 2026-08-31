import type { EmailService } from "../email/email.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { FiscalArtifactReadService } from "./fiscal-artifact-read.service";
import {
  FISCAL_INVOICE_AUTO_DELIVERY_ERRORS,
  FiscalInvoiceAutoDeliveryError,
  FiscalInvoiceAutoDeliveryService,
} from "./fiscal-invoice-auto-delivery.service";
import type { FiscalInvoicePdfService } from "./fiscal-invoice-pdf.service";
import type { BillingDocumentService } from "./billing-document.service";
import { FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_TYPE, FISCAL_INVOICE_MANUAL_RESEND_REQUESTED_EVENT_TYPE } from "./jobs/fiscal-accepted-fanout.constants";

describe("FiscalInvoiceAutoDeliveryService", () => {
  it("waits without PDF, reads or email until both required XML artifacts are AVAILABLE", async () => {
    const c = context({ artifacts: [{ artifactType: "SIGNED_FISCAL_XML", status: "AVAILABLE" }] });
    await expect(c.service.processClaimedDelivery(claim())).rejects.toMatchObject({ code: FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.ARTIFACT_NOT_READY, retryable: true });
    expect(c.pdf).not.toHaveBeenCalled(); expect(c.download).not.toHaveBeenCalled(); expect(c.send).not.toHaveBeenCalled();
  });

  it("generates/reuses PDF, reads all three verified artifacts and completes only after email success", async () => {
    const c = context();
    await c.service.processClaimedDelivery(claim());
    expect(c.pdf).toHaveBeenCalledWith("tenant-a", "document-a");
    expect(c.download.mock.calls.map((call) => call.slice(2))).toEqual([
      ["INTERNAL_PDF", "1"], ["SIGNED_FISCAL_XML", "1"], ["TAX_AUTHORITY_RESPONSE_XML", "1"],
    ]);
    expect(c.send).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a", to: "receiver@example.com", template: "business-document-attachment",
      idempotencyKey: "fiscal-invoice-auto:tenant-a:document-a:v1",
      attachments: [
        { filename: "INTERNAL_PDF.xml", content: Buffer.from("INTERNAL_PDF").toString("base64"), contentType: "application/pdf" },
        { filename: "SIGNED_FISCAL_XML.xml", content: Buffer.from("SIGNED_FISCAL_XML").toString("base64"), contentType: "application/xml" },
        { filename: "TAX_AUTHORITY_RESPONSE_XML.xml", content: Buffer.from("TAX_AUTHORITY_RESPONSE_XML").toString("base64"), contentType: "application/xml" },
      ],
    }));
    expect(c.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "INITIAL_AUTOMATIC", entityId: "document-a", afterJson: expect.objectContaining({ outcome: "SUCCESS", recipient: "receiver@example.com", providerMessageId: "message-a" }) }) });
    expect(c.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PROCESSED" }) }));
  });

  it("uses only immutable receiverEmail and treats a missing receiver as permanent", async () => {
    const c = context({ document: { receiverEmail: null } });
    await expect(c.service.processClaimedDelivery(claim())).rejects.toEqual(expect.objectContaining({ code: FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.RECIPIENT_INVALID, retryable: false }));
    expect(c.send).not.toHaveBeenCalled(); expect(c.pdf).not.toHaveBeenCalled();
    expect(c.prisma).not.toHaveProperty("client"); expect(c.prisma).not.toHaveProperty("salesOrder");
  });

  it("treats a permanently failed XML as permanent and never emails", async () => {
    const c = context({ artifacts: [{ artifactType: "SIGNED_FISCAL_XML", status: "FAILED" }, { artifactType: "TAX_AUTHORITY_RESPONSE_XML", status: "AVAILABLE" }] });
    await expect(c.service.processClaimedDelivery(claim())).rejects.toEqual(expect.objectContaining({ code: FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.ARTIFACT_FAILED, retryable: false }));
    expect(c.send).not.toHaveBeenCalled();
  });

  it("keeps provider identity stable across retries and does not complete failed email delivery", async () => {
    const first = context({ emailResult: { success: false, error: "native" } });
    const second = context({ emailResult: { success: false, error: "other" } });
    await expect(first.service.processClaimedDelivery(claim())).rejects.toMatchObject({ code: FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.EMAIL_FAILED, retryable: true });
    await expect(second.service.processClaimedDelivery(claim())).rejects.toBeInstanceOf(FiscalInvoiceAutoDeliveryError);
    expect(first.send.mock.calls[0][0].idempotencyKey).toBe(second.send.mock.calls[0][0].idempotencyKey);
    expect(first.update).not.toHaveBeenCalled(); expect(first.audit).not.toHaveBeenCalled();
  });

  it("persists a bounded INITIAL_AUTOMATIC failure audit and fails only its owned claim", async () => {
    const c = context();
    await c.service.failClaim(claim(), FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.RECIPIENT_INVALID);
    expect(c.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "INITIAL_AUTOMATIC", afterJson: expect.objectContaining({ outcome: "FAILED", failureCode: FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.RECIPIENT_INVALID, cc: [] }) }) });
    expect(c.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "child-a", tenantId: "tenant-a", status: "PROCESSING", lockedBy: "owner-a" }, data: expect.objectContaining({ status: "FAILED" }) }));
  });

  it("queues an accepted manual resend with explicit recipient, normalized CC and a fresh identity", async () => {
    const c = context();
    const first = await c.service.requestManualResend({ tenantId: "tenant-a", billingDocumentId: "document-a", requestedByUserId: "user-a", to: " Customer@Example.com ", cc: ["OTHER@example.com", "customer@example.com", "other@example.com"] });
    const second = await c.service.requestManualResend({ tenantId: "tenant-a", billingDocumentId: "document-a", requestedByUserId: "user-a", to: "customer@example.com" });
    expect(first.requestId).not.toBe(second.requestId); expect(first.queued).toBe(true);
    const data = c.createEvent.mock.calls[0][0].data;
    expect(data).toEqual(expect.objectContaining({ eventType: FISCAL_INVOICE_MANUAL_RESEND_REQUESTED_EVENT_TYPE, aggregateId: "document-a", correlationId: first.requestId, deduplicationKey: `billing-document.invoice-manual-resend:document-a:${first.requestId}:v1`, payload: { tenantId: "tenant-a", billingDocumentId: "document-a", requestId: first.requestId, to: "customer@example.com", cc: ["other@example.com"], requestedByUserId: "user-a", eventVersion: 1 } }));
    expect(c.pdf).toHaveBeenCalledTimes(2); expect(c.list).toHaveBeenCalledTimes(4); expect(c.send).not.toHaveBeenCalled();
  });

  it("falls back only to the immutable invoice receiver and rejects invalid recipients", async () => {
    const c = context();
    await c.service.requestManualResend({ tenantId: "tenant-a", billingDocumentId: "document-a", requestedByUserId: "user-a", to: "  " });
    expect(c.createEvent.mock.calls[0][0].data.payload.to).toBe("receiver@example.com");
    await expect(c.service.requestManualResend({ tenantId: "tenant-a", billingDocumentId: "document-a", requestedByUserId: "user-a", to: "bad", cc: ["also-bad"] })).rejects.toBeInstanceOf(Error);
    expect(c.prisma).not.toHaveProperty("client"); expect(c.prisma).not.toHaveProperty("salesOrder");
  });

  it("rejects an ineligible invoice before PDF, artifacts or queue persistence", async () => {
    const c = context(); c.getAcceptedInvoice.mockRejectedValueOnce(new Error("BILLING_DOCUMENT_INVOICE_NOT_AVAILABLE"));
    await expect(c.service.requestManualResend({ tenantId: "tenant-a", billingDocumentId: "document-a", requestedByUserId: "user-a", to: "to@example.com" })).rejects.toThrow("BILLING_DOCUMENT_INVOICE_NOT_AVAILABLE");
    expect(c.list).not.toHaveBeenCalled(); expect(c.pdf).not.toHaveBeenCalled(); expect(c.createEvent).not.toHaveBeenCalled();
  });

  it("processes a manual request through the same attachments with request-stable idempotency and MANUAL_RESEND audit", async () => {
    const requestId = "request-a";
    const c = context({ child: manualChild(requestId) });
    await c.service.processClaimedDelivery(claim());
    expect(c.send).toHaveBeenCalledWith(expect.objectContaining({ to: "manual@example.com", cc: ["copy@example.com"], idempotencyKey: `fiscal-invoice-manual:tenant-a:document-a:${requestId}:v1`, attachments: expect.arrayContaining([expect.objectContaining({ filename: "INTERNAL_PDF.xml" }), expect.objectContaining({ filename: "SIGNED_FISCAL_XML.xml" }), expect.objectContaining({ filename: "TAX_AUTHORITY_RESPONSE_XML.xml" })]) }));
    expect(c.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "MANUAL_RESEND", actorUserId: "user-a", afterJson: expect.objectContaining({ deliveryMode: "MANUAL_RESEND", recipient: "manual@example.com", cc: ["copy@example.com"], requestId, outcome: "SUCCESS" }) }) });
    const retry = context({ child: manualChild(requestId) }); await retry.service.processClaimedDelivery(claim());
    expect(retry.send.mock.calls[0][0].idempotencyKey).toBe(c.send.mock.calls[0][0].idempotencyKey);
    expect(c.send.mock.calls[0][0].idempotencyKey).not.toBe("fiscal-invoice-auto:tenant-a:document-a:v1");
  });
});

function context(overrides: { artifacts?: Array<{ artifactType: string; status: string }>; document?: Record<string, unknown>; emailResult?: Record<string, unknown>; child?: Record<string, unknown> } = {}) {
  const child = overrides.child ?? { id: "child-a", tenantId: "tenant-a", eventType: FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_TYPE, eventVersion: 1, aggregateType: "BillingDocument", aggregateId: "document-a", causationId: "parent-a", correlationId: null, payload: { tenantId: "tenant-a", billingDocumentId: "document-a", eventVersion: 1 }, attemptCount: 1, maximumAttempts: 5 };
  const document = { id: "document-a", lifecycleStatus: "SUBMITTED", providerStatus: "PROCESSED", taxAuthorityStatus: "ACCEPTED", receiverEmail: "receiver@example.com", receiverName: "Receiver", fiscalNumber: "00100001010000000042", ...overrides.document };
  const findUnique = jest.fn(async (args: { where: Record<string, unknown> }) => "id" in args.where ? child : document);
  const update = jest.fn().mockResolvedValue({ count: 1 });
  const audit = jest.fn().mockResolvedValue({ id: "audit-a" });
  const tx = { $queryRaw: jest.fn().mockResolvedValue([{ id: "child-a" }]), billingOutboxEvent: { findUnique, updateMany: update }, billingDocument: { findUnique }, billingDocumentArtifact: { findMany: jest.fn().mockResolvedValue(overrides.artifacts ?? [{ artifactType: "SIGNED_FISCAL_XML", status: "AVAILABLE" }, { artifactType: "TAX_AUTHORITY_RESPONSE_XML", status: "AVAILABLE" }]), count: jest.fn().mockResolvedValue(3) }, billingAuditLog: { create: audit } };
  const createEvent = jest.fn().mockResolvedValue({ id: "manual-event" });
  const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)), billingOutboxEvent: { create: createEvent } } as unknown as PrismaService;
  const pdf = jest.fn().mockResolvedValue({ status: "AVAILABLE" });
  const download = jest.fn(async (_tenant: string, _document: string, type: string) => ({ bytes: Buffer.from(type), mimeType: type === "INTERNAL_PDF" ? "application/pdf" : "application/xml", filename: `${type}.xml` }));
  const send = jest.fn().mockResolvedValue(overrides.emailResult ?? { success: true, emailId: "message-a" });
  const list = jest.fn().mockResolvedValue([{ artifactType: "INTERNAL_PDF", status: "AVAILABLE" }, { artifactType: "SIGNED_FISCAL_XML", status: "AVAILABLE" }, { artifactType: "TAX_AUTHORITY_RESPONSE_XML", status: "AVAILABLE" }]);
  const getAcceptedInvoice = jest.fn().mockResolvedValue({ receiver: { email: "receiver@example.com" } });
  return { service: new FiscalInvoiceAutoDeliveryService(prisma, { generateAndPersist: pdf } as unknown as FiscalInvoicePdfService, { download, list } as unknown as FiscalArtifactReadService, { sendEmail: send } as unknown as EmailService, { getAcceptedInvoice } as unknown as BillingDocumentService), prisma, tx, pdf, download, list, send, audit, update, createEvent, getAcceptedInvoice };
}
function claim() { return { tenantId: "tenant-a", billingOutboxEventId: "child-a", lockOwner: "owner-a" }; }
function manualChild(requestId: string) { return { id: "child-a", tenantId: "tenant-a", eventType: FISCAL_INVOICE_MANUAL_RESEND_REQUESTED_EVENT_TYPE, eventVersion: 1, aggregateType: "BillingDocument", aggregateId: "document-a", causationId: null, correlationId: requestId, payload: { tenantId: "tenant-a", billingDocumentId: "document-a", requestId, to: "manual@example.com", cc: ["copy@example.com"], requestedByUserId: "user-a", eventVersion: 1 }, attemptCount: 1, maximumAttempts: 5 }; }
