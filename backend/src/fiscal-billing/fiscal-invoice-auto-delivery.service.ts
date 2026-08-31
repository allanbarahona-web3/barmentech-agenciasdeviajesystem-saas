import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { isEmail } from "class-validator";
import { randomUUID } from "node:crypto";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { FiscalArtifactReadService } from "./fiscal-artifact-read.service";
import { FiscalInvoicePdfService } from "./fiscal-invoice-pdf.service";
import { BillingDocumentService } from "./billing-document.service";
import {
  FISCAL_ACCEPTED_FANOUT_AGGREGATE_TYPE,
  FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_TYPE,
  FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_VERSION,
  FISCAL_INVOICE_MANUAL_RESEND_REQUESTED_EVENT_TYPE,
  FISCAL_INVOICE_MANUAL_RESEND_REQUESTED_EVENT_VERSION,
  fiscalInvoiceManualResendDeduplicationKey,
} from "./jobs/fiscal-accepted-fanout.constants";
import {
  FISCAL_INVOICE_AUTO_DELIVERY_LEASE_MS,
  FISCAL_INVOICE_AUTO_DELIVERY_RETRY_BASE_MS,
  FISCAL_INVOICE_AUTO_DELIVERY_RETRY_MAX_MS,
} from "./jobs/fiscal-invoice-auto-delivery.constants";

const DELIVERY_ARTIFACT_TYPES = ["INTERNAL_PDF", "SIGNED_FISCAL_XML", "TAX_AUTHORITY_RESPONSE_XML"] as const;
const REQUIRED_ARTIFACT_TYPES = DELIVERY_ARTIFACT_TYPES.filter((type) => type !== "INTERNAL_PDF");
type DeliveryArtifactType = (typeof DELIVERY_ARTIFACT_TYPES)[number];
interface ResolvedArtifact { type: DeliveryArtifactType; version: number; }
const SYSTEM_ACTOR_ID = "SYSTEM";
const SYSTEM_ACTOR_NAME = "Fiscal invoice automatic delivery";
type DeliveryMode = "INITIAL_AUTOMATIC" | "MANUAL_RESEND";
const WORKER_FAILED = "FISCAL_INVOICE_AUTO_DELIVERY_WORKER_FAILED";

export const FISCAL_INVOICE_AUTO_DELIVERY_ERRORS = {
  CLAIM_INVALID: "FISCAL_INVOICE_AUTO_DELIVERY_CLAIM_INVALID",
  CHILD_INVALID: "FISCAL_INVOICE_AUTO_DELIVERY_CHILD_INVALID",
  DOCUMENT_INELIGIBLE: "FISCAL_INVOICE_AUTO_DELIVERY_DOCUMENT_INELIGIBLE",
  RECIPIENT_INVALID: "FISCAL_INVOICE_AUTO_DELIVERY_RECIPIENT_INVALID",
  ARTIFACT_NOT_READY: "FISCAL_INVOICE_AUTO_DELIVERY_ARTIFACT_NOT_READY",
  ARTIFACT_FAILED: "FISCAL_INVOICE_AUTO_DELIVERY_ARTIFACT_FAILED",
  ARTIFACT_INVALID: "FISCAL_INVOICE_AUTO_DELIVERY_ARTIFACT_INVALID",
  PDF_FAILED: "FISCAL_INVOICE_AUTO_DELIVERY_PDF_FAILED",
  EMAIL_FAILED: "FISCAL_INVOICE_AUTO_DELIVERY_EMAIL_FAILED",
} as const;

export interface ClaimedFiscalInvoiceAutoDelivery {
  tenantId: string;
  billingOutboxEventId: string;
  lockOwner: string;
}
interface Payload { tenantId: string; billingDocumentId: string; eventVersion: 1; }
interface ManualPayload extends Payload { requestId: string; to: string; cc: string[]; requestedByUserId: string; }
interface Prepared {
  claim: ClaimedFiscalInvoiceAutoDelivery;
  payload: Payload;
  causationId: string | null;
  recipient: string;
  receiverName: string;
  fiscalNumber: string;
  idempotencyKey: string;
  mode: DeliveryMode;
  cc: string[];
  requestId: string | null;
  actorUserId: string;
}

export interface ManualInvoiceResendRequest {
  tenantId: string; billingDocumentId: string; requestedByUserId: string; to?: string; cc?: string[];
}

export class FiscalInvoiceAutoDeliveryError extends Error {
  constructor(readonly code: string, readonly retryable: boolean) { super(code); this.name = "FiscalInvoiceAutoDeliveryError"; }
}

@Injectable()
export class FiscalInvoiceAutoDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: FiscalInvoicePdfService,
    private readonly artifacts: FiscalArtifactReadService,
    private readonly email: EmailService,
    private readonly documents: BillingDocumentService,
  ) {}

  async requestManualResend(input: ManualInvoiceResendRequest): Promise<{ queued: true; requestId: string }> {
    const invoice = await this.documents.getAcceptedInvoice(input.tenantId, input.billingDocumentId);
    const recipient = normalizeEmail(input.to) || normalizeEmail(invoice.receiver.email);
    if (!recipient || !isEmail(recipient)) throw requestError("FISCAL_INVOICE_MANUAL_RESEND_RECIPIENT_INVALID", HttpStatus.BAD_REQUEST);
    const cc = normalizeCc(input.cc, recipient);
    const current = await this.artifacts.list(input.tenantId, input.billingDocumentId);
    resolveLatestAvailableArtifacts(current, REQUIRED_ARTIFACT_TYPES, true);
    await this.pdf.generateAndPersist(input.tenantId, input.billingDocumentId);
    const ready = await this.artifacts.list(input.tenantId, input.billingDocumentId);
    resolveLatestAvailableArtifacts(ready, DELIVERY_ARTIFACT_TYPES, true);
    const requestId = randomUUID();
    const payload: ManualPayload = { tenantId: input.tenantId, billingDocumentId: input.billingDocumentId, requestId, to: recipient, cc, requestedByUserId: input.requestedByUserId, eventVersion: 1 };
    await this.prisma.billingOutboxEvent.create({ data: {
      tenantId: input.tenantId,
      eventType: FISCAL_INVOICE_MANUAL_RESEND_REQUESTED_EVENT_TYPE,
      eventVersion: FISCAL_INVOICE_MANUAL_RESEND_REQUESTED_EVENT_VERSION,
      aggregateType: FISCAL_ACCEPTED_FANOUT_AGGREGATE_TYPE,
      aggregateId: input.billingDocumentId,
      correlationId: requestId,
      deduplicationKey: fiscalInvoiceManualResendDeduplicationKey(input.billingDocumentId, requestId),
      payload: payload as unknown as Prisma.InputJsonObject,
    } });
    return { queued: true, requestId };
  }

  async processClaimedDelivery(claim: ClaimedFiscalInvoiceAutoDelivery): Promise<void> {
    const prepared = await this.prepare(claim);
    try {
      await this.pdf.generateAndPersist(claim.tenantId, prepared.payload.billingDocumentId);
    } catch (error) {
      throw classifyExternal(error, FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.PDF_FAILED);
    }

    const resolvedArtifacts = await this.resolveLatestAvailableArtifacts(claim.tenantId, prepared.payload.billingDocumentId);
    const attachments = await Promise.all(resolvedArtifacts.map(async ({ type, version }) => {
      try {
        const artifact = await this.artifacts.download(claim.tenantId, prepared.payload.billingDocumentId, type, String(version));
        return { filename: artifact.filename, content: artifact.bytes.toString("base64"), contentType: artifact.mimeType };
      } catch (error) {
        throw classifyExternal(error, FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.ARTIFACT_INVALID);
      }
    }));

    await this.revalidateBeforeDelivery(prepared, resolvedArtifacts);
    const result = await this.email.sendEmail({
      tenantId: claim.tenantId,
      to: prepared.recipient,
      ...(prepared.cc.length ? { cc: prepared.cc } : {}),
      subject: `Factura electrónica ${prepared.fiscalNumber}`,
      template: "business-document-attachment",
      templateData: {
        recipientName: prepared.receiverName,
        documentLabel: "Factura electrónica",
        documentNumber: prepared.fiscalNumber,
        message: prepared.mode === "MANUAL_RESEND" ? "Adjuntamos nuevamente su factura electrónica y los documentos fiscales asociados." : "Adjuntamos su factura electrónica y los documentos fiscales asociados.",
        attachmentSummary: "La factura, el XML firmado y la respuesta de la autoridad tributaria se encuentran adjuntos.",
      },
      attachments,
      idempotencyKey: prepared.idempotencyKey,
    });
    if (!result.success) throw retryable(FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.EMAIL_FAILED);
    await this.complete(prepared, result.emailId ?? null);
  }

  async failClaim(claim: ClaimedFiscalInvoiceAutoDelivery, errorCode: string): Promise<void> {
    await this.finalizeFailure(claim, safeCode(errorCode));
  }

  async releaseClaimAfterWorkerFailure(claim: ClaimedFiscalInvoiceAutoDelivery): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const child = await lockOwnedChild(tx, claim, false);
      if (!child) return;
      if (child.attemptCount >= child.maximumAttempts) {
        const identity = auditIdentity(child, claim.tenantId);
        const recipient = identity.recipient ?? await auditRecipient(tx, claim.tenantId, child.aggregateId);
        await createAudit(tx, claim.tenantId, child.aggregateId, identity.mode, "FAILED", recipient, identity.cc, WORKER_FAILED, identity.idempotencyKey, null, identity.requestId, identity.actorUserId);
        await requireOwnedUpdate(tx, claim, { status: "FAILED", lastError: WORKER_FAILED, lockedAt: null, lockedBy: null });
        return;
      }
      const delay = Math.min(FISCAL_INVOICE_AUTO_DELIVERY_RETRY_BASE_MS * 2 ** Math.min(Math.max(child.attemptCount - 1, 0), 30), FISCAL_INVOICE_AUTO_DELIVERY_RETRY_MAX_MS);
      await requireOwnedUpdate(tx, claim, { status: "PENDING", availableAt: new Date(Date.now() + delay), lastError: WORKER_FAILED, lockedAt: null, lockedBy: null });
    });
  }

  private async prepare(claim: ClaimedFiscalInvoiceAutoDelivery): Promise<Prepared> {
    return this.prisma.$transaction(async (tx) => {
      const child = await lockOwnedChild(tx, claim, true);
      if (!child) throw permanent(FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.CLAIM_INVALID);
      const payload = validPayload(child, claim);
      if (!payload) throw permanent(FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.CHILD_INVALID);
      const document = await tx.billingDocument.findUnique({
        where: { id_tenantId: { id: payload.billingDocumentId, tenantId: claim.tenantId } },
        select: { id: true, lifecycleStatus: true, providerStatus: true, taxAuthorityStatus: true, receiverEmail: true, receiverName: true, fiscalNumber: true },
      });
      if (!document || document.lifecycleStatus !== "SUBMITTED" || document.providerStatus !== "PROCESSED" || document.taxAuthorityStatus !== "ACCEPTED" || !nonEmpty(document.receiverName) || !nonEmpty(document.fiscalNumber)) throw permanent(FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.DOCUMENT_INELIGIBLE);
      const recipient = document.receiverEmail?.trim() ?? "";
      const rows = await tx.billingDocumentArtifact.findMany({
        where: { tenantId: claim.tenantId, billingDocumentId: payload.billingDocumentId, artifactType: { in: REQUIRED_ARTIFACT_TYPES } },
        select: { artifactType: true, version: true, status: true }, orderBy: [{ artifactType: "asc" }, { version: "desc" }],
      });
      resolveLatestAvailableArtifacts(rows, REQUIRED_ARTIFACT_TYPES, false);
      const manual = isManualPayload(payload);
      const resolvedRecipient = manual ? payload.to : recipient;
      if (!resolvedRecipient || !isEmail(resolvedRecipient)) throw permanent(FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.RECIPIENT_INVALID);
      return { claim, payload, causationId: child.causationId!, recipient: resolvedRecipient, receiverName: document.receiverName, fiscalNumber: document.fiscalNumber, idempotencyKey: manual ? manualProviderKey(claim.tenantId, payload.billingDocumentId, payload.requestId) : providerKey(claim.tenantId, payload.billingDocumentId), mode: manual ? "MANUAL_RESEND" : "INITIAL_AUTOMATIC", cc: manual ? payload.cc : [], requestId: manual ? payload.requestId : null, actorUserId: manual ? payload.requestedByUserId : SYSTEM_ACTOR_ID };
    });
  }

  private async resolveLatestAvailableArtifacts(tenantId: string, billingDocumentId: string): Promise<ResolvedArtifact[]> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.billingDocumentArtifact.findMany({
        where: { tenantId, billingDocumentId, artifactType: { in: [...DELIVERY_ARTIFACT_TYPES] } },
        select: { artifactType: true, version: true, status: true }, orderBy: [{ artifactType: "asc" }, { version: "desc" }],
      });
      return resolveLatestAvailableArtifacts(rows, DELIVERY_ARTIFACT_TYPES, false);
    });
  }

  private async revalidateBeforeDelivery(prepared: Prepared, resolvedArtifacts: readonly ResolvedArtifact[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const child = await lockOwnedChild(tx, prepared.claim, true);
      const payload = child && validPayload(child, prepared.claim);
      if (!child || !payload || child.causationId !== prepared.causationId || payload.billingDocumentId !== prepared.payload.billingDocumentId) throw permanent(FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.CLAIM_INVALID);
      const document = await tx.billingDocument.findUnique({ where: { id_tenantId: { id: payload.billingDocumentId, tenantId: prepared.claim.tenantId } }, select: { lifecycleStatus: true, providerStatus: true, taxAuthorityStatus: true, receiverEmail: true } });
      if (!document || document.lifecycleStatus !== "SUBMITTED" || document.providerStatus !== "PROCESSED" || document.taxAuthorityStatus !== "ACCEPTED" || (prepared.mode === "INITIAL_AUTOMATIC" && document.receiverEmail?.trim() !== prepared.recipient)) throw permanent(FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.DOCUMENT_INELIGIBLE);
      const rows = await tx.billingDocumentArtifact.findMany({
        where: { tenantId: prepared.claim.tenantId, billingDocumentId: payload.billingDocumentId, OR: resolvedArtifacts.map(({ type, version }) => ({ artifactType: type, version })) },
        select: { artifactType: true, version: true, status: true },
      });
      requireResolvedArtifactReadiness(rows, resolvedArtifacts);
    });
  }

  private async complete(prepared: Prepared, providerMessageId: string | null): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const child = await lockOwnedChild(tx, prepared.claim, true);
      const payload = child && validPayload(child, prepared.claim);
      if (!child || !payload || child.causationId !== prepared.causationId || payload.billingDocumentId !== prepared.payload.billingDocumentId) throw permanent(FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.CLAIM_INVALID);
      await createAudit(tx, prepared.claim.tenantId, payload.billingDocumentId, prepared.mode, "SUCCESS", prepared.recipient, prepared.cc, null, prepared.idempotencyKey, providerMessageId, prepared.requestId, prepared.actorUserId);
      await requireOwnedUpdate(tx, prepared.claim, { status: "PROCESSED", processedAt: new Date(), lastError: null, lockedAt: null, lockedBy: null });
    });
  }

  private async finalizeFailure(claim: ClaimedFiscalInvoiceAutoDelivery, code: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const child = await lockOwnedChild(tx, claim, false);
      if (!child) return;
      const identity = auditIdentity(child, claim.tenantId);
      const recipient = identity.recipient ?? await auditRecipient(tx, claim.tenantId, child.aggregateId);
      await createAudit(tx, claim.tenantId, child.aggregateId, identity.mode, "FAILED", recipient, identity.cc, code, identity.idempotencyKey, null, identity.requestId, identity.actorUserId);
      await requireOwnedUpdate(tx, claim, { status: "FAILED", lastError: code, lockedAt: null, lockedBy: null });
    });
  }
}

async function lockOwnedChild(tx: Prisma.TransactionClient, claim: ClaimedFiscalInvoiceAutoDelivery, requireLease: boolean) {
  const cutoff = new Date(Date.now() - FISCAL_INVOICE_AUTO_DELIVERY_LEASE_MS);
  const rows = requireLease
    ? await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "billing_outbox_events" WHERE "id" = ${claim.billingOutboxEventId} AND "tenantId" = ${claim.tenantId} AND ("eventType" = ${FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_TYPE} OR "eventType" = ${FISCAL_INVOICE_MANUAL_RESEND_REQUESTED_EVENT_TYPE}) AND "eventVersion" = 1 AND "status" = 'PROCESSING' AND "lockedBy" = ${claim.lockOwner} AND "lockedAt" >= ${cutoff} FOR UPDATE`
    : await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "billing_outbox_events" WHERE "id" = ${claim.billingOutboxEventId} AND "tenantId" = ${claim.tenantId} AND ("eventType" = ${FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_TYPE} OR "eventType" = ${FISCAL_INVOICE_MANUAL_RESEND_REQUESTED_EVENT_TYPE}) AND "eventVersion" = 1 AND "status" = 'PROCESSING' AND "lockedBy" = ${claim.lockOwner} FOR UPDATE`;
  if (rows.length !== 1) return null;
  return tx.billingOutboxEvent.findUnique({ where: { id: claim.billingOutboxEventId } });
}
function validPayload(child: { tenantId: string; eventType: string; eventVersion: number; aggregateType: string; aggregateId: string; causationId: string | null; correlationId?: string | null; payload: Prisma.JsonValue }, claim: ClaimedFiscalInvoiceAutoDelivery): Payload | ManualPayload | null {
  if (child.tenantId !== claim.tenantId || child.eventVersion !== 1 || child.aggregateType !== FISCAL_ACCEPTED_FANOUT_AGGREGATE_TYPE || !json(child.payload)) return null;
  const p = child.payload;
  if (p.tenantId !== child.tenantId || p.billingDocumentId !== child.aggregateId || !nonEmpty(p.billingDocumentId) || p.eventVersion !== 1) return null;
  if (child.eventType === FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_TYPE) return Object.keys(p).length === 3 && nonEmpty(child.causationId) ? { tenantId: child.tenantId, billingDocumentId: p.billingDocumentId, eventVersion: 1 } : null;
  if (child.eventType !== FISCAL_INVOICE_MANUAL_RESEND_REQUESTED_EVENT_TYPE || Object.keys(p).length !== 7 || child.causationId !== null || !nonEmpty(p.requestId) || child.correlationId !== p.requestId || !nonEmpty(p.to) || !isEmail(p.to) || !validCc(p.cc, p.to) || !nonEmpty(p.requestedByUserId)) return null;
  return { tenantId: child.tenantId, billingDocumentId: p.billingDocumentId, requestId: p.requestId, to: p.to, cc: p.cc, requestedByUserId: p.requestedByUserId, eventVersion: 1 };
}
async function requireOwnedUpdate(tx: Prisma.TransactionClient, claim: ClaimedFiscalInvoiceAutoDelivery, data: Prisma.BillingOutboxEventUpdateManyMutationInput): Promise<void> {
  const result = await tx.billingOutboxEvent.updateMany({ where: { id: claim.billingOutboxEventId, tenantId: claim.tenantId, status: "PROCESSING", lockedBy: claim.lockOwner }, data });
  if (result.count !== 1) throw retryable(FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.CLAIM_INVALID);
}
async function createAudit(tx: Prisma.TransactionClient, tenantId: string, billingDocumentId: string, mode: DeliveryMode, outcome: "SUCCESS" | "FAILED", recipient: string | null, cc: string[], failureCode: string | null, idempotencyKey: string, providerMessageId: string | null, requestId: string | null, actorUserId: string): Promise<void> {
  await tx.billingAuditLog.create({ data: { tenantId, entityType: "BILLING_DOCUMENT", entityId: billingDocumentId, action: mode, actorUserId, actorName: mode === "INITIAL_AUTOMATIC" ? SYSTEM_ACTOR_NAME : "Manual fiscal invoice resend", afterJson: { deliveryMode: mode, recipient, cc, outcome, providerMessageId, requestId, idempotencyKey, failureCode } } });
}
async function auditRecipient(tx: Prisma.TransactionClient, tenantId: string, billingDocumentId: string): Promise<string | null> {
  const document = await tx.billingDocument.findUnique({ where: { id_tenantId: { id: billingDocumentId, tenantId } }, select: { receiverEmail: true } });
  const recipient = document?.receiverEmail?.trim() ?? "";
  return recipient && isEmail(recipient) ? recipient : null;
}
function classifyExternal(error: unknown, fallback: string): FiscalInvoiceAutoDeliveryError {
  const code = httpCode(error);
  if (code === "FISCAL_ARTIFACT_NOT_AVAILABLE" || code === "FISCAL_ARTIFACT_DOWNLOAD_FAILED" || code === "BILLING_DOCUMENT_INVOICE_PDF_GENERATION_FAILED") return retryable(fallback);
  if (code) return permanent(fallback);
  return retryable(fallback);
}
function httpCode(error: unknown): string | null { if (!(error instanceof HttpException)) return null; const response = error.getResponse(); return typeof response === "object" && response !== null && "code" in response && typeof (response as { code?: unknown }).code === "string" ? (response as { code: string }).code : null; }
function providerKey(tenantId: string, billingDocumentId: string): string { return `fiscal-invoice-auto:${tenantId}:${billingDocumentId}:v1`; }
function manualProviderKey(tenantId: string, billingDocumentId: string, requestId: string): string { return `fiscal-invoice-manual:${tenantId}:${billingDocumentId}:${requestId}:v1`; }
function isManualPayload(payload: Payload | ManualPayload): payload is ManualPayload { return "requestId" in payload; }
function auditIdentity(child: { eventType: string; payload: Prisma.JsonValue }, tenantId: string) {
  if (child.eventType === FISCAL_INVOICE_MANUAL_RESEND_REQUESTED_EVENT_TYPE && json(child.payload)) {
    const p = child.payload;
    if (nonEmpty(p.billingDocumentId) && nonEmpty(p.requestId) && nonEmpty(p.to) && Array.isArray(p.cc) && nonEmpty(p.requestedByUserId)) return { mode: "MANUAL_RESEND" as const, cc: p.cc.filter((value): value is string => typeof value === "string"), requestId: p.requestId, actorUserId: p.requestedByUserId, idempotencyKey: manualProviderKey(tenantId, p.billingDocumentId, p.requestId), recipient: p.to };
  }
  const billingDocumentId = json(child.payload) && nonEmpty(child.payload.billingDocumentId) ? child.payload.billingDocumentId : "invalid";
  return { mode: "INITIAL_AUTOMATIC" as const, cc: [] as string[], requestId: null, actorUserId: SYSTEM_ACTOR_ID, idempotencyKey: providerKey(tenantId, billingDocumentId), recipient: null };
}
function normalizeEmail(value: unknown): string { return typeof value === "string" ? value.trim().toLowerCase() : ""; }
function normalizeCc(value: unknown, recipient: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10) throw requestError("FISCAL_INVOICE_MANUAL_RESEND_CC_INVALID", HttpStatus.BAD_REQUEST);
  const normalized = value.map(normalizeEmail);
  if (normalized.some((email) => !email || !isEmail(email))) throw requestError("FISCAL_INVOICE_MANUAL_RESEND_CC_INVALID", HttpStatus.BAD_REQUEST);
  return [...new Set(normalized)].filter((email) => email !== recipient);
}
function validCc(value: unknown, recipient: string): value is string[] { return Array.isArray(value) && value.length <= 10 && value.every((email) => typeof email === "string" && isEmail(email) && email === email.trim().toLowerCase() && email !== recipient) && new Set(value).size === value.length; }
function resolveLatestAvailableArtifacts(rows: ReadonlyArray<{ artifactType: string; version: number; status: string }>, types: readonly DeliveryArtifactType[], http: boolean): ResolvedArtifact[] {
  const resolved: ResolvedArtifact[] = [];
  for (const type of types) {
    const artifact = rows.filter((row) => row.artifactType === type && row.status === "AVAILABLE").reduce<{ artifactType: string; version: number; status: string } | null>((latest, row) => !latest || row.version > latest.version ? row : latest, null);
    if (!artifact && rows.some((row) => row.artifactType === type && row.status === "FAILED")) { if (http) throw requestError("FISCAL_INVOICE_MANUAL_RESEND_ARTIFACT_FAILED", HttpStatus.CONFLICT); throw permanent(FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.ARTIFACT_FAILED); }
    if (!artifact) { if (http) throw requestError("FISCAL_INVOICE_MANUAL_RESEND_ARTIFACT_NOT_READY", HttpStatus.CONFLICT); throw retryable(FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.ARTIFACT_NOT_READY); }
    resolved.push({ type, version: artifact.version });
  }
  return resolved;
}
function requireResolvedArtifactReadiness(rows: ReadonlyArray<{ artifactType: string; version: number; status: string }>, requirements: readonly ResolvedArtifact[]): void {
  for (const requirement of requirements) {
    const artifact = rows.find((row) => row.artifactType === requirement.type && row.version === requirement.version);
    if (artifact?.status !== "AVAILABLE") throw retryable(FISCAL_INVOICE_AUTO_DELIVERY_ERRORS.ARTIFACT_NOT_READY);
  }
}
function requestError(code: string, status: HttpStatus): HttpException { return new HttpException({ statusCode: status, error: code, code }, status); }
function permanent(code: string): FiscalInvoiceAutoDeliveryError { return new FiscalInvoiceAutoDeliveryError(code, false); }
function retryable(code: string): FiscalInvoiceAutoDeliveryError { return new FiscalInvoiceAutoDeliveryError(code, true); }
function safeCode(code: string): string { return /^[A-Z][A-Z0-9_]{0,99}$/.test(code) ? code : WORKER_FAILED; }
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function json(value: Prisma.JsonValue): value is Prisma.JsonObject { return typeof value === "object" && value !== null && !Array.isArray(value); }
