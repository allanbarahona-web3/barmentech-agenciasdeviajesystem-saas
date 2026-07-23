import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Job } from "bullmq";
import {
  JobDispatcherService,
  JobEnvelope,
} from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import { WorkerService } from "../../infrastructure/worker";
import { PrismaService } from "../../prisma/prisma.service";
import {
  BILLING_BOOTSTRAP_JOB_NAME,
  BILLING_BOOTSTRAP_JOB_OPTIONS,
} from "../../billing/jobs/billing-bootstrap-job.constants";
import type { BillingBootstrapJobPayload } from "../../billing/jobs/billing-bootstrap-job.types";
import { ContractsService } from "../contracts.service";
import {
  ARCHIVE_PROCESSING_JOB_NAME,
  ARCHIVE_PROCESSING_WORKER_REGISTRATION_KEY,
} from "./archive-processing-job.constants";
import { ArchiveProcessingJobPayload } from "./archive-processing-job.types";

@Injectable()
export class ArchiveProcessingWorker implements OnModuleInit {
  private readonly logger = new Logger(ArchiveProcessingWorker.name);

  constructor(
    private readonly workerService: WorkerService,
    private readonly prisma: PrismaService,
    private readonly contractsService: ContractsService,
    private readonly jobDispatcher: JobDispatcherService,
  ) {}

  onModuleInit(): void {
    this.workerService.registerWorker(
      ARCHIVE_PROCESSING_WORKER_REGISTRATION_KEY,
      PLATFORM_QUEUE_KEYS.DOCUMENT,
      (job: Job<JobEnvelope<ArchiveProcessingJobPayload>>) => this.process(job),
    );
  }

  private async process(
    job: Job<JobEnvelope<ArchiveProcessingJobPayload>>,
  ): Promise<void> {
    if (job.name !== ARCHIVE_PROCESSING_JOB_NAME) {
      throw new Error(`Unsupported document job: ${job.name}.`);
    }

    const { contractId } = job.data.payload;
    this.logger.log(`Contract archive job started contractId=${contractId}.`);

    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        contractNumber: true,
        internalTripId: true,
        htmlObjectKey: true,
        paymentReference: true,
        payload: true,
        tenantId: true,
        clientId: true,
        documents: {
          select: {
            originalFileName: true,
            objectKey: true,
            mimeType: true,
            size: true,
          },
        },
      },
    });

    if (!contract) {
      throw new Error(`Contract not found: ${contractId}.`);
    }

    const baseFolder =
      await this.contractsService.processContractArchiveArtifactsForWorker(
        contract,
      );

    await this.contractsService.processAdditionalArchiveDocumentsForWorker(
      contract,
      baseFolder,
    );

    await this.contractsService.registerContractCustomerDocumentsForWorker(
      contract,
    );

    await this.jobDispatcher.dispatch<BillingBootstrapJobPayload>({
      queueKey: PLATFORM_QUEUE_KEYS.BILLING,
      jobName: BILLING_BOOTSTRAP_JOB_NAME,
      payload: { contractId: contract.id },
      metadata: { tenantId: contract.tenantId },
      options: {
        ...BILLING_BOOTSTRAP_JOB_OPTIONS,
        jobId: `billing-bootstrap-contract-${contract.id}`,
      },
    });

    this.logger.log(`Contract archive job completed contractId=${contract.id}.`);
  }
}
