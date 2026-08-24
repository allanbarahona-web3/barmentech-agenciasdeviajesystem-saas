import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { JobDispatcherService } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import { PrismaService } from "../../prisma/prisma.service";
import { FISCAL_STATUS_RECONCILIATION_BATCH_SIZE, FISCAL_STATUS_RECONCILIATION_EVENT_VERSION, FISCAL_STATUS_RECONCILIATION_JOB_NAME, FISCAL_STATUS_RECONCILIATION_LEASE_MS, FISCAL_STATUS_RECONCILIATION_POLL_INTERVAL_MS, fiscalStatusReconciliationJobId } from "./fiscal-status-reconciliation.constants";

interface ClaimedStatusCheck{tenantId:string;billingDocumentId:string;statusCheckLockOwner:string;}
export interface FiscalStatusReconciliationPayload{tenantId:string;billingDocumentId:string;statusCheckLockOwner:string;eventVersion:1;}

@Injectable()
export class FiscalStatusReconciliationPublisher implements OnModuleInit,OnModuleDestroy{
  private readonly logger=new Logger(FiscalStatusReconciliationPublisher.name);private timer:ReturnType<typeof setTimeout>|null=null;private activeCycle:Promise<void>|null=null;private stopping=false;
  constructor(private readonly prisma:PrismaService,private readonly dispatcher:JobDispatcherService){}
  onModuleInit(){this.schedule(0);}async onModuleDestroy(){this.stopping=true;if(this.timer){clearTimeout(this.timer);this.timer=null;}await this.activeCycle;}
  async publishDueStatusChecks():Promise<void>{const claimed=await this.claimBatch();for(const row of claimed){try{await this.dispatch(row);}catch{this.logger.error("Fiscal status reconciliation dispatch failed.");}}}
  private schedule(delay:number){if(this.stopping)return;this.timer=setTimeout(()=>{this.timer=null;void this.executeCycle();},delay);}
  private async executeCycle(){if(this.stopping||this.activeCycle)return;const cycle=this.publishDueStatusChecks().catch(()=>this.logger.error("Fiscal status reconciliation polling cycle failed."));this.activeCycle=cycle;try{await cycle;}finally{this.activeCycle=null;this.schedule(FISCAL_STATUS_RECONCILIATION_POLL_INTERVAL_MS);}}
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
      RETURNING document."tenantId", document."id" AS "billingDocumentId", document."providerStatusCheckLockOwner"
    `);}
  private dispatch(row:ClaimedStatusCheck){const payload: FiscalStatusReconciliationPayload={tenantId:row.tenantId,billingDocumentId:row.billingDocumentId,statusCheckLockOwner:row.statusCheckLockOwner,eventVersion:FISCAL_STATUS_RECONCILIATION_EVENT_VERSION};return this.dispatcher.dispatch({queueKey:PLATFORM_QUEUE_KEYS.FISCAL_BILLING,jobName:FISCAL_STATUS_RECONCILIATION_JOB_NAME,payload,metadata:{tenantId:row.tenantId},options:{jobId:fiscalStatusReconciliationJobId(row.statusCheckLockOwner),attempts:3,backoff:{type:"exponential",delay:2000},removeOnComplete:false,removeOnFail:false}});}
}
