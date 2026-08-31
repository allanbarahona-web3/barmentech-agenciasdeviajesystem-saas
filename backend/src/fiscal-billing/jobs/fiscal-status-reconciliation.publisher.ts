import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { JobDispatcherService } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import { PrismaService } from "../../prisma/prisma.service";
import { FISCAL_STATUS_RECONCILIATION_BATCH_SIZE, FISCAL_STATUS_RECONCILIATION_EVENT_VERSION, FISCAL_STATUS_RECONCILIATION_JOB_NAME, FISCAL_STATUS_RECONCILIATION_LEASE_MS, FISCAL_STATUS_RECONCILIATION_POLL_INTERVAL_MS, fiscalStatusReconciliationJobId } from "./fiscal-status-reconciliation.constants";
import { logFiscalPollerFailure } from "./fiscal-poller-error-logging";

interface ClaimedStatusCheck{tenantId:string;billingDocumentId:string;statusCheckLockOwner:string;}
export interface FiscalStatusReconciliationPayload{tenantId:string;billingDocumentId:string;statusCheckLockOwner:string;eventVersion:1;}

@Injectable()
export class FiscalStatusReconciliationPublisher implements OnModuleInit,OnModuleDestroy{
  private readonly logger=new Logger(FiscalStatusReconciliationPublisher.name);private timer:ReturnType<typeof setTimeout>|null=null;private activeCycle:Promise<void>|null=null;private stopping=false;
  constructor(private readonly prisma:PrismaService,private readonly dispatcher:JobDispatcherService){}
  onModuleInit(){this.schedule(0);}async onModuleDestroy(){this.stopping=true;if(this.timer){clearTimeout(this.timer);this.timer=null;}await this.activeCycle;}
  async publishDueStatusChecks():Promise<void>{const claimed=await this.claimBatch();for(const row of claimed){try{assertClaimedStatusCheck(row);}catch(error){this.logDispatchFailure(error,"BEFORE_DISPATCH");continue;}try{await this.dispatch(row);}catch(error){this.logDispatchFailure(error,"DURING_DISPATCH");}}}
  private schedule(delay:number){if(this.stopping)return;this.timer=setTimeout(()=>{this.timer=null;void this.executeCycle();},delay);}
  private async executeCycle(){if(this.stopping||this.activeCycle)return;const cycle=this.publishDueStatusChecks().catch(error=>logFiscalPollerFailure(this.logger,"FiscalStatusReconciliationPublisher",error));this.activeCycle=cycle;try{await cycle;}finally{this.activeCycle=null;this.schedule(FISCAL_STATUS_RECONCILIATION_POLL_INTERVAL_MS);}}
  private claimBatch():Promise<ClaimedStatusCheck[]>{const claimedAt=new Date(),leaseUntil=new Date(claimedAt.getTime()+FISCAL_STATUS_RECONCILIATION_LEASE_MS),batchOwner=`fsr-${randomUUID()}`;
    return this.prisma.$transaction(tx=>tx.$queryRaw<ClaimedStatusCheck[]>`
      WITH selected AS (
        SELECT "id", "tenantId", "providerNextStatusCheckAt"
        FROM "billing_documents"
        WHERE "lifecycleStatus" = 'SUBMITTED' AND "providerStatus" = 'PROCESSED' AND "taxAuthorityStatus" = 'PROCESSING'
          AND NOT "providerReconciliationRequired" AND "issuedAt" IS NULL
          AND "providerNextStatusCheckAt" IS NOT NULL AND "providerNextStatusCheckAt" <= ${claimedAt}
          AND "providerDocumentId" IS NOT NULL AND "haciendaKey" IS NOT NULL AND "providerEnvironment" IS NOT NULL
          AND "fiscalNumber" IS NOT NULL AND "billingDocumentNumberSequenceId" IS NOT NULL AND "allocatedSequenceNumber" IS NOT NULL
          AND "issuanceIdempotencyKey" IS NOT NULL AND "fiscalEmissionAt" IS NOT NULL AND "fiscalIssueDate" IS NOT NULL
          AND "providerRequestHash" IS NOT NULL AND "providerLastAttemptAt" IS NOT NULL AND "submittedAt" IS NOT NULL
          AND (("providerStatusCheckLockOwner" IS NULL AND "providerStatusCheckLeaseUntil" IS NULL) OR "providerStatusCheckLeaseUntil" <= ${claimedAt})
        ORDER BY "providerNextStatusCheckAt" ASC, "id" ASC LIMIT ${FISCAL_STATUS_RECONCILIATION_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      ), eligible AS (
        SELECT selected.*, row_number() OVER (ORDER BY "providerNextStatusCheckAt" ASC, "id" ASC) AS claim_position FROM selected
      )
      UPDATE "billing_documents" AS document
      SET "providerStatusCheckLockOwner" = ${batchOwner} || '-' || eligible.claim_position::text,
          "providerStatusCheckLeaseUntil" = ${leaseUntil}
      FROM eligible WHERE document."id" = eligible."id" AND document."tenantId" = eligible."tenantId"
      RETURNING document."tenantId", document."id" AS "billingDocumentId",
        document."providerStatusCheckLockOwner" AS "statusCheckLockOwner"
    `);}
  private dispatch(row:ClaimedStatusCheck){const payload: FiscalStatusReconciliationPayload={tenantId:row.tenantId,billingDocumentId:row.billingDocumentId,statusCheckLockOwner:row.statusCheckLockOwner,eventVersion:FISCAL_STATUS_RECONCILIATION_EVENT_VERSION};return this.dispatcher.dispatch({queueKey:PLATFORM_QUEUE_KEYS.FISCAL_STATUS_RECONCILIATION,jobName:FISCAL_STATUS_RECONCILIATION_JOB_NAME,payload,metadata:{tenantId:row.tenantId},options:{jobId:fiscalStatusReconciliationJobId(row.billingDocumentId),attempts:3,backoff:{type:"exponential",delay:2000},removeOnComplete:true,removeOnFail:false}});}
  private logDispatchFailure(error:unknown,phase:DispatchFailurePhase){const failure=classifyDispatchFailure(error);this.logger.error(`FISCAL_STATUS_RECONCILIATION_DISPATCH_FAILED phase=${phase} category=${failure.category} error=${safeErrorName(error)}${failure.reason?` reason="${failure.reason}"`:""}`);}
}
type DispatchFailurePhase="BEFORE_DISPATCH"|"DURING_DISPATCH";
interface DispatchFailureClassification{category:"INVALID_CLAIMED_ROW"|"DISPATCHER_DISABLED"|"REDIS_CONFIGURATION_MISSING"|"QUEUE_CONFIGURATION_MISSING"|"QUEUE_UNAVAILABLE"|"UNKNOWN";reason?:string;}
function classifyDispatchFailure(error:unknown):DispatchFailureClassification{const message=error instanceof Error?error.message:"";if(message==="FISCAL_STATUS_RECONCILIATION_JOB_INVALID")return{category:"INVALID_CLAIMED_ROW",reason:message};if(message==="Generic job dispatcher is disabled.")return{category:"DISPATCHER_DISABLED",reason:message};if(message==="Redis is not configured.")return{category:"REDIS_CONFIGURATION_MISSING",reason:message};if(message.startsWith("Queue is not configured:"))return{category:"QUEUE_CONFIGURATION_MISSING",reason:"Queue is not configured."};if(message.startsWith("Queue is unavailable:"))return{category:"QUEUE_UNAVAILABLE",reason:"Queue is unavailable."};return{category:"UNKNOWN"};}
function safeErrorName(error:unknown):string{if(!(error instanceof Error))return"UnknownError";return/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name)?error.name:"UnknownError";}
function assertClaimedStatusCheck(row:ClaimedStatusCheck):void{if(!bounded(row.tenantId)||!bounded(row.billingDocumentId)||!bounded(row.statusCheckLockOwner,100))throw new Error("FISCAL_STATUS_RECONCILIATION_JOB_INVALID");}
function bounded(value:unknown,max=191):value is string{return typeof value==="string"&&value.length>0&&value.length<=max&&value.trim()===value&&!value.includes(":");}
