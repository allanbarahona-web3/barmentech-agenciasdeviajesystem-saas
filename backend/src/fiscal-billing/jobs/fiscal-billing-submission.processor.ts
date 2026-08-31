import { HttpException, Injectable, OnModuleInit } from "@nestjs/common";
import { UnrecoverableError, type Job } from "bullmq";
import type { JobEnvelope } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import { WorkerService } from "../../infrastructure/worker";
import { BillingDocumentSubmissionExecutorService, type BillingDocumentSubmissionExecutorOutcome } from "../billing-document-submission-executor.service";
import { BillingDocumentSubmissionOutcomeService } from "../billing-document-submission-outcome.service";
import { BillingDocumentSubmissionFailureFinalizationService } from "../billing-document-submission-failure-finalization.service";
import { FISCAL_ISSUANCE_JOB_NAME } from "./fiscal-outbox-publisher.constants";

export const FISCAL_BILLING_SUBMISSION_WORKER_REGISTRATION_KEY="fiscal-billing-submission";
// Conservative per-instance MVP limit; database claims remain authoritative across instances.
export const FISCAL_BILLING_SUBMISSION_CONCURRENCY=5;
const EXHAUSTED_ERROR = "BILLING_DOCUMENT_SUBMISSION_WORKER_EXHAUSTED";
const PERMANENT_PRE_CLAIM_ERRORS = new Set([
  "BILLING_DOCUMENT_SUBMISSION_PREPARATION_FAILED",
  "BILLING_DOCUMENT_SUBMISSION_SNAPSHOT_INVALID",
  "BILLING_DOCUMENT_FISCAL_CALCULATION_POLICY_UNSUPPORTED",
  "BILLING_DOCUMENT_CALCULATED_SNAPSHOT_INVALID",
  "BILLING_DOCUMENT_HACIENDA_MONEY_CAPACITY_EXCEEDED",
]);

@Injectable()
export class FiscalBillingSubmissionProcessor implements OnModuleInit{
  constructor(private readonly workers:WorkerService,private readonly executor:BillingDocumentSubmissionExecutorService,private readonly outcomes:BillingDocumentSubmissionOutcomeService,private readonly failures:BillingDocumentSubmissionFailureFinalizationService){}
  onModuleInit():void{this.workers.registerWorker(FISCAL_BILLING_SUBMISSION_WORKER_REGISTRATION_KEY,PLATFORM_QUEUE_KEYS.FISCAL_BILLING,job=>this.process(job as Job<JobEnvelope<unknown>>),{concurrency:FISCAL_BILLING_SUBMISSION_CONCURRENCY,jobNames:FISCAL_ISSUANCE_JOB_NAME});}
  private async process(job:Job<JobEnvelope<unknown>>):Promise<{completed:true;classification:BillingDocumentSubmissionExecutorOutcome["classification"]}>{
    if(job.name!==FISCAL_ISSUANCE_JOB_NAME)throw new Error("FISCAL_SUBMISSION_JOB_UNSUPPORTED");
    const identity=jobIdentity(job);
    let outcome: BillingDocumentSubmissionExecutorOutcome;
    try { outcome=await this.executor.execute({name:job.name,id:job.id,payload:job.data?.payload,metadata:job.data?.metadata}); }
    catch (error) {
      const code=safeErrorCode(error);
      if (code && PERMANENT_PRE_CLAIM_ERRORS.has(code)) {
        await this.failures.finalizePristineFailure({ ...identity, errorCode: code });
        throw new UnrecoverableError(code);
      }
      if (isFinalAttempt(job)) await this.failures.finalizePristineFailure({ ...identity, errorCode: EXHAUSTED_ERROR });
      throw error;
    }
    switch(outcome.classification){case"ACKNOWLEDGED":case"DEFINITE_FAILURE":case"RECONCILIATION_REQUIRED":case"ALREADY_ACKNOWLEDGED":case"ALREADY_FAILED":await this.outcomes.persist(outcome);return{completed:true,classification:outcome.classification};default:return invalidOutcome(outcome);}
  }
}
function invalidOutcome(value:never):never{void value;throw new Error("FISCAL_SUBMISSION_OUTCOME_INVALID");}
function jobIdentity(job: Job<JobEnvelope<unknown>>): { tenantId: string; billingDocumentId: string } {
  const payload=job.data?.payload;
  if (!payload || typeof payload!=="object" || Array.isArray(payload)) return { tenantId: "", billingDocumentId: "" };
  const value=payload as Record<string,unknown>;
  return { tenantId: bounded(value.tenantId) ? value.tenantId : "", billingDocumentId: bounded(value.billingDocumentId) ? value.billingDocumentId : "" };
}
function bounded(value: unknown): value is string { return typeof value==="string" && value.length>0 && value.length<=191 && value===value.trim(); }
function safeErrorCode(error: unknown): string | null {
  if (!(error instanceof HttpException)) return null;
  const response=error.getResponse();
  if (!response || typeof response!=="object" || Array.isArray(response)) return null;
  const code=(response as Record<string,unknown>).code;
  return typeof code==="string" && /^[A-Z][A-Z0-9_]{0,99}$/.test(code) ? code : null;
}
function isFinalAttempt(job: Job): boolean { const attempts=job.opts.attempts; return typeof attempts === "number" && Number.isInteger(attempts) && attempts > 0 && job.attemptsMade + 1 >= attempts; }
