import { HttpException, Inject, Injectable } from "@nestjs/common";
import type { JobDispatchMetadata } from "../infrastructure/job-dispatcher";
import { BillingDocumentSubmissionPreparationService, type BillingDocumentSubmissionPreparationResult } from "./billing-document-submission-preparation.service";
import { BillingDocumentSubmissionAttemptService, type BillingDocumentSubmissionAttemptResult } from "./billing-document-submission-attempt.service";
import { fiscalBillingError } from "./fiscal-billing.errors";
import { FISCAL_ISSUANCE_JOB_NAME, FISCAL_OUTBOX_EVENT_VERSION } from "./jobs/fiscal-outbox-publisher.constants";
import { ELECTRONIC_DOCUMENT_SUBMISSION_PROVIDER, ElectronicDocumentSubmissionError, type ElectronicDocumentSubmissionAcknowledgement, type ElectronicDocumentSubmissionErrorCode, type ElectronicDocumentSubmissionProvider } from "./providers/electronic-document-submission.provider";

export interface FiscalSubmissionJobEnvelope {
  readonly name: unknown;
  readonly id: unknown;
  readonly payload: unknown;
  readonly metadata?: JobDispatchMetadata | unknown;
}
type AttemptIdentity={readonly tenantId:string;readonly billingDocumentId:string;readonly requestHash:string;readonly attemptedAt:Date};
export type BillingDocumentSubmissionExecutorOutcome=
  | {readonly classification:"ACKNOWLEDGED";readonly attempt:AttemptIdentity;readonly acknowledgement:ElectronicDocumentSubmissionAcknowledgement}
  | {readonly classification:"DEFINITE_FAILURE";readonly attempt:AttemptIdentity;readonly errorCode:ElectronicDocumentSubmissionErrorCode}
  | {readonly classification:"RECONCILIATION_REQUIRED";readonly attempt?:AttemptIdentity;readonly reasonCode:string;readonly retryAfterSeconds:number|null;readonly tenantId?:string;readonly billingDocumentId?:string}
  | {readonly classification:"ALREADY_ACKNOWLEDGED";readonly tenantId:string;readonly billingDocumentId:string}
  | {readonly classification:"ALREADY_FAILED";readonly tenantId:string;readonly billingDocumentId:string};

@Injectable()
export class BillingDocumentSubmissionExecutorService {
  constructor(private readonly preparation:BillingDocumentSubmissionPreparationService,private readonly attempts:BillingDocumentSubmissionAttemptService,
    @Inject(ELECTRONIC_DOCUMENT_SUBMISSION_PROVIDER) private readonly provider:ElectronicDocumentSubmissionProvider){}

  async execute(job:FiscalSubmissionJobEnvelope):Promise<BillingDocumentSubmissionExecutorOutcome>{
    const payload=validJob(job);
    let prepared:BillingDocumentSubmissionPreparationResult;
    try{prepared=await this.preparation.prepare(payload.tenantId,payload.billingDocumentId);}
    catch(error){if(error instanceof HttpException)throw error;throw fiscalBillingError("BILLING_DOCUMENT_SUBMISSION_EXECUTION_PREPARATION_FAILED");}
    let claim:BillingDocumentSubmissionAttemptResult;
    try{claim=await this.attempts.claim(prepared);}
    catch(error){if(error instanceof HttpException)throw error;throw fiscalBillingError("BILLING_DOCUMENT_SUBMISSION_EXECUTION_CLAIM_FAILED");}
    switch(claim.classification){
      case"ALREADY_ACKNOWLEDGED":return{classification:"ALREADY_ACKNOWLEDGED",tenantId:claim.tenantId,billingDocumentId:claim.billingDocumentId};
      case"ALREADY_FAILED":return{classification:"ALREADY_FAILED",tenantId:claim.tenantId,billingDocumentId:claim.billingDocumentId};
      case"RECONCILIATION_REQUIRED":return{classification:"RECONCILIATION_REQUIRED",reasonCode:"EXISTING_RECONCILIATION_REQUIRED",retryAfterSeconds:null,tenantId:claim.tenantId,billingDocumentId:claim.billingDocumentId};
      case"CLAIMED":return submitPreparedElectronicDocument(this.provider,prepared.preparedSubmission,{tenantId:claim.tenantId,billingDocumentId:claim.billingDocumentId,requestHash:claim.requestHash,attemptedAt:claim.attemptedAt});
      default:return exhaustiveClaim(claim);
    }
  }

}

export async function submitPreparedElectronicDocument(provider:ElectronicDocumentSubmissionProvider,prepared:BillingDocumentSubmissionPreparationResult["preparedSubmission"],attempt:AttemptIdentity):Promise<BillingDocumentSubmissionExecutorOutcome>{
    try{return{classification:"ACKNOWLEDGED",attempt,acknowledgement:await provider.submitElectronicDocument(prepared)};}
    catch(error){
      if(error instanceof ElectronicDocumentSubmissionError){
        if(error.outcome==="DEFINITE_REJECTION"||error.outcome==="CONFIGURATION_FAILURE")return{classification:"DEFINITE_FAILURE",attempt,errorCode:error.code};
        return{classification:"RECONCILIATION_REQUIRED",attempt,reasonCode:error.code,retryAfterSeconds:safeRetry(error.retryAfterSeconds)};
      }
      return{classification:"RECONCILIATION_REQUIRED",attempt,reasonCode:"ELECTRONIC_SUBMISSION_UNEXPECTED_ERROR",retryAfterSeconds:null};
    }
}

function validJob(job:FiscalSubmissionJobEnvelope):{tenantId:string;billingDocumentId:string;eventVersion:1}{
  if(!plain(job)||job.name!==FISCAL_ISSUANCE_JOB_NAME||typeof job.id!=="string"||job.id!==job.id.trim()||job.id.length>250||!/^fiscal-issuance-[A-Za-z0-9_-]{1,200}$/.test(job.id)||!plain(job.payload)||Object.keys(job.payload).sort().join(",")!=="billingDocumentId,eventVersion,tenantId")invalidJob();
  const payload=job.payload as Record<string,unknown>,tenantId=boundedId(payload.tenantId),billingDocumentId=boundedId(payload.billingDocumentId);
  if(payload.eventVersion!==FISCAL_OUTBOX_EVENT_VERSION)invalidJob();
  if(job.metadata!==undefined){if(!plain(job.metadata))invalidJob();const metadataTenant=(job.metadata as Record<string,unknown>).tenantId;if(metadataTenant!==undefined&&metadataTenant!==tenantId)invalidJob();}
  return{tenantId,billingDocumentId,eventVersion:1};
}
function boundedId(value:unknown):string{if(typeof value!=="string"||value!==value.trim()||!value||value.length>200)invalidJob();return value;}
function plain(value:unknown):value is Record<string,unknown>{if(typeof value!=="object"||value===null||Array.isArray(value))return false;const proto=Object.getPrototypeOf(value);return proto===Object.prototype||proto===null;}
function safeRetry(value:number|null){return typeof value==="number"&&Number.isInteger(value)&&value>0&&value<=86_400?value:null;}
function invalidJob():never{throw fiscalBillingError("BILLING_DOCUMENT_SUBMISSION_JOB_INVALID");}
function exhaustiveClaim(value:never):never{void value;throw fiscalBillingError("BILLING_DOCUMENT_SUBMISSION_CLAIM_CLASSIFICATION_INVALID");}
