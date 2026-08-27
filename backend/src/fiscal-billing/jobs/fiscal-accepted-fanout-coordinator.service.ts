import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import {
  ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_TYPE,
  ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_VERSION,
  accountReceivableRecognitionDeduplicationKey,
  FISCAL_ACCEPTED_FANOUT_AGGREGATE_TYPE,
  FISCAL_ACCEPTED_FANOUT_BATCH_SIZE,
  FISCAL_ACCEPTED_FANOUT_PARENT_EVENT_TYPE,
  FISCAL_ACCEPTED_FANOUT_PARENT_EVENT_VERSION,
  FISCAL_ACCEPTED_FANOUT_POLL_INTERVAL_MS,
  FISCAL_ACCEPTED_FANOUT_PROCESSING_LEASE_MS,
  FISCAL_ACCEPTED_FANOUT_RETRY_BASE_MS,
  FISCAL_ACCEPTED_FANOUT_RETRY_MAX_MS,
} from "./fiscal-accepted-fanout.constants";

interface ClaimedAcceptedEvent {
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

interface AcceptedEventPayload {
  tenantId: string;
  billingDocumentId: string;
  eventVersion: number;
}

const INVALID_PARENT_ERROR = "FISCAL_ACCEPTED_FANOUT_PARENT_INVALID";
const CHILD_CONFLICT_ERROR = "FISCAL_ACCEPTED_FANOUT_CHILD_CONFLICT";
const FANOUT_ERROR = "FISCAL_ACCEPTED_FANOUT_FAILED";
const CLAIM_LOST_ERROR = "FISCAL_ACCEPTED_FANOUT_CLAIM_LOST";

class FanoutError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

@Injectable()
export class FiscalAcceptedFanoutCoordinatorService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(FiscalAcceptedFanoutCoordinatorService.name);
  private readonly lockOwner = `fiscal-accepted-fanout-${process.pid}-${randomUUID()}`;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private activeCycle: Promise<void> | null = null;
  private stopping = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.scheduleNextCycle(0);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.activeCycle;
  }

  async fanOutAvailableEvents(): Promise<void> {
    const claimed = await this.claimBatch();
    for (const event of claimed) {
      try {
        await this.fanOutClaimedEvent(event);
      } catch {
        this.logger.error("Fiscal accepted outbox fan-out failed.");
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
    const cycle = this.fanOutAvailableEvents().catch(() => {
      this.logger.error("Fiscal accepted fan-out polling cycle failed.");
    });
    this.activeCycle = cycle;
    try {
      await cycle;
    } finally {
      this.activeCycle = null;
      this.scheduleNextCycle(FISCAL_ACCEPTED_FANOUT_POLL_INTERVAL_MS);
    }
  }

  private claimBatch(): Promise<ClaimedAcceptedEvent[]> {
    const claimedAt = new Date();
    const leaseCutoff = new Date(
      claimedAt.getTime() - FISCAL_ACCEPTED_FANOUT_PROCESSING_LEASE_MS,
    );
    return this.prisma.$transaction((tx) => tx.$queryRaw<ClaimedAcceptedEvent[]>`
      WITH eligible AS (
        SELECT "id"
        FROM "billing_outbox_events"
        WHERE "eventType" = ${FISCAL_ACCEPTED_FANOUT_PARENT_EVENT_TYPE}
          AND "eventVersion" = ${FISCAL_ACCEPTED_FANOUT_PARENT_EVENT_VERSION}
          AND (
            ("status" = 'PENDING' AND "availableAt" <= ${claimedAt}
              AND "attemptCount" < "maximumAttempts")
            OR ("status" = 'PROCESSING' AND "lockedAt" < ${leaseCutoff})
          )
        ORDER BY "availableAt" ASC, "createdAt" ASC
        LIMIT ${FISCAL_ACCEPTED_FANOUT_BATCH_SIZE}
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

  private async fanOutClaimedEvent(event: ClaimedAcceptedEvent): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "billing_outbox_events"
          WHERE "id" = ${event.id}
            AND "tenantId" = ${event.tenantId}
            AND "status" = 'PROCESSING'
            AND "lockedBy" = ${this.lockOwner}
          FOR UPDATE
        `;
        if (locked.length !== 1) throw new FanoutError(CLAIM_LOST_ERROR);

        const parent = await tx.billingOutboxEvent.findUnique({
          where: { id: event.id },
        });
        const payload = parent && validParentPayload(parent);
        if (!parent || !payload) throw new FanoutError(INVALID_PARENT_ERROR);

        const deduplicationKey = accountReceivableRecognitionDeduplicationKey(
          payload.billingDocumentId,
        );
        await tx.billingOutboxEvent.createMany({
          data: {
            tenantId: parent.tenantId,
            eventType: ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_TYPE,
            eventVersion: ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_VERSION,
            aggregateType: parent.aggregateType,
            aggregateId: parent.aggregateId,
            causationId: parent.id,
            deduplicationKey,
            payload: {
              tenantId: payload.tenantId,
              billingDocumentId: payload.billingDocumentId,
              eventVersion: payload.eventVersion,
            },
          },
          skipDuplicates: true,
        });
        const child = await tx.billingOutboxEvent.findUnique({
          where: {
            tenantId_deduplicationKey: {
              tenantId: parent.tenantId,
              deduplicationKey,
            },
          },
        });
        if (!child || !isExactReceivableChild(child, parent, payload, deduplicationKey)) {
          throw new FanoutError(CHILD_CONFLICT_ERROR);
        }

        const completed = await tx.billingOutboxEvent.updateMany({
          where: {
            id: parent.id,
            tenantId: parent.tenantId,
            status: "PROCESSING",
            lockedBy: this.lockOwner,
          },
          data: {
            status: "PROCESSED",
            processedAt: new Date(),
            lastError: null,
            lockedAt: null,
            lockedBy: null,
          },
        });
        if (completed.count !== 1) throw new FanoutError(CLAIM_LOST_ERROR);
      });
    } catch (error) {
      if (error instanceof FanoutError && error.code === CLAIM_LOST_ERROR) return;
      await this.recordFailure(
        event,
        error instanceof FanoutError ? error.code : FANOUT_ERROR,
      );
    }
  }

  private async recordFailure(
    event: ClaimedAcceptedEvent,
    errorCode: string,
  ): Promise<void> {
    if (
      errorCode === INVALID_PARENT_ERROR ||
      errorCode === CHILD_CONFLICT_ERROR ||
      event.attemptCount >= event.maximumAttempts
    ) {
      await this.finishClaim(event, { status: "FAILED", lastError: errorCode });
      return;
    }
    const exponent = Math.min(Math.max(event.attemptCount - 1, 0), 30);
    const delayMs = Math.min(
      FISCAL_ACCEPTED_FANOUT_RETRY_BASE_MS * 2 ** exponent,
      FISCAL_ACCEPTED_FANOUT_RETRY_MAX_MS,
    );
    await this.finishClaim(event, {
      status: "PENDING",
      availableAt: new Date(Date.now() + delayMs),
      lastError: errorCode,
    });
  }

  private async finishClaim(
    event: ClaimedAcceptedEvent,
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

function validParentPayload(
  parent: {
    tenantId: string;
    eventType: string;
    eventVersion: number;
    aggregateType: string;
    aggregateId: string;
    payload: Prisma.JsonValue;
  },
): AcceptedEventPayload | null {
  if (
    parent.eventType !== FISCAL_ACCEPTED_FANOUT_PARENT_EVENT_TYPE ||
    parent.eventVersion !== FISCAL_ACCEPTED_FANOUT_PARENT_EVENT_VERSION ||
    parent.aggregateType !== FISCAL_ACCEPTED_FANOUT_AGGREGATE_TYPE ||
    !isJsonObject(parent.payload) ||
    Object.keys(parent.payload).length !== 3
  ) return null;
  const { tenantId, billingDocumentId, eventVersion } = parent.payload;
  if (
    typeof tenantId !== "string" || !tenantId || tenantId !== parent.tenantId ||
    typeof billingDocumentId !== "string" || !billingDocumentId ||
    billingDocumentId !== parent.aggregateId ||
    eventVersion !== FISCAL_ACCEPTED_FANOUT_PARENT_EVENT_VERSION
  ) return null;
  return { tenantId, billingDocumentId, eventVersion };
}

function isExactReceivableChild(
  child: {
    tenantId: string;
    eventType: string;
    eventVersion: number;
    aggregateType: string;
    aggregateId: string;
    causationId: string | null;
    deduplicationKey: string | null;
    payload: Prisma.JsonValue;
  },
  parent: { id: string; tenantId: string; aggregateType: string; aggregateId: string },
  payload: AcceptedEventPayload,
  deduplicationKey: string,
): boolean {
  return child.tenantId === parent.tenantId &&
    child.eventType === ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_TYPE &&
    child.eventVersion === ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_VERSION &&
    child.aggregateType === parent.aggregateType &&
    child.aggregateId === parent.aggregateId &&
    child.causationId === parent.id &&
    child.deduplicationKey === deduplicationKey &&
    isExactPayload(child.payload, payload);
}

function isExactPayload(value: Prisma.JsonValue, expected: AcceptedEventPayload): boolean {
  return isJsonObject(value) && Object.keys(value).length === 3 &&
    value.tenantId === expected.tenantId &&
    value.billingDocumentId === expected.billingDocumentId &&
    value.eventVersion === expected.eventVersion;
}

function isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
