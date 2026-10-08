import { Injectable, OnModuleInit } from "@nestjs/common";
import { UnrecoverableError, type Job } from "bullmq";
import type { JobEnvelope } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import { WorkerService } from "../../infrastructure/worker";
import { FiscalCreditNoteFinanceEffectService, isNonRetryableFiscalCreditNoteFinanceEffectError } from "../fiscal-credit-note-finance-effect.service";
import { FISCAL_CREDIT_NOTE_FINANCE_EFFECT_CONCURRENCY, FISCAL_CREDIT_NOTE_FINANCE_EFFECT_JOB_NAME, FISCAL_CREDIT_NOTE_FINANCE_EFFECT_WORKER_REGISTRATION_KEY } from "./fiscal-credit-note-finance-effect.constants";
@Injectable()
export class FiscalCreditNoteFinanceEffectProcessor implements OnModuleInit {
  constructor(private readonly workers: WorkerService, private readonly effects: FiscalCreditNoteFinanceEffectService) {}
  onModuleInit() { this.workers.registerWorker(FISCAL_CREDIT_NOTE_FINANCE_EFFECT_WORKER_REGISTRATION_KEY, PLATFORM_QUEUE_KEYS.FISCAL_CREDIT_NOTE_FINANCE_EFFECT, (job) => this.process(job as Job<JobEnvelope<unknown>>), { concurrency: FISCAL_CREDIT_NOTE_FINANCE_EFFECT_CONCURRENCY, jobNames: FISCAL_CREDIT_NOTE_FINANCE_EFFECT_JOB_NAME }); }
  private async process(job: Job<JobEnvelope<unknown>>) { const p: any = job.data?.payload; if (job.name !== FISCAL_CREDIT_NOTE_FINANCE_EFFECT_JOB_NAME || !p || typeof p !== "object" || Object.keys(p).length !== 4 || p.eventVersion !== 1 || !safe(p.tenantId) || !safe(p.outboxEventId) || !safe(p.lockOwner, 100)) throw new UnrecoverableError("FISCAL_CREDIT_NOTE_FINANCE_EFFECT_JOB_INVALID"); const claim = { tenantId: p.tenantId, billingOutboxEventId: p.outboxEventId, lockOwner: p.lockOwner }; try { await this.effects.applyClaimedEvent(claim); } catch (error) { if (isNonRetryableFiscalCreditNoteFinanceEffectError(error)) { await this.effects.failClaim(claim, (error as Error).message); throw new UnrecoverableError((error as Error).message); } if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) await this.effects.releaseClaimAfterWorkerFailure(claim); throw error; } return { completed: true as const }; }
}
function safe(value: unknown, max = 191): value is string { return typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value && !value.includes(":"); }
