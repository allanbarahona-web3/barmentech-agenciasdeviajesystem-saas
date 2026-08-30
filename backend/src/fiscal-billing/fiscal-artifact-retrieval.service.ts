import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { IMMUTABLE_BILLING_ARTIFACT_STORAGE_PORT, type ImmutableBillingArtifactStorageMetadata, type ImmutableBillingArtifactStoragePort, ImmutableBillingArtifactStorageError } from '../storage/immutable-billing-artifact-storage.port';
import { BILLING_DOCUMENT_FISCAL_ACCEPTED_EVENT_TYPE, BILLING_DOCUMENT_FISCAL_ACCEPTED_EVENT_VERSION, billingDocumentFiscalAcceptedDeduplicationKey } from './billing-document-fiscal-accepted-outbox';
import { FiscalXmlIdentityValidationError, validateFiscalXmlIdentity } from './fiscal-xml-identity.validator';
import { FISCAL_ACCEPTED_FANOUT_AGGREGATE_TYPE, FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_TYPE, FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_VERSION, fiscalInvoiceAutoDeliveryDeduplicationKey } from './jobs/fiscal-accepted-fanout.constants';
import { BILLING_DOCUMENT_ARTIFACT_RETRIEVAL_REQUESTED_EVENT_TYPE, BILLING_DOCUMENT_ARTIFACT_RETRIEVAL_REQUESTED_EVENT_VERSION, FISCAL_TERMINAL_ARTIFACT_FANOUT_AGGREGATE_TYPE, FISCAL_TERMINAL_ARTIFACT_VERSION, type FiscalTerminalArtifactType } from './jobs/fiscal-terminal-artifact-fanout.constants';
import { FISCAL_ARTIFACT_RETRIEVAL_RETRY_BASE_MS, FISCAL_ARTIFACT_RETRIEVAL_RETRY_MAX_MS } from './jobs/fiscal-artifact-retrieval.constants';
import { FISCAL_ARTIFACT_RETRIEVAL_PORT, FiscalArtifactRetrievalError, type FiscalArtifactRetrievalPort } from './providers/fiscal-artifact-retrieval.provider';

const LEASE_MS = 60_000;
const AVAILABLE_ERROR = 'FISCAL_ARTIFACT_RETRIEVAL_ARTIFACT_AVAILABLE_CONFLICT';
const CLAIM_ERROR = 'FISCAL_ARTIFACT_RETRIEVAL_CLAIM_INVALID';
const CHILD_ERROR = 'FISCAL_ARTIFACT_RETRIEVAL_CHILD_INVALID';
const DOCUMENT_ERROR = 'FISCAL_ARTIFACT_RETRIEVAL_DOCUMENT_INVALID';
const ARTIFACT_ERROR = 'FISCAL_ARTIFACT_RETRIEVAL_ARTIFACT_INVALID';
const VALIDATION_ERROR = 'FISCAL_ARTIFACT_RETRIEVAL_IDENTITY_INVALID';
const STORAGE_ERROR = 'FISCAL_ARTIFACT_RETRIEVAL_STORAGE_CONFLICT';
const DELIVERY_ERROR = 'FISCAL_ARTIFACT_RETRIEVAL_DELIVERY_CONFLICT';
const RETRYABLE_ERROR = 'FISCAL_ARTIFACT_RETRIEVAL_RETRYABLE_FAILURE';
export const FISCAL_ARTIFACT_RETRIEVAL_ATTEMPTS_EXHAUSTED = 'FISCAL_ARTIFACT_RETRIEVAL_ATTEMPTS_EXHAUSTED';

export interface ClaimedFiscalArtifactRetrieval {
  tenantId: string;
  outboxEventId: string;
  lockOwner: string;
}

interface Payload { tenantId: string; billingDocumentId: string; artifactType: FiscalTerminalArtifactType; artifactVersion: number; eventVersion: number; }
interface ArtifactRow { id: string; tenantId: string; billingDocumentId: string; artifactType: string; version: number; status: string; storageProvider: string | null; storageKey: string | null; sha256: string | null; byteSize: bigint | null; mimeType: string | null; sourceEtag: string | null; retrievedAt: Date | null; storedAt: Date | null; terminalErrorCode: string | null; failedAt: Date | null; }
interface ChildSnapshot { id: string; tenantId: string; eventType: string; eventVersion: number; aggregateType: string; aggregateId: string; causationId: string; payload: Payload; }
interface Prepared { claim: ClaimedFiscalArtifactRetrieval; child: ChildSnapshot; payload: Payload; artifact: ArtifactRow; document: { id: string; tenantId: string; providerDocumentId: string; providerEnvironment: 'sandbox' | 'production'; haciendaKey: string; fiscalNumber: string; documentTypeCode: '01' | '04'; taxAuthorityStatus: 'ACCEPTED' | 'REJECTED'; taxAuthorityFinalizedAt: Date; }; }
interface CompletionMetadata extends ImmutableBillingArtifactStorageMetadata { sourceEtag: string | null; retrievedAt: Date; }

export class FiscalArtifactRetrievalServiceError extends Error {
  constructor(readonly code: string, readonly retryable: boolean) { super(code); this.name = 'FiscalArtifactRetrievalServiceError'; }
}

@Injectable()
export class FiscalArtifactRetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FISCAL_ARTIFACT_RETRIEVAL_PORT) private readonly retrieval: FiscalArtifactRetrievalPort,
    @Inject(IMMUTABLE_BILLING_ARTIFACT_STORAGE_PORT) private readonly storage: ImmutableBillingArtifactStoragePort,
  ) {}

  async processClaimedArtifact(claim: ClaimedFiscalArtifactRetrieval): Promise<void> {
    let prepared: Prepared | undefined;
    try {
      prepared = await this.prepare(claim);
      if (prepared.artifact.status === 'AVAILABLE') {
        await this.complete(prepared, null);
        return;
      }
      if (prepared.artifact.status === 'FAILED') throw new FiscalArtifactRetrievalServiceError(ARTIFACT_ERROR, false);
      const retrieved = await this.retrieval.retrieveFiscalArtifact({ providerDocumentId: prepared.document.providerDocumentId, artifactType: prepared.payload.artifactType, providerEnvironment: prepared.document.providerEnvironment });
      validateFiscalXmlIdentity({ artifactType: prepared.payload.artifactType, documentTypeCode: prepared.document.documentTypeCode, fiscalNumber: prepared.document.fiscalNumber, haciendaKey: prepared.document.haciendaKey, taxAuthorityStatus: prepared.document.taxAuthorityStatus, bytes: retrieved.bytes, normalizedMimeType: retrieved.normalizedMimeType });
      const sha256 = createHash('sha256').update(retrieved.bytes).digest('hex');
      const stored = await this.storage.storeImmutable({ tenantId: prepared.payload.tenantId, billingDocumentId: prepared.payload.billingDocumentId, artifactType: prepared.payload.artifactType, artifactVersion: prepared.payload.artifactVersion, expectedSha256: sha256, mimeType: retrieved.normalizedMimeType, bytes: retrieved.bytes });
      const metadata: CompletionMetadata = { ...stored, sourceEtag: retrieved.sourceEtag, retrievedAt: retrieved.retrievedAt };
      if (!exactMetadata(metadata, sha256, retrieved.bytes, retrieved.normalizedMimeType)) throw new FiscalArtifactRetrievalServiceError(STORAGE_ERROR, false);
      await this.complete(prepared, metadata);
    } catch (error) {
      const normalized = classify(error);
      if (normalized.code === CLAIM_ERROR) throw normalized;
      if (normalized.retryable) throw normalized;
      try { await this.failPermanently(claim, prepared?.artifact.id, normalized.code); }
      catch { throw new FiscalArtifactRetrievalServiceError(RETRYABLE_ERROR, true); }
      throw normalized;
    }
  }

  async finalizeExhaustedDelivery(claim: ClaimedFiscalArtifactRetrieval, exhaustionCode: string): Promise<void> {
    const code = exhaustionCode === FISCAL_ARTIFACT_RETRIEVAL_ATTEMPTS_EXHAUSTED
      ? exhaustionCode
      : FISCAL_ARTIFACT_RETRIEVAL_ATTEMPTS_EXHAUSTED;
    await this.prisma.$transaction(async (tx) => {
      const locked = await lockOwnedChildForFinalization(tx, claim);
      if (!locked) return;
      const child = await tx.billingOutboxEvent.findUnique({ where: { id: claim.outboxEventId } });
      const payload = child && validPayload(child, claim);
      if (!child || !payload || !validAttemptLifecycle(child)) return;
      const artifact = await lockArtifact(tx, payload);
      if (!artifact || !exactArtifactIdentity(artifact, payload)) return;
      const now = new Date();

      if (isAvailable(artifact)) {
        await requireOwnedUpdate(tx, claim, { status: 'PROCESSED', processedAt: now, lastError: null, lockedAt: null, lockedBy: null });
        return;
      }
      if (isFailed(artifact)) {
        await requireOwnedUpdate(tx, claim, { status: 'FAILED', lastError: artifact.terminalErrorCode, lockedAt: null, lockedBy: null });
        return;
      }
      if (!isPending(artifact)) return;

      if (child.attemptCount < child.maximumAttempts) {
        const backoff = boundedRetryDelay(child.attemptCount);
        await requireOwnedUpdate(tx, claim, { status: 'PENDING', availableAt: new Date(now.getTime() + backoff), lastError: code, lockedAt: null, lockedBy: null });
        return;
      }

      const failed = await tx.$executeRaw`UPDATE "billing_document_artifacts" SET "status" = 'FAILED', "terminalErrorCode" = ${code}, "failedAt" = ${now}, "updatedAt" = ${now} WHERE "id" = ${artifact.id} AND "tenantId" = ${claim.tenantId} AND "status" = 'PENDING'`;
      if (failed !== 1) throw new FiscalArtifactRetrievalServiceError(RETRYABLE_ERROR, true);
      await requireOwnedUpdate(tx, claim, { status: 'FAILED', lastError: code, lockedAt: null, lockedBy: null });
    });
  }

  private async prepare(claim: ClaimedFiscalArtifactRetrieval): Promise<Prepared> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockOwnedChild(tx, claim);
        const child = await tx.billingOutboxEvent.findUnique({ where: { id: claim.outboxEventId } });
        const payload = child && validPayload(child, claim);
        if (!child || !payload) throw permanent(CHILD_ERROR);
        const document = await tx.billingDocument.findUnique({ where: { id_tenantId: { id: payload.billingDocumentId, tenantId: claim.tenantId } }, select: { id: true, tenantId: true, providerDocumentId: true, providerEnvironment: true, haciendaKey: true, fiscalNumber: true, documentTypeCode: true, taxAuthorityStatus: true, taxAuthorityFinalizedAt: true } });
        if (!document || !validDocument(document)) throw permanent(DOCUMENT_ERROR);
        const artifact = await lockArtifact(tx, payload);
        if (!artifact || !exactArtifactIdentity(artifact, payload) || (!isPending(artifact) && !isAvailable(artifact) && !isFailed(artifact))) throw permanent(ARTIFACT_ERROR);
        return { claim, child: { id: child.id, tenantId: child.tenantId, eventType: child.eventType, eventVersion: child.eventVersion, aggregateType: child.aggregateType, aggregateId: child.aggregateId, causationId: child.causationId!, payload }, payload, artifact, document };
      });
    } catch (error) { throw classify(error); }
  }

  private async complete(prepared: Prepared, metadata: CompletionMetadata | null): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await lockOwnedChild(tx, prepared.claim);
        const child = await tx.billingOutboxEvent.findUnique({ where: { id: prepared.claim.outboxEventId } });
        if (!child || !samePreparedChild(child, prepared)) throw permanent(CLAIM_ERROR);
        const artifact = await lockArtifact(tx, prepared.payload);
        if (!artifact || !exactArtifactIdentity(artifact, prepared.payload)) throw permanent(ARTIFACT_ERROR);
        if (metadata === null) {
          if (!isAvailable(artifact)) throw permanent(AVAILABLE_ERROR);
        } else if (isAvailable(artifact)) {
          if (!sameMetadata(artifact, metadata)) throw permanent(AVAILABLE_ERROR);
        } else if (isPending(artifact)) {
          const updated = await tx.$executeRaw`UPDATE "billing_document_artifacts" SET "status" = 'AVAILABLE', "storageProvider" = ${metadata.storageProvider}, "storageKey" = ${metadata.storageKey}, "sha256" = ${metadata.sha256}, "byteSize" = ${metadata.byteSize}, "mimeType" = ${metadata.mimeType}, "sourceEtag" = ${metadata.sourceEtag}, "retrievedAt" = ${metadata.retrievedAt}, "storedAt" = ${metadata.storedAt}, "updatedAt" = ${new Date()} WHERE "id" = ${artifact.id} AND "tenantId" = ${prepared.claim.tenantId} AND "status" = 'PENDING'`;
          if (updated !== 1) throw permanent(ARTIFACT_ERROR);
        } else throw permanent(ARTIFACT_ERROR);
        if (prepared.document.taxAuthorityStatus === 'ACCEPTED') {
          await ensureAutomaticDeliveryWhenReady(tx, prepared);
        }
        const completed = await tx.billingOutboxEvent.updateMany({ where: ownedWhere(prepared.claim), data: { status: 'PROCESSED', processedAt: new Date(), lastError: null, lockedAt: null, lockedBy: null } });
        if (completed.count !== 1) throw permanent(CLAIM_ERROR);
      });
    } catch (error) { throw classify(error); }
  }

  private async failPermanently(claim: ClaimedFiscalArtifactRetrieval, artifactId: string | undefined, code: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      try { await lockOwnedChild(tx, claim); } catch { return; }
      if (artifactId) {
        const artifacts = await tx.$queryRaw<ArtifactRow[]>`SELECT "id", "tenantId", "billingDocumentId", "artifactType", "version", "status", "storageProvider", "storageKey", "sha256", "byteSize", "mimeType", "sourceEtag", "retrievedAt", "storedAt", "terminalErrorCode", "failedAt" FROM "billing_document_artifacts" WHERE "id" = ${artifactId} AND "tenantId" = ${claim.tenantId} FOR UPDATE`;
        if (artifacts.length === 1 && isPending(artifacts[0])) await tx.$executeRaw`UPDATE "billing_document_artifacts" SET "status" = 'FAILED', "terminalErrorCode" = ${safeCode(code)}, "failedAt" = ${new Date()}, "updatedAt" = ${new Date()} WHERE "id" = ${artifactId} AND "tenantId" = ${claim.tenantId} AND "status" = 'PENDING'`;
      }
      await tx.billingOutboxEvent.updateMany({ where: ownedWhere(claim), data: { status: 'FAILED', lastError: safeCode(code), lockedAt: null, lockedBy: null } });
    });
  }
}

async function ensureAutomaticDeliveryWhenReady(
  tx: Prisma.TransactionClient,
  prepared: Prepared,
): Promise<void> {
  const acceptedDeduplicationKey = billingDocumentFiscalAcceptedDeduplicationKey(
    prepared.payload.billingDocumentId,
  );
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "billing_outbox_events"
    WHERE "tenantId" = ${prepared.payload.tenantId}
      AND "deduplicationKey" = ${acceptedDeduplicationKey}
      AND "eventType" = ${BILLING_DOCUMENT_FISCAL_ACCEPTED_EVENT_TYPE}
      AND "eventVersion" = ${BILLING_DOCUMENT_FISCAL_ACCEPTED_EVENT_VERSION}
    FOR UPDATE
  `;
  if (locked.length !== 1) throw permanent(DELIVERY_ERROR);
  const acceptedParent = await tx.billingOutboxEvent.findUnique({
    where: {
      tenantId_deduplicationKey: {
        tenantId: prepared.payload.tenantId,
        deduplicationKey: acceptedDeduplicationKey,
      },
    },
  });
  const payload = {
    tenantId: prepared.payload.tenantId,
    billingDocumentId: prepared.payload.billingDocumentId,
    eventVersion: FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_VERSION,
  };
  if (!acceptedParent || !isExactAcceptedParent(acceptedParent, payload, acceptedDeduplicationKey)) {
    throw permanent(DELIVERY_ERROR);
  }

  const available = await tx.billingDocumentArtifact.count({
    where: {
      tenantId: prepared.payload.tenantId,
      billingDocumentId: prepared.payload.billingDocumentId,
      artifactType: { in: ['SIGNED_FISCAL_XML', 'TAX_AUTHORITY_RESPONSE_XML'] },
      version: FISCAL_TERMINAL_ARTIFACT_VERSION,
      status: 'AVAILABLE',
    },
  });
  if (available !== 2) return;

  const deliveryDeduplicationKey = fiscalInvoiceAutoDeliveryDeduplicationKey(
    prepared.payload.billingDocumentId,
  );
  await tx.billingOutboxEvent.createMany({
    data: {
      tenantId: prepared.payload.tenantId,
      eventType: FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_TYPE,
      eventVersion: FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_VERSION,
      aggregateType: FISCAL_ACCEPTED_FANOUT_AGGREGATE_TYPE,
      aggregateId: prepared.payload.billingDocumentId,
      causationId: acceptedParent.id,
      deduplicationKey: deliveryDeduplicationKey,
      payload,
    },
    skipDuplicates: true,
  });
  const delivery = await tx.billingOutboxEvent.findUnique({
    where: {
      tenantId_deduplicationKey: {
        tenantId: prepared.payload.tenantId,
        deduplicationKey: deliveryDeduplicationKey,
      },
    },
  });
  if (!delivery || !isExactDeliveryChild(delivery, acceptedParent.id, payload, deliveryDeduplicationKey)) {
    throw permanent(DELIVERY_ERROR);
  }
}

function isExactAcceptedParent(
  event: { tenantId: string; eventType: string; eventVersion: number; aggregateType: string; aggregateId: string; deduplicationKey: string | null; payload: Prisma.JsonValue },
  payload: { tenantId: string; billingDocumentId: string; eventVersion: number },
  deduplicationKey: string,
): boolean {
  return event.tenantId === payload.tenantId &&
    event.eventType === BILLING_DOCUMENT_FISCAL_ACCEPTED_EVENT_TYPE &&
    event.eventVersion === BILLING_DOCUMENT_FISCAL_ACCEPTED_EVENT_VERSION &&
    event.aggregateType === FISCAL_ACCEPTED_FANOUT_AGGREGATE_TYPE &&
    event.aggregateId === payload.billingDocumentId &&
    event.deduplicationKey === deduplicationKey &&
    exactDeliveryPayload(event.payload, payload);
}

function isExactDeliveryChild(
  event: { tenantId: string; eventType: string; eventVersion: number; aggregateType: string; aggregateId: string; causationId: string | null; deduplicationKey: string | null; payload: Prisma.JsonValue },
  causationId: string,
  payload: { tenantId: string; billingDocumentId: string; eventVersion: number },
  deduplicationKey: string,
): boolean {
  return event.tenantId === payload.tenantId &&
    event.eventType === FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_TYPE &&
    event.eventVersion === FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_VERSION &&
    event.aggregateType === FISCAL_ACCEPTED_FANOUT_AGGREGATE_TYPE &&
    event.aggregateId === payload.billingDocumentId &&
    event.causationId === causationId &&
    event.deduplicationKey === deduplicationKey &&
    exactDeliveryPayload(event.payload, payload);
}

function exactDeliveryPayload(
  value: Prisma.JsonValue,
  expected: { tenantId: string; billingDocumentId: string; eventVersion: number },
): boolean {
  return jsonObject(value) && Object.keys(value).length === 3 &&
    value.tenantId === expected.tenantId &&
    value.billingDocumentId === expected.billingDocumentId &&
    value.eventVersion === expected.eventVersion;
}

async function lockOwnedChildForFinalization(tx: Prisma.TransactionClient, claim: ClaimedFiscalArtifactRetrieval): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "billing_outbox_events" WHERE "id" = ${claim.outboxEventId} AND "tenantId" = ${claim.tenantId} AND "eventType" = ${BILLING_DOCUMENT_ARTIFACT_RETRIEVAL_REQUESTED_EVENT_TYPE} AND "eventVersion" = ${BILLING_DOCUMENT_ARTIFACT_RETRIEVAL_REQUESTED_EVENT_VERSION} AND "status" = 'PROCESSING' AND "lockedBy" = ${claim.lockOwner} FOR UPDATE`;
  return rows.length === 1;
}

async function requireOwnedUpdate(tx: Prisma.TransactionClient, claim: ClaimedFiscalArtifactRetrieval, data: Prisma.BillingOutboxEventUpdateManyMutationInput): Promise<void> {
  const updated = await tx.billingOutboxEvent.updateMany({ where: ownedWhere(claim), data });
  if (updated.count !== 1) throw new FiscalArtifactRetrievalServiceError(RETRYABLE_ERROR, true);
}

async function lockOwnedChild(tx: Prisma.TransactionClient, claim: ClaimedFiscalArtifactRetrieval): Promise<void> {
  const cutoff = new Date(Date.now() - LEASE_MS);
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "billing_outbox_events" WHERE "id" = ${claim.outboxEventId} AND "tenantId" = ${claim.tenantId} AND "eventType" = ${BILLING_DOCUMENT_ARTIFACT_RETRIEVAL_REQUESTED_EVENT_TYPE} AND "eventVersion" = ${BILLING_DOCUMENT_ARTIFACT_RETRIEVAL_REQUESTED_EVENT_VERSION} AND "status" = 'PROCESSING' AND "lockedBy" = ${claim.lockOwner} AND "lockedAt" >= ${cutoff} FOR UPDATE`;
  if (rows.length !== 1) throw permanent(CLAIM_ERROR);
}
async function lockArtifact(tx: Prisma.TransactionClient, payload: Payload): Promise<ArtifactRow | null> { const rows = await tx.$queryRaw<ArtifactRow[]>`SELECT "id", "tenantId", "billingDocumentId", "artifactType", "version", "status", "storageProvider", "storageKey", "sha256", "byteSize", "mimeType", "sourceEtag", "retrievedAt", "storedAt", "terminalErrorCode", "failedAt" FROM "billing_document_artifacts" WHERE "tenantId" = ${payload.tenantId} AND "billingDocumentId" = ${payload.billingDocumentId} AND "artifactType" = ${payload.artifactType} AND "version" = ${payload.artifactVersion} FOR UPDATE`; return rows.length === 1 ? rows[0] : null; }
function validPayload(child: { tenantId: string; eventType: string; eventVersion: number; aggregateType: string; aggregateId: string; causationId: string | null; payload: Prisma.JsonValue }, claim: ClaimedFiscalArtifactRetrieval): Payload | null { if (child.tenantId !== claim.tenantId || child.eventType !== BILLING_DOCUMENT_ARTIFACT_RETRIEVAL_REQUESTED_EVENT_TYPE || child.eventVersion !== 1 || child.aggregateType !== FISCAL_TERMINAL_ARTIFACT_FANOUT_AGGREGATE_TYPE || !nonEmpty(child.causationId) || !jsonObject(child.payload) || Object.keys(child.payload).length !== 5) return null; const p = child.payload; return typeof p.tenantId === 'string' && p.tenantId === child.tenantId && typeof p.billingDocumentId === 'string' && p.billingDocumentId === child.aggregateId && (p.artifactType === 'SIGNED_FISCAL_XML' || p.artifactType === 'TAX_AUTHORITY_RESPONSE_XML') && p.artifactVersion === 1 && p.eventVersion === 1 ? { tenantId: p.tenantId, billingDocumentId: p.billingDocumentId, artifactType: p.artifactType, artifactVersion: 1, eventVersion: 1 } : null; }
function validAttemptLifecycle(child: { attemptCount: number; maximumAttempts: number }): boolean { return Number.isInteger(child.attemptCount) && child.attemptCount >= 1 && Number.isInteger(child.maximumAttempts) && child.maximumAttempts >= 1; }
function boundedRetryDelay(attemptCount: number): number { return Math.min(FISCAL_ARTIFACT_RETRIEVAL_RETRY_BASE_MS * 2 ** Math.min(Math.max(attemptCount - 1, 0), 30), FISCAL_ARTIFACT_RETRIEVAL_RETRY_MAX_MS); }
function samePreparedChild(child: { id: string; tenantId: string; eventType: string; eventVersion: number; aggregateType: string; aggregateId: string; causationId: string | null; payload: Prisma.JsonValue; status: string; lockedBy: string | null; lockedAt: Date | null }, prepared: Prepared): boolean { const payload = validPayload(child, prepared.claim); return child.id === prepared.child.id && child.tenantId === prepared.child.tenantId && child.eventType === prepared.child.eventType && child.eventVersion === prepared.child.eventVersion && child.aggregateType === prepared.child.aggregateType && child.aggregateId === prepared.child.aggregateId && child.causationId === prepared.child.causationId && child.status === 'PROCESSING' && child.lockedBy === prepared.claim.lockOwner && validDate(child.lockedAt) && child.lockedAt.getTime() >= Date.now() - LEASE_MS && payload !== null && payload.tenantId === prepared.child.payload.tenantId && payload.billingDocumentId === prepared.child.payload.billingDocumentId && payload.artifactType === prepared.child.payload.artifactType && payload.artifactVersion === prepared.child.payload.artifactVersion && payload.eventVersion === prepared.child.payload.eventVersion; }
function validDocument(d: { providerDocumentId: string | null; providerEnvironment: string | null; haciendaKey: string | null; fiscalNumber: string | null; documentTypeCode: string; taxAuthorityStatus: string; taxAuthorityFinalizedAt: Date | null }): d is Prepared['document'] { return nonEmpty(d.providerDocumentId) && (d.providerEnvironment === 'sandbox' || d.providerEnvironment === 'production') && nonEmpty(d.haciendaKey) && nonEmpty(d.fiscalNumber) && (d.documentTypeCode === '01' || d.documentTypeCode === '04') && (d.taxAuthorityStatus === 'ACCEPTED' || d.taxAuthorityStatus === 'REJECTED') && validDate(d.taxAuthorityFinalizedAt); }
function exactArtifactIdentity(a: ArtifactRow, p: Payload): boolean { return a.tenantId === p.tenantId && a.billingDocumentId === p.billingDocumentId && a.artifactType === p.artifactType && a.version === p.artifactVersion; }
function isPending(a: ArtifactRow): boolean { return a.status === 'PENDING' && a.storageProvider === null && a.storageKey === null && a.sha256 === null && a.byteSize === null && a.mimeType === null && a.sourceEtag === null && a.retrievedAt === null && a.storedAt === null && a.terminalErrorCode === null && a.failedAt === null; }
function isAvailable(a: ArtifactRow): boolean { return a.status === 'AVAILABLE' && nonEmpty(a.storageProvider) && nonEmpty(a.storageKey) && /^[a-f0-9]{64}$/.test(a.sha256 ?? '') && a.byteSize !== null && a.byteSize > 0n && (a.mimeType === 'application/xml' || a.mimeType === 'text/xml') && validDate(a.retrievedAt) && validDate(a.storedAt) && a.storedAt >= a.retrievedAt && a.terminalErrorCode === null && a.failedAt === null; }
function isFailed(a: ArtifactRow): boolean { return a.status === 'FAILED' && a.storageProvider === null && a.storageKey === null && a.sha256 === null && a.byteSize === null && a.mimeType === null && a.sourceEtag === null && a.retrievedAt === null && a.storedAt === null && /^[A-Z][A-Z0-9_]{0,99}$/.test(a.terminalErrorCode ?? '') && validDate(a.failedAt); }
function exactMetadata(m: CompletionMetadata, sha: string, bytes: Buffer, mime: string): boolean { return m.sha256 === sha && m.byteSize === BigInt(bytes.length) && m.mimeType === mime && nonEmpty(m.storageProvider) && nonEmpty(m.storageKey) && validDate(m.storedAt) && validDate(m.retrievedAt) && m.storedAt >= m.retrievedAt; }
function sameMetadata(a: ArtifactRow, m: CompletionMetadata): boolean { return a.storageProvider === m.storageProvider && a.storageKey === m.storageKey && a.sha256 === m.sha256 && a.byteSize === m.byteSize && a.mimeType === m.mimeType && a.sourceEtag === m.sourceEtag && datesEqual(a.retrievedAt, m.retrievedAt) && datesEqual(a.storedAt, m.storedAt); }
function ownedWhere(c: ClaimedFiscalArtifactRetrieval) { return { id: c.outboxEventId, tenantId: c.tenantId, status: 'PROCESSING' as const, lockedBy: c.lockOwner }; }
function classify(error: unknown): FiscalArtifactRetrievalServiceError { if (error instanceof FiscalArtifactRetrievalServiceError) return error; if (error instanceof FiscalXmlIdentityValidationError) return permanent(VALIDATION_ERROR); if (error instanceof FiscalArtifactRetrievalError) return new FiscalArtifactRetrievalServiceError(error.retryable ? RETRYABLE_ERROR : VALIDATION_ERROR, error.retryable); if (error instanceof ImmutableBillingArtifactStorageError) return error.code === 'IMMUTABLE_BILLING_ARTIFACT_STORAGE_FAILURE' ? new FiscalArtifactRetrievalServiceError(RETRYABLE_ERROR, true) : permanent(STORAGE_ERROR); return new FiscalArtifactRetrievalServiceError(RETRYABLE_ERROR, true); }
function permanent(code: string) { return new FiscalArtifactRetrievalServiceError(code, false); }
function safeCode(code: string) { return /^[A-Z][A-Z0-9_]{0,99}$/.test(code) ? code : RETRYABLE_ERROR; }
function nonEmpty(v: unknown): v is string { return typeof v === 'string' && v.trim().length > 0; }
function validDate(v: unknown): v is Date { return v instanceof Date && Number.isFinite(v.getTime()); }
function datesEqual(a: Date | null, b: Date): boolean { return a instanceof Date && a.getTime() === b.getTime(); }
function jsonObject(v: Prisma.JsonValue): v is Prisma.JsonObject { return typeof v === 'object' && v !== null && !Array.isArray(v); }
