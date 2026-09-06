import { Injectable, OnModuleInit } from "@nestjs/common";
import { UnrecoverableError, type Job } from "bullmq";
import type { JobEnvelope } from "../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../infrastructure/queue";
import { WorkerService } from "../infrastructure/worker";
import {
  CONTRACT_PAYMENT_FISCALIZATION_CONCURRENCY,
  CONTRACT_PAYMENT_FISCALIZATION_JOB_NAME,
  CONTRACT_PAYMENT_FISCALIZATION_WORKER_REGISTRATION_KEY,
} from "./contract-payment-fiscalization.constants";
import {
  contractPaymentFiscalizationErrorCode,
  ContractPaymentFiscalizationWorkerService,
  isNonRetryableContractPaymentFiscalizationError,
} from "./contract-payment-fiscalization-worker.service";

const JOB_INVALID = "CONTRACT_PAYMENT_FISCALIZATION_JOB_INVALID";

@Injectable()
export class ContractPaymentFiscalizationProcessor implements OnModuleInit {
  constructor(
    private readonly workers: WorkerService,
    private readonly fiscalization: ContractPaymentFiscalizationWorkerService,
  ) {}

  onModuleInit(): void {
    this.workers.registerWorker(
      CONTRACT_PAYMENT_FISCALIZATION_WORKER_REGISTRATION_KEY,
      PLATFORM_QUEUE_KEYS.CONTRACT_PAYMENT_FISCALIZATION,
      (job) => this.process(job as Job<JobEnvelope<unknown>>),
      {
        concurrency: CONTRACT_PAYMENT_FISCALIZATION_CONCURRENCY,
        jobNames: CONTRACT_PAYMENT_FISCALIZATION_JOB_NAME,
      },
    );
  }

  private async process(job: Job<JobEnvelope<unknown>>): Promise<{ completed: true }> {
    const claim = validJob(job);
    try {
      await this.fiscalization.processClaim(claim);
    } catch (error) {
      const code = contractPaymentFiscalizationErrorCode(error);
      if (isNonRetryableContractPaymentFiscalizationError(error)) {
        await this.fiscalization.failClaim(claim, code);
        throw new UnrecoverableError(code);
      }
      if (finalAttempt(job)) {
        await this.fiscalization.releaseClaimAfterWorkerFailure(claim);
      }
      throw error;
    }
    return { completed: true };
  }
}

function validJob(job: Job<JobEnvelope<unknown>>) {
  const payload = job.data?.payload;
  if (
    job.name !== CONTRACT_PAYMENT_FISCALIZATION_JOB_NAME ||
    !object(payload) || Object.keys(payload).length !== 4 ||
    payload.eventVersion !== 1 ||
    !safe(payload.tenantId) || !safe(payload.outboxEventId) || !safe(payload.lockOwner, 100)
  ) throw new UnrecoverableError(JOB_INVALID);
  return {
    tenantId: payload.tenantId,
    billingOutboxEventId: payload.outboxEventId,
    lockOwner: payload.lockOwner,
  };
}

function finalAttempt(job: Job): boolean {
  return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
}
function safe(value: unknown, maximum = 191): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && value === value.trim() && !value.includes(":");
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
