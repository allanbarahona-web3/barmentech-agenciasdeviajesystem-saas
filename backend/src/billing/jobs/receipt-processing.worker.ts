import { Injectable, OnModuleInit } from "@nestjs/common";
import { Job } from "bullmq";
import { JobEnvelope } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import { WorkerService } from "../../infrastructure/worker";
import { PrismaService } from "../../prisma/prisma.service";
import { BillingService } from "../billing.service";
import { BILLING_BOOTSTRAP_JOB_NAME } from "./billing-bootstrap-job.constants";
import { BillingBootstrapJobPayload } from "./billing-bootstrap-job.types";
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
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.workerService.registerWorker(
      RECEIPT_PROCESSING_WORKER_REGISTRATION_KEY,
      PLATFORM_QUEUE_KEYS.BILLING,
      (
        job: Job<
          JobEnvelope<
            ReceiptProcessingJobPayload | BillingBootstrapJobPayload
          >
        >,
      ) => this.process(job),
    );
  }

  private async process(
    job: Job<
      JobEnvelope<ReceiptProcessingJobPayload | BillingBootstrapJobPayload>
    >,
  ): Promise<void> {
    if (job.name === RECEIPT_PROCESSING_JOB_NAME) {
      await this.billingService.processVerifiedPaymentReceiptJob(
        job.data.payload as ReceiptProcessingJobPayload,
      );
      return;
    }

    if (job.name === BILLING_BOOTSTRAP_JOB_NAME) {
      const { contractId } = job.data.payload as BillingBootstrapJobPayload;
      const contract = await this.prisma.contract.findUnique({
        where: { id: contractId },
        select: {
          generatedByUserId: true,
          generatedByEmail: true,
          generatedByName: true,
        },
      });

      if (!contract) {
        throw new Error(`Contract not found: ${contractId}.`);
      }

      await this.billingService.bootstrapContractBilling(
        {
          id: contract.generatedByUserId,
          email: contract.generatedByEmail,
          fullName: contract.generatedByName,
        },
        contractId,
        null,
        null,
      );
      return;
    }

    throw new Error(`Unsupported billing job: ${job.name}.`);
  }
}
