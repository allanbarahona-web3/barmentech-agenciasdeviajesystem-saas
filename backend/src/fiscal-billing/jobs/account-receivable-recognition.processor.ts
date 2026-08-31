import { Injectable, OnModuleInit } from "@nestjs/common";
import { UnrecoverableError, type Job } from "bullmq";
import type { JobEnvelope } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import { WorkerService } from "../../infrastructure/worker";
import {
  AccountReceivableRecognitionService,
  type ClaimedReceivableRecognitionEvent,
  isNonRetryableRecognitionError,
} from "../account-receivable-recognition.service";
import {
  ACCOUNT_RECEIVABLE_RECOGNITION_JOB_NAME,
  ACCOUNT_RECEIVABLE_RECOGNITION_CONCURRENCY,
  ACCOUNT_RECEIVABLE_RECOGNITION_WORKER_REGISTRATION_KEY,
} from "./account-receivable-recognition.constants";

const JOB_INVALID = "ACCOUNT_RECEIVABLE_RECOGNITION_JOB_INVALID";

@Injectable()
export class AccountReceivableRecognitionProcessor implements OnModuleInit {
  constructor(private readonly workers: WorkerService, private readonly recognition: AccountReceivableRecognitionService) {}

  onModuleInit(): void {
    this.workers.registerWorker(
      ACCOUNT_RECEIVABLE_RECOGNITION_WORKER_REGISTRATION_KEY,
      PLATFORM_QUEUE_KEYS.ACCOUNT_RECEIVABLE_RECOGNITION,
      (job) => this.process(job as Job<JobEnvelope<unknown>>),
      { concurrency: ACCOUNT_RECEIVABLE_RECOGNITION_CONCURRENCY, jobNames: ACCOUNT_RECEIVABLE_RECOGNITION_JOB_NAME },
    );
  }

  private async process(job: Job<JobEnvelope<unknown>>): Promise<{ completed: true }> {
    const claim = validJob(job);
    try {
      await this.recognition.recognizeClaimedEvent(claim);
    } catch (error) {
      if (error instanceof Error && isNonRetryableRecognitionError(error)) {
        await this.recognition.failClaim(claim, error.message);
        throw new UnrecoverableError(error.message);
      }
      if (isFinalJobAttempt(job)) {
        await this.recognition.releaseClaimAfterWorkerFailure(claim);
      }
      throw error;
    }
    return { completed: true };
  }
}

function validJob(job: Job<JobEnvelope<unknown>>): ClaimedReceivableRecognitionEvent {
  const payload = job.data?.payload;
  if (
    job.name !== ACCOUNT_RECEIVABLE_RECOGNITION_JOB_NAME || !isObject(payload) ||
    Object.keys(payload).length !== 4 || payload.eventVersion !== 1 ||
    !safe(payload.tenantId) || !safe(payload.outboxEventId) || !safe(payload.lockOwner, 100)
  ) throw new UnrecoverableError(JOB_INVALID);
  return {
    tenantId: payload.tenantId,
    billingOutboxEventId: payload.outboxEventId,
    lockOwner: payload.lockOwner,
  };
}

function isFinalJobAttempt(job: Job): boolean {
  return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
}
function safe(value: unknown, max = 191): value is string { return typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value && !value.includes(":"); }
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
