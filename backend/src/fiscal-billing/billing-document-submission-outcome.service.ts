import { HttpException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { BillingDocumentSubmissionExecutorOutcome } from "./billing-document-submission-executor.service";
import { FiscalIssuanceClock } from "./fiscal-issuance.clock";
import { fiscalBillingError } from "./fiscal-billing.errors";

const outcomeSelect=Prisma.validator<Prisma.BillingDocumentSelect>()({id:true,tenantId:true,billingMode:true,lifecycleStatus:true,providerStatus:true,taxAuthorityStatus:true,
  billingDocumentNumberSequenceId:true,allocatedSequenceNumber:true,fiscalNumber:true,issuanceIdempotencyKey:true,fiscalIssueDate:true,providerRequestHash:true,providerLastAttemptAt:true,
  providerLastErrorCode:true,providerLastErrorAt:true,providerReconciliationRequired:true,providerDocumentId:true,haciendaKey:true,providerEnvironment:true,submittedAt:true,issuedAt:true});
type OutcomeRow=Prisma.BillingDocumentGetPayload<{select:typeof outcomeSelect}>;
export type BillingDocumentSubmissionOutcomePersistenceResult={readonly classification:"PERSISTED"|"ALREADY_PERSISTED";readonly tenantId:string;readonly billingDocumentId:string};

@Injectable()
export class BillingDocumentSubmissionOutcomeService{
  constructor(private readonly prisma:PrismaService,private readonly clock:FiscalIssuanceClock){}
  async persist(outcome:BillingDocumentSubmissionExecutorOutcome):Promise<BillingDocumentSubmissionOutcomePersistenceResult>{
    const identity=outcomeIdentity(outcome);
    try{
      return await this.prisma.$transaction(async tx=>{
        const locked=await tx.$queryRaw<Array<{id:string}>>`SELECT "id" FROM "billing_documents" WHERE "id"=${identity.billingDocumentId} AND "tenantId"=${identity.tenantId} FOR UPDATE`;
        if(locked.length!==1)notFound();
        const row=await tx.billingDocument.findUnique({where:{id_tenantId:{id:identity.billingDocumentId,tenantId:identity.tenantId}},select:outcomeSelect});if(!row)notFound();
        requireAllocated(row!);
        if(outcome.classification==="ALREADY_ACKNOWLEDGED"){if(!completeAcknowledgement(row!))corrupt();return already(identity);}
        if(outcome.classification==="ALREADY_FAILED"){if(!completeFailure(row!))corrupt();return already(identity);}
        if(outcome.classification==="RECONCILIATION_REQUIRED"&&!outcome.attempt){if(!completeReconciliation(row!))corrupt();return already(identity);}
        const attempt=outcome.attempt!;requireAttempt(row!,attempt);
        if(outcome.classification==="ACKNOWLEDGED")return this.persistAcknowledgement(tx,row!,outcome,identity);
        if(outcome.classification==="DEFINITE_FAILURE")return this.persistError(tx,row!,outcome.errorCode,false,identity);
        if(outcome.classification==="RECONCILIATION_REQUIRED")return this.persistError(tx,row!,outcome.reasonCode,true,identity);
        return exhaustive(outcome);
      });
    }catch(error){
      if(isP2002(error)&&outcome.classification==="ACKNOWLEDGED")return this.recoverAcknowledgementWinner(outcome,identity);
      if(error instanceof HttpException)throw error;
      throw fiscalBillingError("BILLING_DOCUMENT_SUBMISSION_OUTCOME_PERSISTENCE_FAILED");
    }
  }
  private async persistAcknowledgement(tx:Prisma.TransactionClient,row:OutcomeRow,outcome:Extract<BillingDocumentSubmissionExecutorOutcome,{classification:"ACKNOWLEDGED"}>,identity:Identity){
    validateAcknowledgement(outcome,row);
    if(completeAcknowledgement(row)){if(matchesAcknowledgement(row,outcome))return already(identity);outcomeConflict();}
    requireClaimed(row);
    const taxAuthorityStatus=outcome.acknowledgement.status.accepted?"ACCEPTED":outcome.acknowledgement.status.rejected?"REJECTED":"PROCESSING";
    const updated=await tx.billingDocument.updateMany({where:claimedWhere(row,outcome.attempt),data:{providerDocumentId:outcome.acknowledgement.providerDocumentId,
      haciendaKey:outcome.acknowledgement.haciendaKey,providerEnvironment:outcome.acknowledgement.providerEnvironment,providerStatus:"PROCESSED",taxAuthorityStatus,
      lifecycleStatus:"SUBMITTED",submittedAt:outcome.attempt.attemptedAt,providerReconciliationRequired:false,providerLastErrorCode:null,providerLastErrorAt:null}});
    if(updated.count!==1)outcomeConflict();return persisted(identity);
  }
  private async persistError(tx:Prisma.TransactionClient,row:OutcomeRow,code:string,reconciliation:boolean,identity:Identity){
    if(!/^[A-Z][A-Z0-9_]{0,99}$/.test(code))corrupt();
    if(reconciliation&&completeReconciliation(row)&&row.providerLastErrorCode===code)return already(identity);
    if(!reconciliation&&completeFailure(row)&&row.providerLastErrorCode===code)return already(identity);
    requireClaimed(row);const errorAt=this.clock.now();if(!(errorAt instanceof Date)||!Number.isFinite(errorAt.getTime()))corrupt();
    const updated=await tx.billingDocument.updateMany({where:claimedWhere(row,{tenantId:identity.tenantId,billingDocumentId:identity.billingDocumentId,requestHash:row.providerRequestHash!,attemptedAt:row.providerLastAttemptAt!}),
      data:{providerLastErrorCode:code,providerLastErrorAt:errorAt,providerReconciliationRequired:reconciliation,...(!reconciliation?{providerStatus:"FAILED" as const}:{})}});
    if(updated.count!==1)outcomeConflict();return persisted(identity);
  }
  private async recoverAcknowledgementWinner(outcome:Extract<BillingDocumentSubmissionExecutorOutcome,{classification:"ACKNOWLEDGED"}>,identity:Identity){
    let row:OutcomeRow|null;try{row=await this.prisma.billingDocument.findUnique({where:{id_tenantId:{id:identity.billingDocumentId,tenantId:identity.tenantId}},select:outcomeSelect});}catch{throw fiscalBillingError("BILLING_DOCUMENT_SUBMISSION_OUTCOME_PERSISTENCE_FAILED");}
    if(row&&matchesAcknowledgement(row,outcome))return already(identity);outcomeConflict();
  }
}

type Identity={tenantId:string;billingDocumentId:string};type Attempt={tenantId:string;billingDocumentId:string;requestHash:string;attemptedAt:Date};
function outcomeIdentity(outcome:BillingDocumentSubmissionExecutorOutcome):Identity{const value=outcome.classification==="ACKNOWLEDGED"||outcome.classification==="DEFINITE_FAILURE"||(outcome.classification==="RECONCILIATION_REQUIRED"&&outcome.attempt)?outcome.attempt!:outcome;
  if(typeof value.tenantId!=="string"||!value.tenantId||typeof value.billingDocumentId!=="string"||!value.billingDocumentId)corrupt();return{tenantId:value.tenantId,billingDocumentId:value.billingDocumentId};}
function requireAllocated(row:OutcomeRow){if(row.billingMode!=="ELECTRONIC_PROVIDER"||!row.billingDocumentNumberSequenceId||row.allocatedSequenceNumber===null||!row.fiscalNumber||!row.issuanceIdempotencyKey||!row.fiscalIssueDate)corrupt();}
function requireAttempt(row:OutcomeRow,attempt:Attempt){if(row.id!==attempt.billingDocumentId||row.tenantId!==attempt.tenantId||row.providerRequestHash!==attempt.requestHash)stale();if(!row.providerLastAttemptAt||row.providerLastAttemptAt.getTime()!==attempt.attemptedAt.getTime())stale();}
function requireClaimed(row:OutcomeRow){if(row.lifecycleStatus!=="CONFIRMED"||row.providerStatus!=="PENDING"||row.taxAuthorityStatus!=="NOT_SUBMITTED"||!row.providerReconciliationRequired||!row.providerRequestHash||!row.providerLastAttemptAt||row.providerDocumentId||row.haciendaKey||row.providerEnvironment||row.providerLastErrorCode||row.providerLastErrorAt||row.submittedAt||row.issuedAt)corrupt();}
function validateAcknowledgement(outcome:Extract<BillingDocumentSubmissionExecutorOutcome,{classification:"ACKNOWLEDGED"}>,row:OutcomeRow){const a=outcome.acknowledgement,s=a.status;if(a.classification!=="ACKNOWLEDGED_PROVIDER_SUBMISSION"||typeof a.providerDocumentId!=="string"||!a.providerDocumentId.trim()||a.providerDocumentId.length>255||!/^[0-9]{50}$/.test(a.haciendaKey)||a.consecutive!==row.fiscalNumber||a.haciendaKey.slice(21,41)!==row.fiscalNumber||(a.providerEnvironment!=="sandbox"&&a.providerEnvironment!=="production")||!/^[a-z][a-z0-9_]{0,63}$/.test(s.providerStatus)||s.accepted!==(s.providerStatus==="accepted")||s.rejected!==(s.providerStatus==="rejected")||s.final!==(s.accepted||s.rejected)||!keyDate(a.haciendaKey,row.fiscalIssueDate!))ackMismatch();}
function keyDate(key:string,date:Date){if(!Number.isFinite(date.getTime()))return false;return key.slice(3,9)===`${date.getUTCDate().toString().padStart(2,"0")}${(date.getUTCMonth()+1).toString().padStart(2,"0")}${date.getUTCFullYear().toString().slice(-2)}`;}
function claimedWhere(row:OutcomeRow,attempt:Attempt){return{id:attempt.billingDocumentId,tenantId:attempt.tenantId,billingMode:"ELECTRONIC_PROVIDER" as const,lifecycleStatus:"CONFIRMED" as const,providerStatus:"PENDING" as const,taxAuthorityStatus:"NOT_SUBMITTED" as const,
  billingDocumentNumberSequenceId:row.billingDocumentNumberSequenceId,allocatedSequenceNumber:row.allocatedSequenceNumber,fiscalNumber:row.fiscalNumber,issuanceIdempotencyKey:row.issuanceIdempotencyKey,fiscalIssueDate:row.fiscalIssueDate,
  providerRequestHash:attempt.requestHash,providerLastAttemptAt:attempt.attemptedAt,providerReconciliationRequired:true,providerDocumentId:null,haciendaKey:null,providerEnvironment:null,providerLastErrorCode:null,providerLastErrorAt:null,submittedAt:null,issuedAt:null};}
function completeAcknowledgement(row:OutcomeRow){return row.lifecycleStatus==="SUBMITTED"&&row.providerStatus==="PROCESSED"&&row.taxAuthorityStatus!=="NOT_SUBMITTED"&&!!row.providerRequestHash&&!!row.providerLastAttemptAt&&!row.providerReconciliationRequired&&!row.providerLastErrorCode&&!row.providerLastErrorAt&&typeof row.providerDocumentId==="string"&&!!row.providerDocumentId.trim()&&row.providerDocumentId.length<=255&&
  typeof row.haciendaKey==="string"&&/^\d{50}$/.test(row.haciendaKey)&&row.haciendaKey.slice(21,41)===row.fiscalNumber&&!!row.fiscalIssueDate&&keyDate(row.haciendaKey,row.fiscalIssueDate)&&(row.providerEnvironment==="sandbox"||row.providerEnvironment==="production")&&!!row.submittedAt;}
function completeFailure(row:OutcomeRow){return row.lifecycleStatus==="CONFIRMED"&&row.providerStatus==="FAILED"&&row.taxAuthorityStatus==="NOT_SUBMITTED"&&!row.providerReconciliationRequired&&!!row.providerRequestHash&&!!row.providerLastAttemptAt&&typeof row.providerLastErrorCode==="string"&&/^[A-Z][A-Z0-9_]{0,99}$/.test(row.providerLastErrorCode)&&!!row.providerLastErrorAt&&!row.providerDocumentId&&!row.haciendaKey&&!row.providerEnvironment&&!row.submittedAt&&!row.issuedAt;}
function completeReconciliation(row:OutcomeRow){return row.lifecycleStatus==="CONFIRMED"&&row.providerStatus==="PENDING"&&row.taxAuthorityStatus==="NOT_SUBMITTED"&&row.providerReconciliationRequired&&!!row.providerRequestHash&&!!row.providerLastAttemptAt&&!row.providerDocumentId&&!row.haciendaKey&&!row.providerEnvironment&&!row.submittedAt&&!row.issuedAt&&(row.providerLastErrorCode===null)===(row.providerLastErrorAt===null)&&(row.providerLastErrorCode===null||/^[A-Z][A-Z0-9_]{0,99}$/.test(row.providerLastErrorCode));}
function matchesAcknowledgement(row:OutcomeRow,outcome:Extract<BillingDocumentSubmissionExecutorOutcome,{classification:"ACKNOWLEDGED"}>){const a=outcome.acknowledgement,s=a.status;return row.id===outcome.attempt.billingDocumentId&&row.tenantId===outcome.attempt.tenantId&&row.billingMode==="ELECTRONIC_PROVIDER"&&!!row.billingDocumentNumberSequenceId&&row.allocatedSequenceNumber!==null&&!!row.fiscalNumber&&!!row.issuanceIdempotencyKey&&completeAcknowledgement(row)&&row.providerRequestHash===outcome.attempt.requestHash&&row.providerLastAttemptAt?.getTime()===outcome.attempt.attemptedAt.getTime()&&row.submittedAt?.getTime()===outcome.attempt.attemptedAt.getTime()&&row.issuedAt===null&&row.providerDocumentId===a.providerDocumentId&&row.haciendaKey===a.haciendaKey&&row.providerEnvironment===a.providerEnvironment&&row.taxAuthorityStatus===(s.accepted?"ACCEPTED":s.rejected?"REJECTED":"PROCESSING");}
function isP2002(error:unknown){return typeof error==="object"&&error!==null&&(error as{code?:unknown}).code==="P2002";}
function persisted(i:Identity):BillingDocumentSubmissionOutcomePersistenceResult{return{classification:"PERSISTED",...i};}function already(i:Identity):BillingDocumentSubmissionOutcomePersistenceResult{return{classification:"ALREADY_PERSISTED",...i};}
function notFound():never{throw fiscalBillingError("BILLING_DOCUMENT_NOT_FOUND");}function stale():never{throw fiscalBillingError("BILLING_DOCUMENT_SUBMISSION_OUTCOME_STALE_ATTEMPT");}function outcomeConflict():never{throw fiscalBillingError("BILLING_DOCUMENT_SUBMISSION_OUTCOME_CONFLICT");}
function corrupt():never{throw fiscalBillingError("BILLING_DOCUMENT_SUBMISSION_OUTCOME_STATE_CORRUPT");}function ackMismatch():never{throw fiscalBillingError("BILLING_DOCUMENT_SUBMISSION_ACKNOWLEDGEMENT_MISMATCH");}
function exhaustive(value:never):never{void value;corrupt();}
