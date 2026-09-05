import { Injectable, OnModuleInit } from "@nestjs/common";
import { Job } from "bullmq";
import { JobEnvelope } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import { WorkerService } from "../../infrastructure/worker";
import { PrismaService } from "../../prisma/prisma.service";
import { BillingService } from "../billing.service";
import { ContractReservationPaymentService } from "../../finance/contract-reservation-payment.service";
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
    private readonly contractReservationPayments: ContractReservationPaymentService,
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
      { jobNames: [RECEIPT_PROCESSING_JOB_NAME, BILLING_BOOTSTRAP_JOB_NAME] },
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
          id: true,
          tenantId: true,
          clientId: true,
          createdAt: true,
          paymentReference: true,
          payload: true,
          generatedByUserId: true,
          generatedByEmail: true,
          generatedByName: true,
          client: { select: { fullName: true } },
          documents: {
            select: {
              kind: true,
              objectKey: true,
              originalFileName: true,
              mimeType: true,
              size: true,
            },
          },
        },
      });

      if (!contract) {
        throw new Error(`Contract not found: ${contractId}.`);
      }

      await this.contractReservationPayments.submit({
        contract: {
          ...contract,
          paymentMethod: reservationPaymentMethodOf(contract.payload),
        },
        actor: { userId: contract.generatedByUserId, name: contract.generatedByName },
      });
      return;
    }

    throw new Error(`Unsupported billing job: ${job.name}.`);
  }
}

function reservationPaymentMethodOf(payload: unknown): string {
  const value = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>).paymentMethod
    : undefined;
  return typeof value === "string" ? value : "";
}
