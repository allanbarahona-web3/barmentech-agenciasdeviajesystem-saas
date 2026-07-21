import { Injectable, OnModuleInit } from "@nestjs/common";
import { Job } from "bullmq";
import { JobEnvelope } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import { WorkerService } from "../../infrastructure/worker";
import { EmailService } from "../email.service";
import {
  AUTH_EMAIL_WORKER_REGISTRATION_KEY,
} from "./auth-email-job.constants";
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
