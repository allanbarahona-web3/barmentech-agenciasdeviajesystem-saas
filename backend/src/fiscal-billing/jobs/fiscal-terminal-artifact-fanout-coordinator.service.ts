import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import {
  BILLING_DOCUMENT_ARTIFACT_RETRIEVAL_REQUESTED_EVENT_TYPE,
  BILLING_DOCUMENT_ARTIFACT_RETRIEVAL_REQUESTED_EVENT_VERSION,
  billingDocumentArtifactRetrievalDeduplicationKey,
  FISCAL_TERMINAL_ARTIFACT_FANOUT_AGGREGATE_TYPE,
  FISCAL_TERMINAL_ARTIFACT_FANOUT_BATCH_SIZE,
  FISCAL_TERMINAL_ARTIFACT_FANOUT_PARENT_EVENT_TYPE,
  FISCAL_TERMINAL_ARTIFACT_FANOUT_PARENT_EVENT_VERSION,
  FISCAL_TERMINAL_ARTIFACT_FANOUT_POLL_INTERVAL_MS,
  FISCAL_TERMINAL_ARTIFACT_FANOUT_PROCESSING_LEASE_MS,
  FISCAL_TERMINAL_ARTIFACT_FANOUT_RETRY_BASE_MS,
  FISCAL_TERMINAL_ARTIFACT_FANOUT_RETRY_MAX_MS,
  FISCAL_TERMINAL_ARTIFACT_VERSION,
  type FiscalTerminalArtifactType,
} from "./fiscal-terminal-artifact-fanout.constants";
import { logFiscalPollerFailure } from "./fiscal-poller-error-logging";

interface ClaimedTerminalEvent {
  id: string;
  tenantId: string;
  eventType: string;
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.JsonValue;
  attemptCount: number;
  maximumAttempts: number;
}

interface TerminalPayload {
  tenantId: string;
  billingDocumentId: string;
  eventVersion: number;
}

interface ArtifactRow {
  id: string;
  tenantId: string;
  billingDocumentId: string;
  artifactType: string;
  version: number;
  status: string;
  storageProvider: string | null;
  storageKey: string | null;
  sha256: string | null;
  byteSize: bigint | null;
  mimeType: string | null;
  sourceEtag: string | null;
  retrievedAt: Date | null;
  storedAt: Date | null;
  terminalErrorCode: string | null;
  failedAt: Date | null;
}

const ARTIFACT_TYPES: readonly FiscalTerminalArtifactType[] = [
  "SIGNED_FISCAL_XML",
  "TAX_AUTHORITY_RESPONSE_XML",
];
const INVALID_PARENT_ERROR = "FISCAL_TERMINAL_ARTIFACT_PARENT_INVALID";
const INVALID_DOCUMENT_ERROR = "FISCAL_TERMINAL_ARTIFACT_DOCUMENT_INVALID";
const ARTIFACT_CONFLICT_ERROR = "FISCAL_TERMINAL_ARTIFACT_CONFLICT";
const CHILD_CONFLICT_ERROR = "FISCAL_TERMINAL_ARTIFACT_CHILD_CONFLICT";
const FANOUT_ERROR = "FISCAL_TERMINAL_ARTIFACT_FANOUT_FAILED";
const CLAIM_LOST_ERROR = "FISCAL_TERMINAL_ARTIFACT_CLAIM_LOST";

class TerminalArtifactFanoutError extends Error {
  constructor(readonly code: string) { super(code); }
}

@Injectable()
export class FiscalTerminalArtifactFanoutCoordinatorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FiscalTerminalArtifactFanoutCoordinatorService.name);
  private readonly lockOwner = `fiscal-terminal-artifact-fanout-${process.pid}-${randomUUID()}`;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private activeCycle: Promise<void> | null = null;
  private stopping = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void { this.schedule(0); }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.activeCycle;
  }

  async fanOutAvailableEvents(): Promise<void> {
    const claimed = await this.claimBatch();
    for (const event of claimed) {
      try { await this.fanOutClaimedEvent(event); }
      catch { this.logger.error("Fiscal terminal artifact outbox fan-out failed."); }
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => { this.timer = null; void this.executeCycle(); }, delayMs);
  }

  private async executeCycle(): Promise<void> {
    if (this.stopping || this.activeCycle) return;
    const cycle = this.fanOutAvailableEvents().catch((error) => {
      logFiscalPollerFailure(this.logger, "FiscalTerminalArtifactFanoutCoordinatorService", error);
    });
    this.activeCycle = cycle;
    try { await cycle; }
    finally { this.activeCycle = null; this.schedule(FISCAL_TERMINAL_ARTIFACT_FANOUT_POLL_INTERVAL_MS); }
  }

  private claimBatch(): Promise<ClaimedTerminalEvent[]> {
    const claimedAt = new Date();
    const leaseCutoff = new Date(claimedAt.getTime() - FISCAL_TERMINAL_ARTIFACT_FANOUT_PROCESSING_LEASE_MS);
    return this.prisma.$transaction((tx) => tx.$queryRaw<ClaimedTerminalEvent[]>`
      WITH eligible AS (
        SELECT "id"
        FROM "billing_outbox_events"
        WHERE "eventType" = ${FISCAL_TERMINAL_ARTIFACT_FANOUT_PARENT_EVENT_TYPE}
          AND "eventVersion" = ${FISCAL_TERMINAL_ARTIFACT_FANOUT_PARENT_EVENT_VERSION}
          AND (
            ("status" = 'PENDING' AND "availableAt" <= ${claimedAt} AND "attemptCount" < "maximumAttempts")
            OR ("status" = 'PROCESSING' AND "lockedAt" < ${leaseCutoff})
          )
        ORDER BY "availableAt" ASC, "createdAt" ASC
        LIMIT ${FISCAL_TERMINAL_ARTIFACT_FANOUT_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "billing_outbox_events" AS event
      SET "status" = 'PROCESSING',
          "attemptCount" = CASE WHEN event."status" = 'PENDING' THEN event."attemptCount" + 1 ELSE event."attemptCount" END,
          "lockedAt" = ${claimedAt},
          "lockedBy" = ${this.lockOwner},
          "lastAttemptAt" = ${claimedAt},
          "updatedAt" = ${claimedAt}
      FROM eligible
      WHERE event."id" = eligible."id"
      RETURNING event."id", event."tenantId", event."eventType", event."eventVersion",
        event."aggregateType", event."aggregateId", event."payload", event."attemptCount", event."maximumAttempts"
    `);
  }

  private async fanOutClaimedEvent(event: ClaimedTerminalEvent): Promise<void> {
    let operation = "PARENT_LOAD";
    try {
      await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "billing_outbox_events"
          WHERE "id" = ${event.id} AND "tenantId" = ${event.tenantId}
            AND "status" = 'PROCESSING' AND "lockedBy" = ${this.lockOwner}
          FOR UPDATE
        `;
        if (locked.length !== 1) throw new TerminalArtifactFanoutError(CLAIM_LOST_ERROR);
        const parent = await tx.billingOutboxEvent.findUnique({ where: { id: event.id } });
        const payload = parent && validParentPayload(parent);
        if (!parent || !payload) throw new TerminalArtifactFanoutError(INVALID_PARENT_ERROR);

        operation = "DOCUMENT_LOAD";
        const document = await tx.billingDocument.findUnique({
          where: { id_tenantId: { id: payload.billingDocumentId, tenantId: payload.tenantId } },
          select: { id: true, tenantId: true, taxAuthorityStatus: true, taxAuthorityFinalizedAt: true },
        });
        if (!document || !isTerminalDocument(document, payload)) {
          throw new TerminalArtifactFanoutError(INVALID_DOCUMENT_ERROR);
        }

        for (const artifactType of ARTIFACT_TYPES) {
          operation = artifactType === "SIGNED_FISCAL_XML"
            ? "SIGNED_XML_ARTIFACT_INSERT"
            : "TAX_RESPONSE_ARTIFACT_INSERT";
          await ensureArtifact(tx, payload, artifactType);
          operation = artifactType === "SIGNED_FISCAL_XML"
            ? "SIGNED_XML_CHILD_CREATE"
            : "TAX_RESPONSE_CHILD_CREATE";
          await ensureChild(tx, parent, payload, artifactType);
        }

        operation = "PARENT_COMPLETE";
        const completed = await tx.billingOutboxEvent.updateMany({
          where: { id: parent.id, tenantId: parent.tenantId, status: "PROCESSING", lockedBy: this.lockOwner },
          data: { status: "PROCESSED", processedAt: new Date(), lastError: null, lockedAt: null, lockedBy: null },
        });
        if (completed.count !== 1) throw new TerminalArtifactFanoutError(CLAIM_LOST_ERROR);
      });
    } catch (error) {
      if (error instanceof TerminalArtifactFanoutError && error.code === CLAIM_LOST_ERROR) return;
      if (!(error instanceof TerminalArtifactFanoutError)) {
        this.logUnexpectedFanoutFailure(event, operation, error);
      }
      await this.recordFailure(event, error instanceof TerminalArtifactFanoutError ? error.code : FANOUT_ERROR);
    }
  }

  private logUnexpectedFanoutFailure(
    event: ClaimedTerminalEvent,
    operation: string,
    error: unknown,
  ): void {
    const prismaCode = safePrismaCode(error);
    this.logger.error(
      `FISCAL_TERMINAL_ARTIFACT_FANOUT_FAILURE tenantId=${event.tenantId} billingDocumentId=${event.aggregateId} parentOutboxEventId=${event.id} operation=${operation} errorName=${safeErrorName(error)}${prismaCode ? ` prismaCode=${prismaCode}` : ""}`,
    );
  }

  private async recordFailure(event: ClaimedTerminalEvent, errorCode: string): Promise<void> {
    if (
      errorCode === INVALID_PARENT_ERROR || errorCode === INVALID_DOCUMENT_ERROR ||
      errorCode === ARTIFACT_CONFLICT_ERROR || errorCode === CHILD_CONFLICT_ERROR ||
      event.attemptCount >= event.maximumAttempts
    ) {
      await this.finishClaim(event, { status: "FAILED", lastError: errorCode });
      return;
    }
    const exponent = Math.min(Math.max(event.attemptCount - 1, 0), 30);
    const delayMs = Math.min(
      FISCAL_TERMINAL_ARTIFACT_FANOUT_RETRY_BASE_MS * 2 ** exponent,
      FISCAL_TERMINAL_ARTIFACT_FANOUT_RETRY_MAX_MS,
    );
    await this.finishClaim(event, {
      status: "PENDING", availableAt: new Date(Date.now() + delayMs), lastError: errorCode,
    });
  }

  private async finishClaim(event: ClaimedTerminalEvent, data: Prisma.BillingOutboxEventUpdateManyMutationInput): Promise<void> {
    await this.prisma.billingOutboxEvent.updateMany({
      where: { id: event.id, tenantId: event.tenantId, status: "PROCESSING", lockedBy: this.lockOwner },
      data: { ...data, lockedAt: null, lockedBy: null },
    });
  }
}

async function ensureArtifact(
  tx: Prisma.TransactionClient,
  payload: TerminalPayload,
  artifactType: FiscalTerminalArtifactType,
): Promise<void> {
  const now = new Date();
  await tx.$executeRaw`
    INSERT INTO "billing_document_artifacts" (
      "id", "tenantId", "billingDocumentId", "artifactType", "version", "status", "updatedAt"
    ) VALUES (
      ${randomUUID()}, ${payload.tenantId}, ${payload.billingDocumentId}, ${artifactType},
      ${FISCAL_TERMINAL_ARTIFACT_VERSION}, 'PENDING', ${now}
    )
    ON CONFLICT ("tenantId", "billingDocumentId", "artifactType", "version") DO NOTHING
  `;
  const rows = await tx.$queryRaw<ArtifactRow[]>`
    SELECT "id", "tenantId", "billingDocumentId", "artifactType", "version", "status",
      "storageProvider", "storageKey", "sha256", "byteSize", "mimeType", "sourceEtag",
      "retrievedAt", "storedAt", "terminalErrorCode", "failedAt"
    FROM "billing_document_artifacts"
    WHERE "tenantId" = ${payload.tenantId}
      AND "billingDocumentId" = ${payload.billingDocumentId}
      AND "artifactType" = ${artifactType}
      AND "version" = ${FISCAL_TERMINAL_ARTIFACT_VERSION}
    FOR UPDATE
  `;
  if (rows.length !== 1 || !isExactArtifact(rows[0], payload, artifactType)) {
    throw new TerminalArtifactFanoutError(ARTIFACT_CONFLICT_ERROR);
  }
}

async function ensureChild(
  tx: Prisma.TransactionClient,
  parent: { id: string; tenantId: string; aggregateType: string; aggregateId: string },
  payload: TerminalPayload,
  artifactType: FiscalTerminalArtifactType,
): Promise<void> {
  const deduplicationKey = billingDocumentArtifactRetrievalDeduplicationKey(payload.billingDocumentId, artifactType);
  const childPayload = {
    tenantId: payload.tenantId,
    billingDocumentId: payload.billingDocumentId,
    artifactType,
    artifactVersion: FISCAL_TERMINAL_ARTIFACT_VERSION,
    eventVersion: BILLING_DOCUMENT_ARTIFACT_RETRIEVAL_REQUESTED_EVENT_VERSION,
  };
  await tx.billingOutboxEvent.createMany({
    data: {
      tenantId: parent.tenantId,
      eventType: BILLING_DOCUMENT_ARTIFACT_RETRIEVAL_REQUESTED_EVENT_TYPE,
      eventVersion: BILLING_DOCUMENT_ARTIFACT_RETRIEVAL_REQUESTED_EVENT_VERSION,
      aggregateType: parent.aggregateType,
      aggregateId: parent.aggregateId,
      causationId: parent.id,
      deduplicationKey,
      payload: childPayload,
    },
    skipDuplicates: true,
  });
  const child = await tx.billingOutboxEvent.findUnique({
    where: { tenantId_deduplicationKey: { tenantId: parent.tenantId, deduplicationKey } },
  });
  if (!child || !isExactChild(child, parent, childPayload, deduplicationKey)) {
    throw new TerminalArtifactFanoutError(CHILD_CONFLICT_ERROR);
  }
}

function validParentPayload(parent: {
  tenantId: string; eventType: string; eventVersion: number; aggregateType: string; aggregateId: string; payload: Prisma.JsonValue;
}): TerminalPayload | null {
  if (
    parent.eventType !== FISCAL_TERMINAL_ARTIFACT_FANOUT_PARENT_EVENT_TYPE ||
    parent.eventVersion !== FISCAL_TERMINAL_ARTIFACT_FANOUT_PARENT_EVENT_VERSION ||
    parent.aggregateType !== FISCAL_TERMINAL_ARTIFACT_FANOUT_AGGREGATE_TYPE ||
    !isJsonObject(parent.payload) || Object.keys(parent.payload).length !== 3
  ) return null;
  const { tenantId, billingDocumentId, eventVersion } = parent.payload;
  if (
    typeof tenantId !== "string" || !tenantId || tenantId !== parent.tenantId ||
    typeof billingDocumentId !== "string" || !billingDocumentId || billingDocumentId !== parent.aggregateId ||
    eventVersion !== FISCAL_TERMINAL_ARTIFACT_FANOUT_PARENT_EVENT_VERSION
  ) return null;
  return { tenantId, billingDocumentId, eventVersion };
}

function isTerminalDocument(
  value: { id: string; tenantId: string; taxAuthorityStatus: string; taxAuthorityFinalizedAt: Date | null },
  payload: TerminalPayload,
): boolean {
  return value.id === payload.billingDocumentId && value.tenantId === payload.tenantId &&
    (value.taxAuthorityStatus === "ACCEPTED" || value.taxAuthorityStatus === "REJECTED") &&
    validDate(value.taxAuthorityFinalizedAt);
}

function isExactArtifact(row: ArtifactRow, payload: TerminalPayload, artifactType: FiscalTerminalArtifactType): boolean {
  if (
    row.tenantId !== payload.tenantId || row.billingDocumentId !== payload.billingDocumentId ||
    row.artifactType !== artifactType || row.version !== FISCAL_TERMINAL_ARTIFACT_VERSION
  ) return false;
  if (row.status === "PENDING") {
    return row.storageProvider === null && row.storageKey === null && row.sha256 === null &&
      row.byteSize === null && row.mimeType === null && row.sourceEtag === null &&
      row.retrievedAt === null && row.storedAt === null && row.terminalErrorCode === null && row.failedAt === null;
  }
  if (row.status === "AVAILABLE") {
    return nonEmpty(row.storageProvider) && nonEmpty(row.storageKey) && /^[0-9a-f]{64}$/.test(row.sha256 ?? "") &&
      row.byteSize !== null && row.byteSize > 0n && validMime(artifactType, row.mimeType) &&
      validDate(row.retrievedAt) && validDate(row.storedAt) && row.storedAt >= row.retrievedAt &&
      row.terminalErrorCode === null && row.failedAt === null;
  }
  return row.status === "FAILED" && row.storageProvider === null && row.storageKey === null &&
    row.sha256 === null && row.byteSize === null && row.mimeType === null && row.sourceEtag === null &&
    row.retrievedAt === null && row.storedAt === null && /^[A-Z][A-Z0-9_]{0,99}$/.test(row.terminalErrorCode ?? "") && validDate(row.failedAt);
}

function isExactChild(
  child: {
    tenantId: string; eventType: string; eventVersion: number; aggregateType: string; aggregateId: string;
    causationId: string | null; deduplicationKey: string | null; payload: Prisma.JsonValue;
  },
  parent: { id: string; tenantId: string; aggregateType: string; aggregateId: string },
  payload: Record<string, unknown>,
  deduplicationKey: string,
): boolean {
  return child.tenantId === parent.tenantId &&
    child.eventType === BILLING_DOCUMENT_ARTIFACT_RETRIEVAL_REQUESTED_EVENT_TYPE &&
    child.eventVersion === BILLING_DOCUMENT_ARTIFACT_RETRIEVAL_REQUESTED_EVENT_VERSION &&
    child.aggregateType === parent.aggregateType && child.aggregateId === parent.aggregateId &&
    child.causationId === parent.id && child.deduplicationKey === deduplicationKey &&
    isExactPayload(child.payload, payload);
}

function isExactPayload(value: Prisma.JsonValue, expected: Record<string, unknown>): boolean {
  return isJsonObject(value) && Object.keys(value).length === 5 &&
    Object.entries(expected).every(([key, item]) => value[key] === item);
}
function validMime(type: FiscalTerminalArtifactType, value: string | null): boolean {
  return type === "SIGNED_FISCAL_XML" || type === "TAX_AUTHORITY_RESPONSE_XML"
    ? value === "application/xml" || value === "text/xml"
    : false;
}
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function validDate(value: unknown): value is Date { return value instanceof Date && Number.isFinite(value.getTime()); }
function isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject { return typeof value === "object" && value !== null && !Array.isArray(value); }
function safePrismaCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const value = error as { code?: unknown; errorCode?: unknown };
  const codes = [value.code, value.errorCode].filter(
    (candidate): candidate is string => typeof candidate === "string" && /^P\d{4}$/.test(candidate),
  );
  return new Set(codes).size === 1 ? codes[0] ?? null : null;
}
function safeErrorName(error: unknown): string {
  if (!error || typeof error !== "object") return "UnknownError";
  const name = (error as { name?: unknown }).name;
  return typeof name === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(name)
    ? name
    : "UnknownError";
}
