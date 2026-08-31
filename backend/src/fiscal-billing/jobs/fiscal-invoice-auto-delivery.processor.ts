import { Injectable, OnModuleInit } from "@nestjs/common";
import { UnrecoverableError, type Job } from "bullmq";
import type { JobEnvelope } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import { WorkerService } from "../../infrastructure/worker";
import {
  FiscalInvoiceAutoDeliveryError,
  FiscalInvoiceAutoDeliveryService,
  type ClaimedFiscalInvoiceAutoDelivery,
} from "../fiscal-invoice-auto-delivery.service";
import {
  FISCAL_INVOICE_AUTO_DELIVERY_CONCURRENCY,
  FISCAL_INVOICE_AUTO_DELIVERY_JOB_NAME,
  FISCAL_INVOICE_AUTO_DELIVERY_WORKER_REGISTRATION_KEY,
} from "./fiscal-invoice-auto-delivery.constants";

const INVALID = "FISCAL_INVOICE_AUTO_DELIVERY_JOB_INVALID";

@Injectable()
export class FiscalInvoiceAutoDeliveryProcessor implements OnModuleInit {
  constructor(private readonly workers: WorkerService, private readonly service: FiscalInvoiceAutoDeliveryService) {}
  onModuleInit(): void {
    this.workers.registerWorker(
      FISCAL_INVOICE_AUTO_DELIVERY_WORKER_REGISTRATION_KEY,
      PLATFORM_QUEUE_KEYS.FISCAL_INVOICE_AUTO_DELIVERY,
      (job) => this.process(job as Job<JobEnvelope<unknown>>),
      { concurrency: FISCAL_INVOICE_AUTO_DELIVERY_CONCURRENCY, jobNames: FISCAL_INVOICE_AUTO_DELIVERY_JOB_NAME },
    );
  }
  private async process(job: Job<JobEnvelope<unknown>>): Promise<{ completed: true }> {
    const claim = validJob(job);
    try {
      await this.service.processClaimedDelivery(claim);
    } catch (error) {
      if (error instanceof FiscalInvoiceAutoDeliveryError && !error.retryable) {
        await this.service.failClaim(claim, error.code);
        throw new UnrecoverableError(error.code);
      }
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) await this.service.releaseClaimAfterWorkerFailure(claim);
      throw error;
    }
    return { completed: true };
  }
}

function validJob(job: Job<JobEnvelope<unknown>>): ClaimedFiscalInvoiceAutoDelivery {
  const payload = job.data?.payload;
  if (job.name !== FISCAL_INVOICE_AUTO_DELIVERY_JOB_NAME || !record(payload) || Object.keys(payload).length !== 4 || payload.eventVersion !== 1 || !safe(payload.tenantId) || !safe(payload.outboxEventId) || !safe(payload.lockOwner, 100)) throw new UnrecoverableError(INVALID);
  return { tenantId: payload.tenantId, billingOutboxEventId: payload.outboxEventId, lockOwner: payload.lockOwner };
}
function safe(value: unknown, max = 191): value is string { return typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value && !value.includes(":"); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
