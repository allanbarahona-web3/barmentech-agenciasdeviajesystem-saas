import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { JobDispatcherService } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import { PrismaService } from "../../prisma/prisma.service";
import {
  FISCAL_ISSUANCE_JOB_NAME,
  FISCAL_OUTBOX_AGGREGATE_TYPE,
  FISCAL_OUTBOX_BATCH_SIZE,
  FISCAL_OUTBOX_EVENT_TYPE,
  FISCAL_OUTBOX_EVENT_VERSION,
  FISCAL_OUTBOX_POLL_INTERVAL_MS,
  FISCAL_OUTBOX_PROCESSING_LEASE_MS,
  FISCAL_OUTBOX_RETRY_BASE_MS,
  FISCAL_OUTBOX_RETRY_MAX_MS,
  fiscalIssuanceJobId,
} from "./fiscal-outbox-publisher.constants";
import { logFiscalPollerFailure } from "./fiscal-poller-error-logging";

interface ClaimedFiscalOutboxEvent {
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

interface FiscalIssuanceEventPayload {
  tenantId: string;
  billingDocumentId: string;
  eventVersion: number;
}

const INVALID_EVENT_ERROR = "FISCAL_OUTBOX_EVENT_INVALID";
const DISPATCH_ERROR = "FISCAL_OUTBOX_DISPATCH_FAILED";

@Injectable()
export class FiscalOutboxPublisherService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(FiscalOutboxPublisherService.name);
  private readonly lockOwner = `fiscal-outbox-${process.pid}-${randomUUID()}`;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private activeCycle: Promise<void> | null = null;
  private stopping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobDispatcher: JobDispatcherService,
  ) {}

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

  async publishAvailableEvents(): Promise<void> {
    const claimed = await this.claimBatch();
    for (const event of claimed) {
      try {
        await this.publishClaimedEvent(event);
      } catch {
        this.logger.error("Fiscal outbox event processing failed.");
      }
    }
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
    const cycle = this.publishAvailableEvents().catch((error) => {
      logFiscalPollerFailure(this.logger, "FiscalOutboxPublisherService", error);
    });
    this.activeCycle = cycle;
    try {
      await cycle;
    } finally {
      this.activeCycle = null;
      this.scheduleNextCycle(FISCAL_OUTBOX_POLL_INTERVAL_MS);
    }
  }

  private claimBatch(): Promise<ClaimedFiscalOutboxEvent[]> {
    const claimedAt = new Date();
    const leaseCutoff = new Date(
      claimedAt.getTime() - FISCAL_OUTBOX_PROCESSING_LEASE_MS,
    );

    return this.prisma.$transaction((tx) => tx.$queryRaw<ClaimedFiscalOutboxEvent[]>`
      WITH eligible AS (
        SELECT "id"
        FROM "billing_outbox_events"
        WHERE "eventType" = ${FISCAL_OUTBOX_EVENT_TYPE}
          AND "eventVersion" = ${FISCAL_OUTBOX_EVENT_VERSION}
          AND (
            (
              "status" = 'PENDING'
              AND "availableAt" <= ${claimedAt}
              AND "attemptCount" < "maximumAttempts"
            )
            OR
            (
              "status" = 'PROCESSING'
              AND "lockedAt" < ${leaseCutoff}
            )
          )
        ORDER BY "availableAt" ASC, "createdAt" ASC
        LIMIT ${FISCAL_OUTBOX_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "billing_outbox_events" AS event
      SET "status" = 'PROCESSING',
          "attemptCount" = CASE
            WHEN event."status" = 'PENDING' THEN event."attemptCount" + 1
            ELSE event."attemptCount"
          END,
          "lockedAt" = ${claimedAt},
          "lockedBy" = ${this.lockOwner},
          "lastAttemptAt" = ${claimedAt},
          "updatedAt" = ${claimedAt}
      FROM eligible
      WHERE event."id" = eligible."id"
      RETURNING event."id", event."tenantId", event."eventType",
        event."eventVersion", event."aggregateType", event."aggregateId",
        event."payload", event."attemptCount", event."maximumAttempts"
    `);
  }

  private async publishClaimedEvent(
    event: ClaimedFiscalOutboxEvent,
  ): Promise<void> {
    const payload = this.validPayload(event);
    if (!payload) {
      await this.finishClaim(event, {
        status: "FAILED",
        lastError: INVALID_EVENT_ERROR,
      });
      return;
    }

    try {
      await this.jobDispatcher.dispatch<FiscalIssuanceEventPayload>({
        queueKey: PLATFORM_QUEUE_KEYS.FISCAL_BILLING,
        jobName: FISCAL_ISSUANCE_JOB_NAME,
        payload,
        metadata: { tenantId: event.tenantId },
        options: {
          jobId: fiscalIssuanceJobId(event.id),
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: false,
          removeOnFail: false,
        },
      });
    } catch {
      await this.recordDispatchFailure(event);
      return;
    }
    await this.finishClaim(event, {
      status: "PROCESSED",
      processedAt: new Date(),
      lastError: null,
    });
  }

  private validPayload(
    event: ClaimedFiscalOutboxEvent,
  ): FiscalIssuanceEventPayload | null {
    if (
      event.eventType !== FISCAL_OUTBOX_EVENT_TYPE ||
      event.eventVersion !== FISCAL_OUTBOX_EVENT_VERSION ||
      event.aggregateType !== FISCAL_OUTBOX_AGGREGATE_TYPE ||
      !isJsonObject(event.payload) ||
      Object.keys(event.payload).length !== 3
    ) {
      return null;
    }
    const { tenantId, billingDocumentId, eventVersion } = event.payload;
    if (
      typeof tenantId !== "string" ||
      !tenantId ||
      tenantId !== event.tenantId ||
      typeof billingDocumentId !== "string" ||
      !billingDocumentId ||
      billingDocumentId !== event.aggregateId ||
      eventVersion !== FISCAL_OUTBOX_EVENT_VERSION
    ) {
      return null;
    }
    return { tenantId, billingDocumentId, eventVersion };
  }

  private async recordDispatchFailure(
    event: ClaimedFiscalOutboxEvent,
  ): Promise<void> {
    if (event.attemptCount >= event.maximumAttempts) {
      await this.finishClaim(event, {
        status: "FAILED",
        lastError: DISPATCH_ERROR,
      });
      return;
    }
    const exponent = Math.min(Math.max(event.attemptCount - 1, 0), 30);
    const delayMs = Math.min(
      FISCAL_OUTBOX_RETRY_BASE_MS * 2 ** exponent,
      FISCAL_OUTBOX_RETRY_MAX_MS,
    );
    await this.finishClaim(event, {
      status: "PENDING",
      availableAt: new Date(Date.now() + delayMs),
      lastError: DISPATCH_ERROR,
    });
  }

  private async finishClaim(
    event: ClaimedFiscalOutboxEvent,
    data: Prisma.BillingOutboxEventUpdateManyMutationInput,
  ): Promise<void> {
    await this.prisma.billingOutboxEvent.updateMany({
      where: {
        id: event.id,
        tenantId: event.tenantId,
        status: "PROCESSING",
        lockedBy: this.lockOwner,
      },
      data: { ...data, lockedAt: null, lockedBy: null },
    });
  }
}

function isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
