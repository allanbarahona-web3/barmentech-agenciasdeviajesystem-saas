import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Job } from "bullmq";
import { JobEnvelope } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import { WorkerService } from "../../infrastructure/worker";
import { PrismaService } from "../../prisma/prisma.service";
import { BillingService } from "../../billing/billing.service";
import { PackageCompletedDeliveryService } from "../../documents/package-completed-delivery.service";
import {
  PACKAGE_COMPLETED_JOB_NAME,
  PACKAGE_COMPLETED_WORKER_REGISTRATION_KEY,
} from "./package-completed-job.constants";
import { PackageCompletedJobPayload } from "./package-completed-job.types";

@Injectable()
export class PackageCompletedWorker implements OnModuleInit {
  private readonly logger = new Logger(PackageCompletedWorker.name);

  constructor(
    private readonly workerService: WorkerService,
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
    private readonly packageCompletedDeliveryService: PackageCompletedDeliveryService,
  ) {}

  onModuleInit(): void {
    this.workerService.registerWorker(
      PACKAGE_COMPLETED_WORKER_REGISTRATION_KEY,
      PLATFORM_QUEUE_KEYS.PACKAGE_COMPLETED,
      (job: Job<JobEnvelope<PackageCompletedJobPayload>>) => this.process(job),
      { jobNames: PACKAGE_COMPLETED_JOB_NAME },
    );
  }

  private async process(
    job: Job<JobEnvelope<PackageCompletedJobPayload>>,
  ): Promise<void> {
    if (job.name !== PACKAGE_COMPLETED_JOB_NAME) {
      throw new Error(`Unsupported package completion job: ${job.name}.`);
    }

    const payload = job.data.payload;
    const session = await this.prisma.documentSigningSession.findUnique({
      where: { id: payload.documentSigningSessionId },
      select: {
        id: true,
        contractId: true,
        tenantId: true,
        status: true,
        completedAt: true,
        contract: {
          select: {
            generatedByUserId: true,
            generatedByEmail: true,
            generatedByName: true,
          },
        },
      },
    });

    if (
      !session ||
      session.contractId !== payload.contractId ||
      session.tenantId !== payload.tenantId ||
      String(session.contract.generatedByUserId || "system") !==
        payload.actorUserId
    ) {
      throw new Error(
        `PackageCompleted authoritative session data does not match job ${job.id ?? "unknown"}.`,
      );
    }

    await this.billingService.autoIssueAndSendInvoiceToTitular({
      contractId: payload.contractId,
      actorUserId: payload.actorUserId,
      actorEmail: String(
        session.contract.generatedByEmail || "system@local",
      ),
      actorName: String(session.contract.generatedByName || "Sistema"),
    });

    await this.packageCompletedDeliveryService.deliver(payload.contractId);

    this.logger.log(
      `PackageCompleted received contractId=${session.contractId} ` +
        `sessionId=${session.id} status=${session.status} ` +
        `correlationId=${payload.correlationId} version=${payload.eventVersion}.`,
    );
  }
}
