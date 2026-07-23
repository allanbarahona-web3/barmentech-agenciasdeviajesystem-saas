import { Injectable, OnModuleInit } from "@nestjs/common";
import { Job } from "bullmq";
import { JobEnvelope } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import { WorkerService } from "../../infrastructure/worker";
import { BillingService } from "../billing.service";
import {
  RECEIPT_PROCESSING_JOB_NAME,
  RECEIPT_PROCESSING_WORKER_REGISTRATION_KEY,
} from "./receipt-processing-job.constants";
import { ReceiptProcessingJobPayload } from "./receipt-processing-job.types";

@Injectable()
export class ReceiptProcessingWorker implements OnModuleInit {
  constructor(
    private readonly workerService: WorkerService,
    private readonly billingService: BillingService,
  ) {}

  onModuleInit(): void {
    this.workerService.registerWorker(
      RECEIPT_PROCESSING_WORKER_REGISTRATION_KEY,
      PLATFORM_QUEUE_KEYS.BILLING,
      (job: Job<JobEnvelope<ReceiptProcessingJobPayload>>) => this.process(job),
    );
  }

  private async process(
    job: Job<JobEnvelope<ReceiptProcessingJobPayload>>,
  ): Promise<void> {
    if (job.name !== RECEIPT_PROCESSING_JOB_NAME) {
      throw new Error(`Unsupported billing job: ${job.name}.`);
    }

    await this.billingService.processVerifiedPaymentReceiptJob(
      job.data.payload,
    );
  }
}
