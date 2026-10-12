import { Injectable, OnModuleInit } from "@nestjs/common";
import { Job } from "bullmq";
import { ContractReservationPaymentService } from "../../finance/contract-reservation-payment.service";
import { JobEnvelope } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import { WorkerService } from "../../infrastructure/worker";
import { PrismaService } from "../../prisma/prisma.service";
import {
  CONTRACT_RESERVATION_PAYMENT_SUBMISSION_JOB_NAME,
  CONTRACT_RESERVATION_PAYMENT_SUBMISSION_WORKER_REGISTRATION_KEY,
} from "./contract-reservation-payment-submission-job.constants";
import { ContractReservationPaymentSubmissionJobPayload } from "./contract-reservation-payment-submission-job.types";

@Injectable()
export class ContractReservationPaymentSubmissionWorker implements OnModuleInit {
  constructor(
    private readonly workerService: WorkerService,
    private readonly prisma: PrismaService,
    private readonly contractReservationPayments: ContractReservationPaymentService,
  ) {}

  onModuleInit(): void {
    this.workerService.registerWorker(
      CONTRACT_RESERVATION_PAYMENT_SUBMISSION_WORKER_REGISTRATION_KEY,
      PLATFORM_QUEUE_KEYS.CONTRACT_RESERVATION_PAYMENT_SUBMISSION,
      (
        job: Job<
          JobEnvelope<ContractReservationPaymentSubmissionJobPayload>
        >,
      ) => this.process(job),
      { jobNames: CONTRACT_RESERVATION_PAYMENT_SUBMISSION_JOB_NAME },
    );
  }

  private async process(
    job: Job<JobEnvelope<ContractReservationPaymentSubmissionJobPayload>>,
  ): Promise<void> {
    if (job.name !== CONTRACT_RESERVATION_PAYMENT_SUBMISSION_JOB_NAME) {
      throw new Error(
        `Unsupported contract reservation payment submission job: ${job.name}.`,
      );
    }

    const { contractId } = job.data.payload;
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        tenantId: true,
        clientId: true,
        createdAt: true,
        paymentReference: true,
        commercialTotal: true,
        paymentConditionType: true,
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
  }
}

function reservationPaymentMethodOf(payload: unknown): string {
  const value =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).paymentMethod
      : undefined;
  return typeof value === "string" ? value : "";
}
