import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import {
  ADDITIONAL_SERVICE_ORDER_LINE_SOURCE,
  OPERATIONS_INTAKE_OUTBOX_BATCH_SIZE,
  OPERATIONS_INTAKE_OUTBOX_POLL_INTERVAL_MS,
  OPERATIONS_INTAKE_OUTBOX_PROCESSING_LEASE_MS,
  OPERATIONS_INTAKE_OUTBOX_RETRY_BASE_MS,
  OPERATIONS_INTAKE_OUTBOX_RETRY_MAX_MS,
  OPERATIONS_INTAKE_OUTBOX_TENANT_BATCH_SIZE,
  OPERATIONS_SOURCE_ITEM_APPROVED_EVENT,
  TRAVEL_PACKAGE_COST_COMPONENT_SOURCE,
} from "./operations-intake-outbox.constants";
import { OperationalWorkMaterializer } from "./operational-work-materializer.service";
import {
  OperationalWorkMaterializationError,
  type OperationalWorkMaterializationErrorCode,
} from "./operational-work-source-reader.port";

type ClaimedEvent = {
  id: string;
  tenantId: string;
  travelPackageId: string;
  eventType: string;
  eventVersion: number;
  sourceType: string;
  sourceId: string;
  sourceLineId: string;
  sourceVersionId: string | null;
  attemptCount: number;
  maximumAttempts: number;
  recoveredLease: boolean;
};

type IntakeTransaction = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  operationsIntakeOutboxEvent: { updateMany(args: unknown): Promise<{ count: number }> };
};

type IntakeDatabase = {
  $transaction<T>(work: (transaction: IntakeTransaction) => Promise<T>): Promise<T>;
};

export type OperationsIntakeOutboxBatchResult = {
  claimed: number;
  processed: number;
  retried: number;
  failed: number;
  recoveredLeases: number;
};

const MAX_ATTEMPTS_ERROR = "OPERATIONS_INTAKE_MAX_ATTEMPTS_EXHAUSTED";
const UNSUPPORTED_EVENT_ERROR = "OPERATIONS_INTAKE_UNSUPPORTED_EVENT";

@Injectable()
export class OperationsIntakeOutboxWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OperationsIntakeOutboxWorkerService.name);
  private readonly lockOwner = `operations-intake-${process.pid}-${randomUUID()}`;
  private readonly database: IntakeDatabase;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private activeCycle: Promise<void> | null = null;
  private stopping = false;
  private tenantCursor: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly materializer: OperationalWorkMaterializer,
  ) {
    this.database = prisma as unknown as IntakeDatabase;
  }

  onModuleInit(): void {
    this.scheduleNextCycle(0);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.activeCycle;
  }

  /** Internal/dev entry point. It never exposes an HTTP mutation surface. */
  async processAvailableBatch(tenantId?: string): Promise<OperationsIntakeOutboxBatchResult> {
    const tenants = tenantId ? [{ id: tenantId }] : await this.nextTenantBatch();
    const result: OperationsIntakeOutboxBatchResult = { claimed: 0, processed: 0, retried: 0, failed: 0, recoveredLeases: 0 };
    for (const tenant of tenants) {
      const tenantResult = await this.processTenantBatch(tenant.id);
      result.claimed += tenantResult.claimed;
      result.processed += tenantResult.processed;
      result.retried += tenantResult.retried;
      result.failed += tenantResult.failed;
      result.recoveredLeases += tenantResult.recoveredLeases;
    }
    if (result.claimed > 0 || result.failed > 0) {
      this.logger.log({ event: "operations-intake-outbox-batch", ...result });
    }
    return result;
  }

  private async processTenantBatch(tenantId: string): Promise<OperationsIntakeOutboxBatchResult> {
    const claimed = await this.claimBatch(tenantId);
    const result: OperationsIntakeOutboxBatchResult = {
      claimed: claimed.length,
      processed: 0,
      retried: 0,
      failed: 0,
      recoveredLeases: claimed.filter((event) => event.recoveredLease).length,
    };
    for (const event of claimed) {
      try {
        const outcome = await this.processClaimedEvent(event);
        result[outcome] += 1;
      } catch {
        // The event remains leased. A later expired-lease recovery safely replays
        // the idempotent materializer if persisting its outcome failed.
        this.logger.error({ event: "operations-intake-outbox-processing-failed", eventId: event.id, tenantId: event.tenantId, sourceId: event.sourceId, sourceLineId: event.sourceLineId });
      }
    }
    return result;
  }

  private async claimBatch(tenantId: string): Promise<ClaimedEvent[]> {
    const claimedAt = new Date();
    const leaseCutoff = new Date(claimedAt.getTime() - OPERATIONS_INTAKE_OUTBOX_PROCESSING_LEASE_MS);
    return runTenantTransaction(this.database, tenantId, (tx) => tx.$queryRaw<ClaimedEvent[]>`
      WITH exhausted AS (
        UPDATE "operations_intake_outbox_events"
        SET "status" = 'FAILED', "lockedAt" = NULL, "lockedBy" = NULL,
            "lastError" = ${MAX_ATTEMPTS_ERROR}, "updatedAt" = ${claimedAt}
        WHERE "tenantId" = ${tenantId}
          AND "attemptCount" >= "maximumAttempts"
          AND NOT (
            "sourceType" = ${TRAVEL_PACKAGE_COST_COMPONENT_SOURCE}
            AND "lastError" LIKE 'PARTICIPANT_NOT_FOUND%'
          )
          AND (
            ("status" = 'PENDING' AND "availableAt" <= ${claimedAt})
            OR ("status" = 'PROCESSING' AND "lockedAt" < ${leaseCutoff})
          )
      ),
      eligible AS (
        SELECT "id", "status" AS "previousStatus"
        FROM "operations_intake_outbox_events"
        WHERE "tenantId" = ${tenantId}
          AND (
            "attemptCount" < "maximumAttempts"
            OR (
              "sourceType" = ${TRAVEL_PACKAGE_COST_COMPONENT_SOURCE}
              AND "lastError" LIKE 'PARTICIPANT_NOT_FOUND%'
            )
          )
          AND (
            ("status" = 'PENDING' AND "availableAt" <= ${claimedAt})
            OR ("status" = 'PROCESSING' AND "lockedAt" < ${leaseCutoff})
          )
        ORDER BY "availableAt" ASC, "createdAt" ASC, "id" ASC
        LIMIT ${OPERATIONS_INTAKE_OUTBOX_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "operations_intake_outbox_events" AS event
      SET "status" = 'PROCESSING',
          "attemptCount" = event."attemptCount" + 1,
          "lockedAt" = ${claimedAt},
          "lockedBy" = ${this.lockOwner},
          "lastAttemptAt" = ${claimedAt},
          "updatedAt" = ${claimedAt}
      FROM eligible
      WHERE event."id" = eligible."id"
      RETURNING event."id", event."tenantId", event."travelPackageId",
        event."eventType", event."eventVersion", event."sourceType",
        event."sourceId", event."sourceLineId", event."sourceVersionId",
        event."attemptCount", event."maximumAttempts",
        (eligible."previousStatus" = 'PROCESSING') AS "recoveredLease"
    `);
  }

  private async processClaimedEvent(event: ClaimedEvent): Promise<"processed" | "retried" | "failed"> {
    if (!isSupported(event)) {
      await this.finishClaim(event, { status: "FAILED", lastError: UNSUPPORTED_EVENT_ERROR });
      this.logger.warn({ event: "operations-intake-outbox-terminal-failure", eventId: event.id, tenantId: event.tenantId, sourceId: event.sourceId, sourceLineId: event.sourceLineId, reason: UNSUPPORTED_EVENT_ERROR });
      return "failed";
    }
    let materialized: { status: "CREATED" | "ALREADY_MATERIALIZED"; operationalRequirementId: string };
    try {
      materialized = await this.materializer.materialize({
        tenantId: event.tenantId,
        travelPackageId: event.travelPackageId,
        sourceType: event.sourceType,
        sourceId: event.sourceId,
        sourceLineId: event.sourceLineId,
      });
    } catch (error) {
      const failure = classifyFailure(error);
      if (!failure.retryable || (event.attemptCount >= event.maximumAttempts && !isBaseRosterRetry(event, error))) {
        await this.finishClaim(event, { status: "FAILED", lastError: failure.lastError });
        this.logger.warn({ event: "operations-intake-outbox-terminal-failure", eventId: event.id, tenantId: event.tenantId, sourceId: event.sourceId, sourceLineId: event.sourceLineId, reason: failure.lastError, attemptCount: event.attemptCount });
        return "failed";
      }
      const availableAt = new Date(Date.now() + retryDelay(event.attemptCount));
      await this.finishClaim(event, { status: "PENDING", availableAt, lastError: failure.lastError });
      this.logger.warn({ event: "operations-intake-outbox-retry-scheduled", eventId: event.id, tenantId: event.tenantId, sourceId: event.sourceId, sourceLineId: event.sourceLineId, reason: failure.lastError, attemptCount: event.attemptCount, availableAt });
      return "retried";
    }
    // Do not catch this persistence write as a materializer error. If it fails,
    // the leased event is recovered later and materialization is idempotent.
    await this.finishClaim(event, { status: "PROCESSED", processedAt: new Date(), lastError: null });
    this.logger.log({ event: "operations-intake-outbox-processed", eventId: event.id, tenantId: event.tenantId, travelPackageId: event.travelPackageId, sourceId: event.sourceId, sourceLineId: event.sourceLineId, materialization: materialized.status, attemptCount: event.attemptCount });
    return "processed";
  }

  private finishClaim(event: ClaimedEvent, data: Prisma.OperationsIntakeOutboxEventUpdateManyMutationInput): Promise<void> {
    return runTenantTransaction(this.database, event.tenantId, async (tx) => {
      const updated = await tx.operationsIntakeOutboxEvent.updateMany({
        where: { id: event.id, tenantId: event.tenantId, status: "PROCESSING", lockedBy: this.lockOwner },
        data: { ...data, lockedAt: null, lockedBy: null },
      });
      if (updated.count !== 1) throw new Error("OPERATIONS_INTAKE_OUTBOX_CLAIM_LOST");
    });
  }

  private async nextTenantBatch(): Promise<Array<{ id: string }>> {
    let tenants = await this.prisma.tenant.findMany({
      where: this.tenantCursor ? { id: { gt: this.tenantCursor } } : undefined,
      select: { id: true },
      orderBy: { id: "asc" },
      take: OPERATIONS_INTAKE_OUTBOX_TENANT_BATCH_SIZE,
    });
    if (tenants.length === 0 && this.tenantCursor) {
      this.tenantCursor = null;
      tenants = await this.prisma.tenant.findMany({ select: { id: true }, orderBy: { id: "asc" }, take: OPERATIONS_INTAKE_OUTBOX_TENANT_BATCH_SIZE });
    }
    this.tenantCursor = tenants.at(-1)?.id ?? null;
    return tenants;
  }

  private scheduleNextCycle(delayMs: number): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.executeCycle();
    }, delayMs);
  }

  private async executeCycle(): Promise<void> {
    if (this.stopping || this.activeCycle) return;
    const cycle: Promise<void> = this.processAvailableBatch()
      .then(() => undefined)
      .catch(() => {
        this.logger.error({ event: "operations-intake-outbox-cycle-failed" });
      });
    this.activeCycle = cycle;
    try {
      await cycle;
    } finally {
      this.activeCycle = null;
      this.scheduleNextCycle(OPERATIONS_INTAKE_OUTBOX_POLL_INTERVAL_MS);
    }
  }
}

function isSupported(event: ClaimedEvent) {
  return event.eventType === OPERATIONS_SOURCE_ITEM_APPROVED_EVENT
    && event.eventVersion === 1
    && (event.sourceType === ADDITIONAL_SERVICE_ORDER_LINE_SOURCE
      || event.sourceType === TRAVEL_PACKAGE_COST_COMPONENT_SOURCE);
}

function classifyFailure(error: unknown): { retryable: boolean; lastError: string } {
  if (error instanceof OperationalWorkMaterializationError) {
    const terminal = new Set<OperationalWorkMaterializationErrorCode>(["SOURCE_NOT_ELIGIBLE", "PACKAGE_MISMATCH", "SOURCE_CONFLICT"]);
    const retryable = !terminal.has(error.code) && (error.retryable || error.code === "MATERIALIZATION_FAILED");
    return { retryable, lastError: safeError(error) };
  }
  return { retryable: true, lastError: "MATERIALIZATION_FAILED" };
}

function safeError(error: OperationalWorkMaterializationError) {
  const missing = error.diagnostics.missingParticipantCount ?? error.diagnostics.participantCount;
  const detail = typeof missing === "number" && missing >= 0 ? `: ${missing} participant(s) missing` : "";
  return `${error.code}${detail}`.slice(0, 1000);
}

function isBaseRosterRetry(event: ClaimedEvent, error: unknown) {
  return event.sourceType === TRAVEL_PACKAGE_COST_COMPONENT_SOURCE
    && error instanceof OperationalWorkMaterializationError
    && error.code === "PARTICIPANT_NOT_FOUND";
}

function retryDelay(attemptCount: number) {
  const exponent = Math.min(Math.max(attemptCount - 1, 0), 30);
  return Math.min(OPERATIONS_INTAKE_OUTBOX_RETRY_BASE_MS * 2 ** exponent, OPERATIONS_INTAKE_OUTBOX_RETRY_MAX_MS);
}
