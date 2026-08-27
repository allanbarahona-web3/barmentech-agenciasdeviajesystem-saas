import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { JobDispatcherService } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import { PrismaService } from "../../prisma/prisma.service";
import {
  ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_TYPE,
  ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_VERSION,
  FISCAL_ACCEPTED_FANOUT_AGGREGATE_TYPE,
} from "./fiscal-accepted-fanout.constants";
import {
  ACCOUNT_RECEIVABLE_RECOGNITION_BATCH_SIZE,
  ACCOUNT_RECEIVABLE_RECOGNITION_JOB_NAME,
  ACCOUNT_RECEIVABLE_RECOGNITION_LEASE_MS,
  ACCOUNT_RECEIVABLE_RECOGNITION_POLL_INTERVAL_MS,
  ACCOUNT_RECEIVABLE_RECOGNITION_RETRY_BASE_MS,
  ACCOUNT_RECEIVABLE_RECOGNITION_RETRY_MAX_MS,
  accountReceivableRecognitionJobId,
  type AccountReceivableRecognitionJobPayload,
} from "./account-receivable-recognition.constants";

interface ClaimedRecognitionEvent {
  id: string; tenantId: string; eventType: string; eventVersion: number;
  aggregateType: string; aggregateId: string; causationId: string | null;
  payload: Prisma.JsonValue; attemptCount: number; maximumAttempts: number;
}

const INVALID_EVENT_ERROR = "ACCOUNT_RECEIVABLE_RECOGNITION_OUTBOX_INVALID";
const DISPATCH_ERROR = "ACCOUNT_RECEIVABLE_RECOGNITION_DISPATCH_FAILED";

@Injectable()
export class AccountReceivableRecognitionPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountReceivableRecognitionPublisher.name);
  private readonly lockOwner = `account-receivable-recognition-${process.pid}-${randomUUID()}`;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private activeCycle: Promise<void> | null = null;
  private stopping = false;

  constructor(private readonly prisma: PrismaService, private readonly dispatcher: JobDispatcherService) {}

  onModuleInit(): void { this.schedule(0); }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.activeCycle;
  }

  async publishAvailableEvents(): Promise<void> {
    const claimed = await this.claimBatch();
    for (const event of claimed) {
      try { await this.publishClaimedEvent(event); }
      catch { this.logger.error("Account receivable recognition outbox publishing failed."); }
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => { this.timer = null; void this.executeCycle(); }, delayMs);
  }

  private async executeCycle(): Promise<void> {
    if (this.stopping || this.activeCycle) return;
    const cycle = this.publishAvailableEvents().catch(() => {
      this.logger.error("Account receivable recognition polling cycle failed.");
    });
    this.activeCycle = cycle;
    try { await cycle; }
    finally { this.activeCycle = null; this.schedule(ACCOUNT_RECEIVABLE_RECOGNITION_POLL_INTERVAL_MS); }
  }

  private claimBatch(): Promise<ClaimedRecognitionEvent[]> {
    const claimedAt = new Date();
    const leaseCutoff = new Date(claimedAt.getTime() - ACCOUNT_RECEIVABLE_RECOGNITION_LEASE_MS);
    return this.prisma.$transaction((tx) => tx.$queryRaw<ClaimedRecognitionEvent[]>`
      WITH eligible AS (
        SELECT "id"
        FROM "billing_outbox_events"
        WHERE "eventType" = ${ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_TYPE}
          AND "eventVersion" = ${ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_VERSION}
          AND "attemptCount" < "maximumAttempts"
          AND (
            ("status" = 'PENDING' AND "availableAt" <= ${claimedAt})
            OR ("status" = 'PROCESSING' AND "lockedAt" < ${leaseCutoff})
          )
        ORDER BY "availableAt" ASC, "createdAt" ASC
        LIMIT ${ACCOUNT_RECEIVABLE_RECOGNITION_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "billing_outbox_events" AS event
      SET "status" = 'PROCESSING',
          "attemptCount" = event."attemptCount" + 1,
          "lockedAt" = ${claimedAt},
          "lockedBy" = ${this.lockOwner},
          "lastAttemptAt" = ${claimedAt},
          "updatedAt" = ${claimedAt}
      FROM eligible
      WHERE event."id" = eligible."id"
      RETURNING event."id", event."tenantId", event."eventType", event."eventVersion",
        event."aggregateType", event."aggregateId", event."causationId", event."payload",
        event."attemptCount", event."maximumAttempts"
    `);
  }

  private async publishClaimedEvent(event: ClaimedRecognitionEvent): Promise<void> {
    const payload = validPayload(event, this.lockOwner);
    if (!payload) {
      await this.finishClaim(event, { status: "FAILED", lastError: INVALID_EVENT_ERROR });
      return;
    }
    try {
      await this.dispatcher.dispatch<AccountReceivableRecognitionJobPayload>({
        queueKey: PLATFORM_QUEUE_KEYS.ACCOUNT_RECEIVABLE_RECOGNITION,
        jobName: ACCOUNT_RECEIVABLE_RECOGNITION_JOB_NAME,
        payload,
        metadata: { tenantId: event.tenantId },
        options: {
          jobId: accountReceivableRecognitionJobId(event.id, event.attemptCount, this.lockOwner),
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: false,
          removeOnFail: false,
        },
      });
    } catch {
      await this.recordDispatchFailure(event);
    }
  }

  private async recordDispatchFailure(event: ClaimedRecognitionEvent): Promise<void> {
    if (event.attemptCount >= event.maximumAttempts) {
      await this.finishClaim(event, { status: "FAILED", lastError: DISPATCH_ERROR });
      return;
    }
    const exponent = Math.min(Math.max(event.attemptCount - 1, 0), 30);
    const delayMs = Math.min(ACCOUNT_RECEIVABLE_RECOGNITION_RETRY_BASE_MS * 2 ** exponent, ACCOUNT_RECEIVABLE_RECOGNITION_RETRY_MAX_MS);
    await this.finishClaim(event, {
      status: "PENDING", availableAt: new Date(Date.now() + delayMs), lastError: DISPATCH_ERROR,
    });
  }

  private async finishClaim(event: ClaimedRecognitionEvent, data: Prisma.BillingOutboxEventUpdateManyMutationInput): Promise<void> {
    await this.prisma.billingOutboxEvent.updateMany({
      where: { id: event.id, tenantId: event.tenantId, status: "PROCESSING", lockedBy: this.lockOwner },
      data: { ...data, lockedAt: null, lockedBy: null },
    });
  }
}

function validPayload(event: ClaimedRecognitionEvent, lockOwner: string): AccountReceivableRecognitionJobPayload | null {
  if (
    event.eventType !== ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_TYPE ||
    event.eventVersion !== ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_VERSION ||
    event.aggregateType !== FISCAL_ACCEPTED_FANOUT_AGGREGATE_TYPE ||
    !nonEmpty(event.causationId) || !isJsonObject(event.payload) || Object.keys(event.payload).length !== 3
  ) return null;
  const { tenantId, billingDocumentId, eventVersion } = event.payload;
  if (
    tenantId !== event.tenantId || typeof billingDocumentId !== "string" || !nonEmpty(billingDocumentId) ||
    billingDocumentId !== event.aggregateId || eventVersion !== ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_VERSION ||
    !nonEmpty(lockOwner)
  ) return null;
  return { tenantId, outboxEventId: event.id, lockOwner, eventVersion: 1 };
}

function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject { return typeof value === "object" && value !== null && !Array.isArray(value); }
