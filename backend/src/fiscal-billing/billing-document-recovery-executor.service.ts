import { HttpException, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { BillingDocumentRecoveryPreparationService, type BillingDocumentRecoveryPreparationResult } from "./billing-document-recovery-preparation.service";
import { BillingDocumentSubmissionOutcomeService } from "./billing-document-submission-outcome.service";
import { submitPreparedElectronicDocument, type BillingDocumentSubmissionExecutorOutcome } from "./billing-document-submission-executor.service";
import { fiscalBillingError } from "./fiscal-billing.errors";
import { FiscalIssuanceClock } from "./fiscal-issuance.clock";
import { ELECTRONIC_DOCUMENT_SUBMISSION_PROVIDER, type ElectronicDocumentSubmissionProvider } from "./providers/electronic-document-submission.provider";

export const BILLING_DOCUMENT_RECOVERY_LEASE_MS = 60_000;
const recoverySelect=Prisma.validator<Prisma.BillingDocumentSelect>()({id:true,tenantId:true,billingMode:true,lifecycleStatus:true,providerStatus:true,taxAuthorityStatus:true,
  billingDocumentNumberSequenceId:true,allocatedSequenceNumber:true,fiscalNumber:true,documentTypeCode:true,issuanceIdempotencyKey:true,fiscalEmissionAt:true,fiscalIssueDate:true,
  providerRequestHash:true,providerLastAttemptAt:true,providerLastErrorCode:true,providerLastErrorAt:true,providerReconciliationRequired:true,
  providerDocumentId:true,haciendaKey:true,providerEnvironment:true,submittedAt:true,issuedAt:true});
type RecoveryRow=Prisma.BillingDocumentGetPayload<{select:typeof recoverySelect}>;
type ClaimResult=
  |{classification:"CLAIMED";prepared:BillingDocumentRecoveryPreparationResult;previousAttemptAt:Date;attemptedAt:Date}
  |{classification:"NOT_DUE";tenantId:string;billingDocumentId:string;retryAfterMilliseconds:number}
  |{classification:"ALREADY_CLAIMED";tenantId:string;billingDocumentId:string};
export type BillingDocumentRecoveryResult=
  |{readonly classification:"RECOVERED"|"DEFINITE_FAILURE"|"RECONCILIATION_REQUIRED";readonly tenantId:string;readonly billingDocumentId:string;readonly providerStatus:"PROCESSED"|"FAILED"|"PENDING";readonly taxAuthorityStatus:"PROCESSING"|"ACCEPTED"|"REJECTED"|"NOT_SUBMITTED";readonly newlyPersisted:boolean;readonly retryAfterSeconds:number|null}
  |{readonly classification:"NOT_DUE";readonly tenantId:string;readonly billingDocumentId:string;readonly retryAfterMilliseconds:number}
  |{readonly classification:"ALREADY_CLAIMED";readonly tenantId:string;readonly billingDocumentId:string};

@Injectable()
export class BillingDocumentRecoveryExecutorService{
  constructor(private readonly preparation:BillingDocumentRecoveryPreparationService,private readonly prisma:PrismaService,private readonly clock:FiscalIssuanceClock,
    @Inject(ELECTRONIC_DOCUMENT_SUBMISSION_PROVIDER)private readonly provider:ElectronicDocumentSubmissionProvider,private readonly outcomes:BillingDocumentSubmissionOutcomeService){}
  async recover(tenantId:string,billingDocumentId:string):Promise<BillingDocumentRecoveryResult>{
    if(!bounded(tenantId)||!bounded(billingDocumentId))notFound();
    const prepared=await this.preparation.prepareRecovery(tenantId,billingDocumentId);
    const claim=await this.claim(prepared);
    if(claim.classification!=="CLAIMED")return claim;
    const attempt={tenantId,billingDocumentId,requestHash:prepared.providerRequestHash,attemptedAt:claim.attemptedAt};
    const outcome=await submitPreparedElectronicDocument(this.provider,prepared.preparedSubmission,attempt);
    const persisted=await this.outcomes.persist(outcome);
    return recoveryResult(outcome,persisted.classification==="PERSISTED");
  }
  private async claim(input:BillingDocumentRecoveryPreparationResult):Promise<ClaimResult>{
    validateInput(input);
    try{return await this.prisma.$transaction(async tx=>{
      const locked=await tx.$queryRaw<Array<{id:string}>>`SELECT "id" FROM "billing_documents" WHERE "id"=${input.billingDocumentId} AND "tenantId"=${input.tenantId} FOR UPDATE`;
      if(locked.length!==1)notFound();
      const row=await tx.billingDocument.findUnique({where:{id_tenantId:{id:input.billingDocumentId,tenantId:input.tenantId}},select:recoverySelect});if(!row)notFound();
      requireUncertain(row);requireImmutable(row,input);
      const prior=input.providerLastAttemptAt.getTime(),current=row.providerLastAttemptAt!.getTime();
      if(current!==prior){if(current>prior&&row.providerLastErrorCode===null&&row.providerLastErrorAt===null)return{classification:"ALREADY_CLAIMED",tenantId:input.tenantId,billingDocumentId:input.billingDocumentId};stale();}
      requireErrorPair(row,input);
      const now=this.clock.now();if(!validDate(now))corrupt();const elapsed=now.getTime()-prior;
      if(elapsed<BILLING_DOCUMENT_RECOVERY_LEASE_MS){const remaining=elapsed<=0?BILLING_DOCUMENT_RECOVERY_LEASE_MS:BILLING_DOCUMENT_RECOVERY_LEASE_MS-elapsed;
        return{classification:"NOT_DUE",tenantId:input.tenantId,billingDocumentId:input.billingDocumentId,retryAfterMilliseconds:remaining};}
      const updated=await tx.billingDocument.updateMany({where:expectedWhere(row,input),data:{providerLastAttemptAt:now,providerReconciliationRequired:true,providerLastErrorCode:null,providerLastErrorAt:null}});
      if(updated.count===1)return{classification:"CLAIMED",prepared:input,previousAttemptAt:new Date(prior),attemptedAt:new Date(now.getTime())};
      const winner=await tx.billingDocument.findUnique({where:{id_tenantId:{id:input.billingDocumentId,tenantId:input.tenantId}},select:recoverySelect});
      if(winner){requireUncertain(winner);requireImmutable(winner,input);if(winner.providerLastAttemptAt!.getTime()===now.getTime()&&!winner.providerLastErrorCode&&!winner.providerLastErrorAt)return{classification:"ALREADY_CLAIMED",tenantId:input.tenantId,billingDocumentId:input.billingDocumentId};}
      conflict();
    });}catch(error){if(error instanceof HttpException)throw error;throw fiscalBillingError("BILLING_DOCUMENT_RECOVERY_CLAIM_FAILED");}
  }
}

function validateInput(i:BillingDocumentRecoveryPreparationResult){try{if(!bounded(i.tenantId)||!bounded(i.billingDocumentId)||!safe(i.billingDocumentNumberSequenceId,191)||
  typeof i.allocatedSequenceNumber!=="string"||!/^[1-9]\d{0,9}$/.test(i.allocatedSequenceNumber)||typeof i.fiscalNumber!=="string"||!/^\d{20}$/.test(i.fiscalNumber)||(i.documentTypeCode!=="01"&&i.documentTypeCode!=="04")||
  i.fiscalNumber.slice(8,10)!==i.documentTypeCode||i.fiscalNumber.slice(10)!==i.allocatedSequenceNumber.padStart(10,"0")||i.issuanceIdempotencyKey!==`billing-document:${i.billingDocumentId}:electronic-issuance:v1`||
  !/^[a-f0-9]{64}$/.test(i.providerRequestHash)||!validDate(i.providerLastAttemptAt)||!validDate(i.fiscalEmissionAt)||!canonicalDate(i.fiscalIssueDate)||
  i.lifecycleStatus!=="CONFIRMED"||i.providerStatus!=="PENDING"||i.taxAuthorityStatus!=="NOT_SUBMITTED"||i.providerReconciliationRequired!==true||i.submittedAt!==null||i.issuedAt!==null||
  (i.providerLastErrorCode===null)!==(i.providerLastErrorAt===null)||(i.providerLastErrorCode!==null&&!/^[A-Z][A-Z0-9_]{0,99}$/.test(i.providerLastErrorCode))||(i.providerLastErrorAt!==null&&!validDate(i.providerLastErrorAt))||
  i.preparedSubmission.requestHash!==i.providerRequestHash||i.preparedSubmission.idempotencyKey!==i.issuanceIdempotencyKey)corrupt();BigInt(i.allocatedSequenceNumber);}catch(error){if(error instanceof HttpException)throw error;corrupt();}}
function requireUncertain(r:RecoveryRow){if(r.billingMode!=="ELECTRONIC_PROVIDER"||r.lifecycleStatus!=="CONFIRMED"||r.providerStatus!=="PENDING"||r.taxAuthorityStatus!=="NOT_SUBMITTED"||!r.providerReconciliationRequired||
  !safe(r.billingDocumentNumberSequenceId,191)||typeof r.allocatedSequenceNumber!=="bigint"||!safe(r.fiscalNumber,50)||(r.documentTypeCode!=="01"&&r.documentTypeCode!=="04")||!safe(r.issuanceIdempotencyKey,100)||!validDate(r.fiscalEmissionAt)||!validDate(r.fiscalIssueDate)||
  !safe(r.providerRequestHash,64)||!validDate(r.providerLastAttemptAt)||r.providerDocumentId!==null||r.haciendaKey!==null||r.providerEnvironment!==null||r.submittedAt!==null||r.issuedAt!==null||
  (r.providerLastErrorCode===null)!==(r.providerLastErrorAt===null)||(r.providerLastErrorCode!==null&&!/^[A-Z][A-Z0-9_]{0,99}$/.test(r.providerLastErrorCode))||(r.providerLastErrorAt!==null&&!validDate(r.providerLastErrorAt)))corrupt();}
function requireImmutable(r:RecoveryRow,i:BillingDocumentRecoveryPreparationResult){if(r.id!==i.billingDocumentId||r.tenantId!==i.tenantId||r.billingDocumentNumberSequenceId!==i.billingDocumentNumberSequenceId||r.allocatedSequenceNumber!==BigInt(i.allocatedSequenceNumber)||
  r.fiscalNumber!==i.fiscalNumber||r.documentTypeCode!==i.documentTypeCode||r.issuanceIdempotencyKey!==i.issuanceIdempotencyKey||r.providerRequestHash!==i.providerRequestHash||
  r.fiscalEmissionAt!.getTime()!==i.fiscalEmissionAt.getTime()||dateOnly(r.fiscalIssueDate!)!==i.fiscalIssueDate)stale();}
function requireErrorPair(r:RecoveryRow,i:BillingDocumentRecoveryPreparationResult){if(r.providerLastErrorCode!==i.providerLastErrorCode||dateTime(r.providerLastErrorAt)!==dateTime(i.providerLastErrorAt))stale();}
function expectedWhere(r:RecoveryRow,i:BillingDocumentRecoveryPreparationResult){return{id:i.billingDocumentId,tenantId:i.tenantId,billingMode:"ELECTRONIC_PROVIDER" as const,lifecycleStatus:"CONFIRMED" as const,providerStatus:"PENDING" as const,taxAuthorityStatus:"NOT_SUBMITTED" as const,
  billingDocumentNumberSequenceId:i.billingDocumentNumberSequenceId,allocatedSequenceNumber:BigInt(i.allocatedSequenceNumber),fiscalNumber:i.fiscalNumber,documentTypeCode:i.documentTypeCode,issuanceIdempotencyKey:i.issuanceIdempotencyKey,
  fiscalEmissionAt:r.fiscalEmissionAt,fiscalIssueDate:r.fiscalIssueDate,providerRequestHash:i.providerRequestHash,providerLastAttemptAt:i.providerLastAttemptAt,providerLastErrorCode:i.providerLastErrorCode,providerLastErrorAt:i.providerLastErrorAt,
  providerReconciliationRequired:true,providerDocumentId:null,haciendaKey:null,providerEnvironment:null,submittedAt:null,issuedAt:null};}
function recoveryResult(o:BillingDocumentSubmissionExecutorOutcome,newlyPersisted:boolean):BillingDocumentRecoveryResult{
  if(o.classification==="ACKNOWLEDGED"){const s=o.acknowledgement.status,a=o.attempt;return{classification:"RECOVERED",tenantId:a.tenantId,billingDocumentId:a.billingDocumentId,providerStatus:"PROCESSED",taxAuthorityStatus:s.accepted?"ACCEPTED":s.rejected?"REJECTED":"PROCESSING",newlyPersisted,retryAfterSeconds:null};}
  if(o.classification==="DEFINITE_FAILURE"){const a=o.attempt;return{classification:"DEFINITE_FAILURE",tenantId:a.tenantId,billingDocumentId:a.billingDocumentId,providerStatus:"FAILED",taxAuthorityStatus:"NOT_SUBMITTED",newlyPersisted,retryAfterSeconds:null};}
  if(o.classification==="RECONCILIATION_REQUIRED"&&o.attempt){const a=o.attempt;return{classification:"RECONCILIATION_REQUIRED",tenantId:a.tenantId,billingDocumentId:a.billingDocumentId,providerStatus:"PENDING",taxAuthorityStatus:"NOT_SUBMITTED",newlyPersisted,retryAfterSeconds:o.retryAfterSeconds};}
  corrupt();}
function bounded(v:unknown):v is string{return typeof v==="string"&&v.length>0&&v.length<=191&&v.trim()===v;}function safe(v:unknown,m:number):v is string{return typeof v==="string"&&v.length>0&&v.length<=m&&v.trim()===v;}
function validDate(v:unknown):v is Date{return v instanceof Date&&Number.isFinite(v.getTime());}function canonicalDate(v:string){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v);if(!m)return false;const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));return d.getUTCFullYear()===+m[1]&&d.getUTCMonth()+1===+m[2]&&d.getUTCDate()===+m[3];}
function dateOnly(v:Date){return`${v.getUTCFullYear().toString().padStart(4,"0")}-${(v.getUTCMonth()+1).toString().padStart(2,"0")}-${v.getUTCDate().toString().padStart(2,"0")}`;}function dateTime(v:Date|null){return v?.getTime()??null;}
function notFound():never{throw fiscalBillingError("BILLING_DOCUMENT_NOT_FOUND");}function stale():never{throw fiscalBillingError("BILLING_DOCUMENT_RECOVERY_STALE");}function conflict():never{throw fiscalBillingError("BILLING_DOCUMENT_RECOVERY_CONFLICT");}function corrupt():never{throw fiscalBillingError("BILLING_DOCUMENT_RECOVERY_STATE_CORRUPT");}
