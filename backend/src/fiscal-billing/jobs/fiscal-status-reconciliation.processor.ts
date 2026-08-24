import { Injectable, OnModuleInit } from "@nestjs/common";
import type { Job } from "bullmq";
import type { JobEnvelope } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import { WorkerService } from "../../infrastructure/worker";
import { BillingDocumentStatusLookupService } from "../billing-document-status-lookup.service";
import { BillingDocumentStatusPersistenceService } from "../billing-document-status-persistence.service";
import { FISCAL_STATUS_RECONCILIATION_CONCURRENCY, FISCAL_STATUS_RECONCILIATION_EVENT_VERSION, FISCAL_STATUS_RECONCILIATION_JOB_NAME, FISCAL_STATUS_RECONCILIATION_WORKER_KEY, fiscalStatusReconciliationJobId } from "./fiscal-status-reconciliation.constants";

@Injectable()
export class FiscalStatusReconciliationProcessor implements OnModuleInit{
  constructor(private readonly workers:WorkerService,private readonly lookup:BillingDocumentStatusLookupService,private readonly persistence:BillingDocumentStatusPersistenceService){}
  onModuleInit(){this.workers.registerWorker(FISCAL_STATUS_RECONCILIATION_WORKER_KEY,PLATFORM_QUEUE_KEYS.FISCAL_BILLING,job=>this.process(job as Job<JobEnvelope<unknown>>),{concurrency:FISCAL_STATUS_RECONCILIATION_CONCURRENCY});}
  private async process(job:Job<JobEnvelope<unknown>>):Promise<{completed:true;classification:"PROCESSING"|"ACCEPTED"|"REJECTED"}>{const payload=validateJob(job);const lookup=await this.lookup.lookupStatus(payload.tenantId,payload.billingDocumentId,payload.statusCheckLockOwner);if("classification" in lookup)return{completed:true,classification:lookup.taxAuthorityStatus};const result=await this.persistence.persist(lookup);return{completed:true,classification:result.taxAuthorityStatus};}
}
function validateJob(job:Job<JobEnvelope<unknown>>){if(job.name!==FISCAL_STATUS_RECONCILIATION_JOB_NAME||!job.data||!plain(job.data.payload))invalid();const payload=job.data.payload as Record<string,unknown>;if(Object.keys(payload).sort().join(",")!=="billingDocumentId,eventVersion,statusCheckLockOwner,tenantId"||!bounded(payload.tenantId)||!bounded(payload.billingDocumentId)||!bounded(payload.statusCheckLockOwner,100)||payload.eventVersion!==FISCAL_STATUS_RECONCILIATION_EVENT_VERSION||job.id!==fiscalStatusReconciliationJobId(payload.statusCheckLockOwner)||!metadata(job.data.metadata,payload.tenantId))invalid();return payload as unknown as {tenantId:string;billingDocumentId:string;statusCheckLockOwner:string;eventVersion:1};}
function metadata(value:unknown,tenantId:unknown){if(value===undefined)return true;return plain(value)&&Object.keys(value).length===1&&(value as Record<string,unknown>).tenantId===tenantId;}
function plain(value:unknown):value is Record<string,unknown>{if(typeof value!=="object"||value===null||Array.isArray(value))return false;const proto=Object.getPrototypeOf(value);return proto===Object.prototype||proto===null;}
function bounded(value:unknown,max=191):value is string{return typeof value==="string"&&value.length>0&&value.length<=max&&value.trim()===value&&!value.includes(":");}
function invalid():never{throw new Error("FISCAL_STATUS_RECONCILIATION_JOB_INVALID");}
