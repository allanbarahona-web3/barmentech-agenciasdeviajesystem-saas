import { Injectable, OnModuleInit } from "@nestjs/common";
import type { Job } from "bullmq";
import type { JobEnvelope } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import { WorkerService } from "../../infrastructure/worker";
import { BillingDocumentSubmissionExecutorService, type BillingDocumentSubmissionExecutorOutcome } from "../billing-document-submission-executor.service";
import { BillingDocumentSubmissionOutcomeService } from "../billing-document-submission-outcome.service";
import { FISCAL_ISSUANCE_JOB_NAME } from "./fiscal-outbox-publisher.constants";

export const FISCAL_BILLING_SUBMISSION_WORKER_REGISTRATION_KEY="fiscal-billing-submission";
// Conservative per-instance MVP limit; database claims remain authoritative across instances.
export const FISCAL_BILLING_SUBMISSION_CONCURRENCY=5;

@Injectable()
export class FiscalBillingSubmissionProcessor implements OnModuleInit{
  constructor(private readonly workers:WorkerService,private readonly executor:BillingDocumentSubmissionExecutorService,private readonly outcomes:BillingDocumentSubmissionOutcomeService){}
  onModuleInit():void{this.workers.registerWorker(FISCAL_BILLING_SUBMISSION_WORKER_REGISTRATION_KEY,PLATFORM_QUEUE_KEYS.FISCAL_BILLING,job=>this.process(job as Job<JobEnvelope<unknown>>),{concurrency:FISCAL_BILLING_SUBMISSION_CONCURRENCY});}
  private async process(job:Job<JobEnvelope<unknown>>):Promise<{completed:true;classification:BillingDocumentSubmissionExecutorOutcome["classification"]}>{
    if(job.name!==FISCAL_ISSUANCE_JOB_NAME)throw new Error("FISCAL_SUBMISSION_JOB_UNSUPPORTED");
    const outcome=await this.executor.execute({name:job.name,id:job.id,payload:job.data?.payload,metadata:job.data?.metadata});
    switch(outcome.classification){case"ACKNOWLEDGED":case"DEFINITE_FAILURE":case"RECONCILIATION_REQUIRED":case"ALREADY_ACKNOWLEDGED":case"ALREADY_FAILED":await this.outcomes.persist(outcome);return{completed:true,classification:outcome.classification};default:return invalidOutcome(outcome);}
  }
}
function invalidOutcome(value:never):never{void value;throw new Error("FISCAL_SUBMISSION_OUTCOME_INVALID");}
