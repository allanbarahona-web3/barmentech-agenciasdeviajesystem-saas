import { Injectable, OnModuleInit } from '@nestjs/common';
import { UnrecoverableError, type Job } from 'bullmq';
import type { JobEnvelope } from '../../infrastructure/job-dispatcher';
import { PLATFORM_QUEUE_KEYS } from '../../infrastructure/queue';
import { WorkerService } from '../../infrastructure/worker';
import { FISCAL_ARTIFACT_RETRIEVAL_ATTEMPTS_EXHAUSTED, FiscalArtifactRetrievalService, FiscalArtifactRetrievalServiceError } from '../fiscal-artifact-retrieval.service';
import { FISCAL_ARTIFACT_RETRIEVAL_CONCURRENCY, FISCAL_ARTIFACT_RETRIEVAL_JOB_NAME, FISCAL_ARTIFACT_RETRIEVAL_WORKER_REGISTRATION_KEY } from './fiscal-artifact-retrieval.constants';
const INVALID='FISCAL_ARTIFACT_RETRIEVAL_JOB_INVALID';
@Injectable() export class FiscalArtifactRetrievalProcessor implements OnModuleInit {
 constructor(private readonly workers:WorkerService,private readonly service:FiscalArtifactRetrievalService){}
 onModuleInit(){this.workers.registerWorker(FISCAL_ARTIFACT_RETRIEVAL_WORKER_REGISTRATION_KEY,PLATFORM_QUEUE_KEYS.FISCAL_ARTIFACT_RETRIEVAL,job=>this.process(job as Job<JobEnvelope<unknown>>),{concurrency:FISCAL_ARTIFACT_RETRIEVAL_CONCURRENCY,jobNames:FISCAL_ARTIFACT_RETRIEVAL_JOB_NAME});}
 private async process(job:Job<JobEnvelope<unknown>>):Promise<{completed:true}>{const claim=payload(job);try{await this.service.processClaimedArtifact(claim);}catch(error){if(error instanceof FiscalArtifactRetrievalServiceError&&!error.retryable)throw new UnrecoverableError(error.code);if(job.attemptsMade+1>=(job.opts.attempts??1))await this.service.finalizeExhaustedDelivery(claim,FISCAL_ARTIFACT_RETRIEVAL_ATTEMPTS_EXHAUSTED);throw error;}return{completed:true};}
}
function payload(job:Job<JobEnvelope<unknown>>){const p=job.data?.payload;if(job.name!==FISCAL_ARTIFACT_RETRIEVAL_JOB_NAME||!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==4||(p as Record<string,unknown>).eventVersion!==1||!safe((p as Record<string,unknown>).tenantId)||!safe((p as Record<string,unknown>).outboxEventId)||!safe((p as Record<string,unknown>).lockOwner,100))throw new UnrecoverableError(INVALID);const v=p as Record<string,string>;return{tenantId:v.tenantId,outboxEventId:v.outboxEventId,lockOwner:v.lockOwner};}
function safe(v:unknown,max=191):v is string{return typeof v==='string'&&v.length>0&&v.length<=max&&v.trim()===v&&!v.includes(':');}
