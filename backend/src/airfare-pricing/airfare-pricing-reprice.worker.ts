import { Injectable, OnModuleInit } from "@nestjs/common";
import type { Job } from "bullmq";
import type { JobEnvelope } from "../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../infrastructure/queue";
import { WorkerService } from "../infrastructure/worker";
import { AirfarePricingRepriceProcessorService } from "./airfare-pricing-reprice-processor.service";
import { AIRFARE_PRICING_CONCURRENCY, AIRFARE_PRICING_JOB_NAME, AIRFARE_PRICING_WORKER_KEY, type AirfarePricingJobPayload } from "./airfare-pricing-job.constants";

@Injectable()
export class AirfarePricingRepriceWorker implements OnModuleInit {
  constructor(private readonly workers: WorkerService, private readonly processor: AirfarePricingRepriceProcessorService) {}
  onModuleInit() { this.workers.registerWorker(AIRFARE_PRICING_WORKER_KEY, PLATFORM_QUEUE_KEYS.AIRFARE_PRICING, (job) => this.process(job as Job<JobEnvelope<unknown>>), { concurrency: AIRFARE_PRICING_CONCURRENCY, jobNames: AIRFARE_PRICING_JOB_NAME }); }
  private async process(job: Job<JobEnvelope<unknown>>) {
    if (job.name !== AIRFARE_PRICING_JOB_NAME) throw new Error("AIRFARE_PRICING_JOB_UNSUPPORTED");
    const payload = job.data?.payload;
    if (!valid(payload)) throw new Error("AIRFARE_PRICING_JOB_INVALID");
    return this.processor.process(payload.tenantId, payload.requestId);
  }
}
function valid(value: unknown): value is AirfarePricingJobPayload { return !!value && typeof value === "object" && !Array.isArray(value) && (value as any).eventVersion === 1 && safe((value as any).tenantId) && safe((value as any).requestId); }
function safe(value: unknown) { return typeof value === "string" && value.length > 0 && value.length <= 191 && value.trim() === value && !value.includes(":"); }
