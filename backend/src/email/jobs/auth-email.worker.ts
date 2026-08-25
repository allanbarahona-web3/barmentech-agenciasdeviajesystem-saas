import { Injectable, OnModuleInit } from "@nestjs/common";
import { Job } from "bullmq";
import { JobEnvelope } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import { WorkerService } from "../../infrastructure/worker";
import { EmailService } from "../email.service";
import { BILLING_FINANCIAL_EMAIL_JOB_NAMES } from "./billing-financial-email-job.constants";
import { CONTRACTS_EMAIL_JOB_NAMES } from "./contracts-email-job.constants";
import { SIGNED_DOCUMENT_EMAIL_JOB_NAMES } from "./signed-document-email-job.constants";
import { AUTH_EMAIL_JOB_NAMES, AUTH_EMAIL_WORKER_REGISTRATION_KEY } from "./auth-email-job.constants";
import { AuthEmailJobPayload } from "./auth-email-job.types";

@Injectable()
export class AuthEmailWorker implements OnModuleInit {
  constructor(
    private readonly workerService: WorkerService,
    private readonly emailService: EmailService,
  ) {}

  onModuleInit(): void {
    this.workerService.registerWorker(
      AUTH_EMAIL_WORKER_REGISTRATION_KEY,
      PLATFORM_QUEUE_KEYS.EMAIL,
      (job: Job<JobEnvelope<AuthEmailJobPayload>>) => this.process(job),
      {
        jobNames: [
          ...Object.values(AUTH_EMAIL_JOB_NAMES),
          ...Object.values(CONTRACTS_EMAIL_JOB_NAMES),
          ...Object.values(BILLING_FINANCIAL_EMAIL_JOB_NAMES),
          ...Object.values(SIGNED_DOCUMENT_EMAIL_JOB_NAMES),
        ],
      },
    );
  }

  private async process(
    job: Job<JobEnvelope<AuthEmailJobPayload>>,
  ): Promise<void> {
    const result = await this.emailService.sendEmail(job.data.payload.options);
    if (!result.success) {
      throw new Error(result.error || "Email delivery failed.");
    }
  }
}
