import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { JobDispatcherService } from "../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../infrastructure/queue";
import { PrismaService } from "../prisma/prisma.service";
import {
  CONTRACT_PAYMENT_FISCALIZATION_BATCH_SIZE,
  CONTRACT_PAYMENT_FISCALIZATION_EVENT_TYPE,
  CONTRACT_PAYMENT_FISCALIZATION_EVENT_VERSION,
  CONTRACT_PAYMENT_FISCALIZATION_JOB_NAME,
  CONTRACT_PAYMENT_FISCALIZATION_LEASE_MS,
  CONTRACT_PAYMENT_FISCALIZATION_POLL_INTERVAL_MS,
  CONTRACT_PAYMENT_FISCALIZATION_RETRY_BASE_MS,
  CONTRACT_PAYMENT_FISCALIZATION_RETRY_MAX_MS,
  contractPaymentFiscalizationJobId,
} from "./contract-payment-fiscalization.constants";

const INVALID_EVENT_ERROR = "CONTRACT_PAYMENT_FISCALIZATION_OUTBOX_INVALID";
const DISPATCH_ERROR = "CONTRACT_PAYMENT_FISCALIZATION_DISPATCH_FAILED";

type ClaimedEvent = {
  id: string;
  tenantId: string;
  eventType: string;
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.JsonValue;
  attemptCount: number;
  maximumAttempts: number;
  lockedBy: string | null;
};

@Injectable()
export class ContractPaymentFiscalizationPublisher
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ContractPaymentFiscalizationPublisher.name);
  private readonly lockOwner = `contract-payment-fiscalization-${process.pid}-${randomUUID()}`;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private activeCycle: Promise<void> | null = null;
  private stopping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: JobDispatcherService,
  ) {}

  onModuleInit(): void {
    this.schedule(0);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.activeCycle;
  }

  async publishAvailableEvents(): Promise<void> {
    for (const event of await this.claimBatch()) {
      try {
        await this.publish(event);
      } catch {
        this.logger.error("Contract payment fiscalization outbox publishing failed.");
      }
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.cycle();
    }, delayMs);
  }

  private async cycle(): Promise<void> {
    if (this.stopping || this.activeCycle) return;
    const active = this.publishAvailableEvents().catch(() => {
      this.logger.error("Contract payment fiscalization poller failed.");
    });
    this.activeCycle = active;
    try {
      await active;
    } finally {
      this.activeCycle = null;
      this.schedule(CONTRACT_PAYMENT_FISCALIZATION_POLL_INTERVAL_MS);
    }
  }

  private claimBatch(): Promise<ClaimedEvent[]> {
    const claimedAt = new Date();
    const leaseCutoff = new Date(claimedAt.getTime() - CONTRACT_PAYMENT_FISCALIZATION_LEASE_MS);
    return this.prisma.$transaction((tx) => tx.$queryRaw<ClaimedEvent[]>`
      WITH eligible AS (
        SELECT "id"
        FROM "billing_outbox_events"
        WHERE "eventType" = ${CONTRACT_PAYMENT_FISCALIZATION_EVENT_TYPE}
          AND "eventVersion" = ${CONTRACT_PAYMENT_FISCALIZATION_EVENT_VERSION}
          AND "attemptCount" < "maximumAttempts"
          AND (("status" = 'PENDING' AND "availableAt" <= ${claimedAt})
            OR ("status" = 'PROCESSING' AND "lockedAt" < ${leaseCutoff}))
        ORDER BY "availableAt" ASC, "createdAt" ASC
        LIMIT ${CONTRACT_PAYMENT_FISCALIZATION_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "billing_outbox_events" AS event
      SET "status" = 'PROCESSING',
          "attemptCount" = event."attemptCount" + 1,
          "lockedAt" = ${claimedAt},
          "lockedBy" = ${this.lockOwner} || '-' || event."id",
          "lastAttemptAt" = ${claimedAt},
          "updatedAt" = ${claimedAt}
      FROM eligible
      WHERE event."id" = eligible."id"
      RETURNING event."id", event."tenantId", event."eventType", event."eventVersion",
        event."aggregateType", event."aggregateId", event."payload", event."attemptCount",
        event."maximumAttempts", event."lockedBy"
    `);
  }

  private async publish(event: ClaimedEvent): Promise<void> {
    const payload = validPayload(event);
    if (!payload || !event.lockedBy) {
      await this.finish(event, { status: "FAILED", lastError: INVALID_EVENT_ERROR });
      return;
    }
    try {
      await this.dispatcher.dispatch({
        queueKey: PLATFORM_QUEUE_KEYS.CONTRACT_PAYMENT_FISCALIZATION,
        jobName: CONTRACT_PAYMENT_FISCALIZATION_JOB_NAME,
        payload: {
          tenantId: payload.tenantId,
          outboxEventId: event.id,
          lockOwner: event.lockedBy,
          eventVersion: 1,
        },
        metadata: { tenantId: event.tenantId },
        options: {
          jobId: contractPaymentFiscalizationJobId(event.id, event.attemptCount, event.lockedBy),
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

  private async recordDispatchFailure(event: ClaimedEvent): Promise<void> {
    if (event.attemptCount >= event.maximumAttempts) {
      await this.finish(event, { status: "FAILED", lastError: DISPATCH_ERROR });
      return;
    }
    const exponent = Math.min(Math.max(event.attemptCount - 1, 0), 30);
    const delayMs = Math.min(
      CONTRACT_PAYMENT_FISCALIZATION_RETRY_BASE_MS * 2 ** exponent,
      CONTRACT_PAYMENT_FISCALIZATION_RETRY_MAX_MS,
    );
    await this.finish(event, {
      status: "PENDING",
      availableAt: new Date(Date.now() + delayMs),
      lastError: DISPATCH_ERROR,
    });
  }

  private async finish(
    event: ClaimedEvent,
    data: Prisma.BillingOutboxEventUpdateManyMutationInput,
  ): Promise<void> {
    await this.prisma.billingOutboxEvent.updateMany({
      where: {
        id: event.id,
        tenantId: event.tenantId,
        status: "PROCESSING",
        lockedBy: event.lockedBy,
      },
      data: { ...data, lockedAt: null, lockedBy: null },
    });
  }
}

function validPayload(event: ClaimedEvent): { tenantId: string; paymentId: string } | null {
  if (
    event.eventType !== CONTRACT_PAYMENT_FISCALIZATION_EVENT_TYPE ||
    event.eventVersion !== CONTRACT_PAYMENT_FISCALIZATION_EVENT_VERSION ||
    event.aggregateType !== "Payment" ||
    !jsonObject(event.payload) || Object.keys(event.payload).length !== 3
  ) return null;
  const { tenantId, paymentId, eventVersion } = event.payload;
  if (
    typeof tenantId !== "string" || tenantId !== event.tenantId || !tenantId ||
    typeof paymentId !== "string" || paymentId !== event.aggregateId || !paymentId ||
    eventVersion !== CONTRACT_PAYMENT_FISCALIZATION_EVENT_VERSION
  ) return null;
  return { tenantId, paymentId };
}

function jsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
