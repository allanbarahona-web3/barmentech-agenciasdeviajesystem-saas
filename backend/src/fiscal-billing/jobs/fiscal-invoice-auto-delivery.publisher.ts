import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { JobDispatcherService } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import { PrismaService } from "../../prisma/prisma.service";
import { FiscalInvoiceAutoDeliveryService } from "../fiscal-invoice-auto-delivery.service";
import {
  FISCAL_ACCEPTED_FANOUT_AGGREGATE_TYPE,
  FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_TYPE,
  FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_VERSION,
} from "./fiscal-accepted-fanout.constants";
import {
  FISCAL_INVOICE_AUTO_DELIVERY_BATCH_SIZE,
  FISCAL_INVOICE_AUTO_DELIVERY_JOB_NAME,
  FISCAL_INVOICE_AUTO_DELIVERY_LEASE_MS,
  FISCAL_INVOICE_AUTO_DELIVERY_POLL_INTERVAL_MS,
  FISCAL_INVOICE_AUTO_DELIVERY_RETRY_BASE_MS,
  FISCAL_INVOICE_AUTO_DELIVERY_RETRY_MAX_MS,
  fiscalInvoiceAutoDeliveryJobId,
  type FiscalInvoiceAutoDeliveryJobPayload,
} from "./fiscal-invoice-auto-delivery.constants";

interface ClaimedEvent {
  id: string; tenantId: string; eventType: string; eventVersion: number;
  aggregateType: string; aggregateId: string; causationId: string | null;
  payload: Prisma.JsonValue; attemptCount: number; maximumAttempts: number;
}
const INVALID = "FISCAL_INVOICE_AUTO_DELIVERY_OUTBOX_INVALID";
const DISPATCH_FAILED = "FISCAL_INVOICE_AUTO_DELIVERY_DISPATCH_FAILED";

@Injectable()
export class FiscalInvoiceAutoDeliveryPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FiscalInvoiceAutoDeliveryPublisher.name);
  private readonly lockOwner = `fiscal-invoice-auto-delivery-${process.pid}-${randomUUID()}`;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active: Promise<void> | null = null;
  private stopping = false;

  constructor(private readonly prisma: PrismaService, private readonly dispatcher: JobDispatcherService, private readonly delivery: FiscalInvoiceAutoDeliveryService) {}
  onModuleInit(): void { this.schedule(0); }
  async onModuleDestroy(): Promise<void> { this.stopping = true; if (this.timer) clearTimeout(this.timer); this.timer = null; await this.active; }

  async publishAvailableEvents(): Promise<void> {
    const events = await this.claimBatch();
    for (const event of events) {
      try { await this.publish(event); }
      catch { this.logger.error("Fiscal invoice automatic delivery publishing failed."); }
    }
  }

  private schedule(delay: number): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => { this.timer = null; void this.cycle(); }, delay);
  }
  private async cycle(): Promise<void> {
    if (this.stopping || this.active) return;
    const active = this.publishAvailableEvents().catch(() => this.logger.error("Fiscal invoice automatic delivery polling cycle failed."));
    this.active = active;
    try { await active; } finally { this.active = null; this.schedule(FISCAL_INVOICE_AUTO_DELIVERY_POLL_INTERVAL_MS); }
  }

  private claimBatch(): Promise<ClaimedEvent[]> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - FISCAL_INVOICE_AUTO_DELIVERY_LEASE_MS);
    return this.prisma.$transaction((tx) => tx.$queryRaw<ClaimedEvent[]>`
      WITH eligible AS (
        SELECT "id" FROM "billing_outbox_events"
        WHERE "eventType" = ${FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_TYPE}
          AND "eventVersion" = ${FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_VERSION}
          AND "attemptCount" < "maximumAttempts"
          AND (("status" = 'PENDING' AND "availableAt" <= ${now})
            OR ("status" = 'PROCESSING' AND "lockedAt" < ${cutoff}))
        ORDER BY "availableAt", "createdAt"
        LIMIT ${FISCAL_INVOICE_AUTO_DELIVERY_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "billing_outbox_events" event
      SET "status" = 'PROCESSING', "attemptCount" = event."attemptCount" + 1,
          "lockedAt" = ${now}, "lockedBy" = ${this.lockOwner},
          "lastAttemptAt" = ${now}, "updatedAt" = ${now}
      FROM eligible WHERE event."id" = eligible."id"
      RETURNING event."id", event."tenantId", event."eventType", event."eventVersion",
        event."aggregateType", event."aggregateId", event."causationId", event."payload",
        event."attemptCount", event."maximumAttempts"
    `);
  }

  private async publish(event: ClaimedEvent): Promise<void> {
    const payload = validJobPayload(event, this.lockOwner);
    if (!payload) { await this.finish(event, { status: "FAILED", lastError: INVALID }); return; }
    try {
      await this.dispatcher.dispatch<FiscalInvoiceAutoDeliveryJobPayload>({
        queueKey: PLATFORM_QUEUE_KEYS.FISCAL_INVOICE_AUTO_DELIVERY,
        jobName: FISCAL_INVOICE_AUTO_DELIVERY_JOB_NAME,
        payload,
        metadata: { tenantId: event.tenantId },
        options: { jobId: fiscalInvoiceAutoDeliveryJobId(event.id, event.attemptCount, this.lockOwner), attempts: 3, backoff: { type: "exponential", delay: 2_000 }, removeOnComplete: false, removeOnFail: false },
      });
    } catch {
      if (event.attemptCount >= event.maximumAttempts) {
        await this.delivery.failClaim({ tenantId: event.tenantId, billingOutboxEventId: event.id, lockOwner: this.lockOwner }, DISPATCH_FAILED);
        return;
      }
      const delay = Math.min(FISCAL_INVOICE_AUTO_DELIVERY_RETRY_BASE_MS * 2 ** Math.min(Math.max(event.attemptCount - 1, 0), 30), FISCAL_INVOICE_AUTO_DELIVERY_RETRY_MAX_MS);
      await this.finish(event, { status: "PENDING", availableAt: new Date(Date.now() + delay), lastError: DISPATCH_FAILED });
    }
  }

  private finish(event: ClaimedEvent, data: Prisma.BillingOutboxEventUpdateManyMutationInput): Promise<unknown> {
    return this.prisma.billingOutboxEvent.updateMany({ where: { id: event.id, tenantId: event.tenantId, status: "PROCESSING", lockedBy: this.lockOwner }, data: { ...data, lockedAt: null, lockedBy: null } });
  }
}

function validJobPayload(event: ClaimedEvent, lockOwner: string): FiscalInvoiceAutoDeliveryJobPayload | null {
  if (event.eventType !== FISCAL_INVOICE_AUTO_DELIVERY_REQUESTED_EVENT_TYPE || event.eventVersion !== 1 || event.aggregateType !== FISCAL_ACCEPTED_FANOUT_AGGREGATE_TYPE || !safe(event.causationId) || !json(event.payload) || Object.keys(event.payload).length !== 3) return null;
  const payload = event.payload;
  if (payload.tenantId !== event.tenantId || payload.billingDocumentId !== event.aggregateId || payload.eventVersion !== 1 || !safe(payload.billingDocumentId) || !safe(lockOwner, 100)) return null;
  return { tenantId: event.tenantId, outboxEventId: event.id, lockOwner, eventVersion: 1 };
}
function safe(value: unknown, max = 191): value is string { return typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value && !value.includes(":"); }
function json(value: Prisma.JsonValue): value is Prisma.JsonObject { return typeof value === "object" && value !== null && !Array.isArray(value); }
