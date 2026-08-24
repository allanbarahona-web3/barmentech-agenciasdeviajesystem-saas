import { HttpException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { BillingDocumentSubmissionPreparationResult } from "./billing-document-submission-preparation.service";
import { FiscalIssuanceClock } from "./fiscal-issuance.clock";
import { fiscalBillingError } from "./fiscal-billing.errors";

const attemptSelect = Prisma.validator<Prisma.BillingDocumentSelect>()({
  id: true, tenantId: true, billingMode: true, lifecycleStatus: true, providerStatus: true, taxAuthorityStatus: true,
  documentTypeCode: true, billingDocumentNumberSequenceId: true, allocatedSequenceNumber: true, fiscalNumber: true,
  issuanceIdempotencyKey: true, fiscalIssueDate: true, providerRequestHash: true, providerLastAttemptAt: true,
  providerLastErrorCode: true, providerLastErrorAt: true, providerReconciliationRequired: true,
  providerDocumentId: true, haciendaKey: true, providerEnvironment: true, submittedAt: true,
});
type AttemptRow = Prisma.BillingDocumentGetPayload<{select:typeof attemptSelect}>;

export type BillingDocumentSubmissionAttemptResult =
  | { readonly classification:"CLAIMED"; readonly tenantId:string; readonly billingDocumentId:string; readonly requestHash:string; readonly attemptedAt:Date; readonly issuanceIdempotencyKey:string }
  | { readonly classification:"ALREADY_ACKNOWLEDGED"; readonly tenantId:string; readonly billingDocumentId:string }
  | { readonly classification:"RECONCILIATION_REQUIRED"; readonly tenantId:string; readonly billingDocumentId:string }
  | { readonly classification:"ALREADY_FAILED"; readonly tenantId:string; readonly billingDocumentId:string };

@Injectable()
export class BillingDocumentSubmissionAttemptService {
  constructor(private readonly prisma:PrismaService,private readonly clock:FiscalIssuanceClock){}

  async claim(preparation:BillingDocumentSubmissionPreparationResult):Promise<BillingDocumentSubmissionAttemptResult>{
    const input=attemptInput(preparation);
    try {
      return await this.prisma.$transaction(async tx=>{
        const locked=await tx.$queryRaw<Array<{id:string}>>`
          SELECT "id" FROM "billing_documents"
          WHERE "id" = ${input.billingDocumentId} AND "tenantId" = ${input.tenantId}
          FOR UPDATE
        `;
        if(locked.length!==1) notFound();
        const row=await tx.billingDocument.findUnique({where:{id_tenantId:{id:input.billingDocumentId,tenantId:input.tenantId}},select:attemptSelect});
        if(!row) notFound();
        requireIdentity(row!,input);
        const existing=classifyExisting(row!,input);
        if(existing)return {classification:existing,tenantId:input.tenantId,billingDocumentId:input.billingDocumentId};
        requirePristineEligibility(row!);
        const attemptedAt=this.clock.now();
        if(!(attemptedAt instanceof Date)||!Number.isFinite(attemptedAt.getTime())) corrupt();
        const updated=await tx.billingDocument.updateMany({where:{
          id:input.billingDocumentId,tenantId:input.tenantId,billingMode:"ELECTRONIC_PROVIDER",lifecycleStatus:"CONFIRMED",
          providerStatus:"PENDING",taxAuthorityStatus:"NOT_SUBMITTED",documentTypeCode:input.documentTypeCode,
          billingDocumentNumberSequenceId:input.billingDocumentNumberSequenceId,allocatedSequenceNumber:input.allocatedSequenceNumber,
          fiscalNumber:input.fiscalNumber,issuanceIdempotencyKey:input.issuanceIdempotencyKey,fiscalIssueDate:input.fiscalIssueDate,
          providerRequestHash:null,providerLastAttemptAt:null,providerLastErrorCode:null,providerLastErrorAt:null,
          providerReconciliationRequired:false,providerDocumentId:null,haciendaKey:null,providerEnvironment:null,
        },data:{providerRequestHash:input.requestHash,providerLastAttemptAt:attemptedAt,providerReconciliationRequired:true}});
        if(updated.count!==1) concurrent();
        return {classification:"CLAIMED",tenantId:input.tenantId,billingDocumentId:input.billingDocumentId,requestHash:input.requestHash,attemptedAt,issuanceIdempotencyKey:input.issuanceIdempotencyKey};
      });
    }catch(error){if(error instanceof HttpException)throw error;throw fiscalBillingError("BILLING_DOCUMENT_PROVIDER_ATTEMPT_PERSISTENCE_FAILED");}
  }
}

interface AttemptInput {tenantId:string;billingDocumentId:string;billingDocumentNumberSequenceId:string;allocatedSequenceNumber:bigint;fiscalNumber:string;issuanceIdempotencyKey:string;requestHash:string;documentTypeCode:"01"|"04";fiscalIssueDate:Date;}
function attemptInput(value:BillingDocumentSubmissionPreparationResult):AttemptInput{
  try{
    const p=value.preparedSubmission,identity=value.identity,allocation=value.allocationIdentity;
    if(!identity.tenantId||!identity.billingDocumentId||!allocation.billingDocumentNumberSequenceId||!/^[1-9]\d{0,9}$/.test(allocation.allocatedSequenceNumber)||
      !/^\d{20}$/.test(p.metadata.fiscalNumber)||!/^billing-document:.+:electronic-issuance:v1$/.test(p.idempotencyKey)||
      !/^[a-f0-9]{64}$/.test(p.requestHash)||(p.metadata.documentTypeCode!=="01"&&p.metadata.documentTypeCode!=="04")||
      p.metadata.tenantId!==identity.tenantId||p.metadata.billingDocumentId!==identity.billingDocumentId||!/^\d{4}-\d{2}-\d{2}$/.test(p.metadata.fiscalIssueDate)) identityConflict();
    const allocatedSequenceNumber=BigInt(allocation.allocatedSequenceNumber),fiscalIssueDate=dateOnly(p.metadata.fiscalIssueDate);
    return{tenantId:identity.tenantId,billingDocumentId:identity.billingDocumentId,billingDocumentNumberSequenceId:allocation.billingDocumentNumberSequenceId,
      allocatedSequenceNumber,fiscalNumber:p.metadata.fiscalNumber,issuanceIdempotencyKey:p.idempotencyKey,requestHash:p.requestHash,
      documentTypeCode:p.metadata.documentTypeCode,fiscalIssueDate};
  }catch(error){if(error instanceof HttpException)throw error;identityConflict();}
}
function requireIdentity(row:AttemptRow,input:AttemptInput){if(row.id!==input.billingDocumentId||row.tenantId!==input.tenantId||row.billingDocumentNumberSequenceId!==input.billingDocumentNumberSequenceId||
  row.allocatedSequenceNumber!==input.allocatedSequenceNumber||row.fiscalNumber!==input.fiscalNumber||row.documentTypeCode!==input.documentTypeCode||
  row.issuanceIdempotencyKey!==input.issuanceIdempotencyKey||!sameDate(row.fiscalIssueDate,input.fiscalIssueDate))identityConflict();}
function classifyExisting(row:AttemptRow,input:AttemptInput):"ALREADY_ACKNOWLEDGED"|"RECONCILIATION_REQUIRED"|"ALREADY_FAILED"|null{
  const hash=row.providerRequestHash,attempt=row.providerLastAttemptAt,errorCode=row.providerLastErrorCode,errorAt=row.providerLastErrorAt;
  const ack=[row.providerDocumentId,row.haciendaKey,row.providerEnvironment],ackCount=ack.filter(x=>x!==null).length;
  if(hash!==null&&hash!==input.requestHash)hashConflict();
  if((hash===null)!==(attempt===null)||(errorCode===null)!==(errorAt===null)||ackCount===1||ackCount===2)corrupt();
  if(ackCount===3){if(hash===null||attempt===null||errorCode!==null||row.providerReconciliationRequired||row.providerStatus!=="PROCESSED"||row.lifecycleStatus!=="SUBMITTED"||row.submittedAt===null||row.taxAuthorityStatus==="NOT_SUBMITTED"||
    !/^\d{50}$/.test(row.haciendaKey!)||row.haciendaKey!.slice(21,41)!==row.fiscalNumber)corrupt();return"ALREADY_ACKNOWLEDGED";}
  if(row.providerReconciliationRequired){if(hash===null||attempt===null)corrupt();return"RECONCILIATION_REQUIRED";}
  if(errorCode!==null){if(hash===null||attempt===null||row.providerStatus!=="FAILED")corrupt();return"ALREADY_FAILED";}
  if(hash!==null||attempt!==null||row.providerEnvironment!==null)corrupt();
  return null;
}
function requirePristineEligibility(row:AttemptRow){if(row.billingMode!=="ELECTRONIC_PROVIDER"||row.lifecycleStatus!=="CONFIRMED"||row.providerStatus!=="PENDING"||row.taxAuthorityStatus!=="NOT_SUBMITTED"||
  (row.documentTypeCode!=="01"&&row.documentTypeCode!=="04")||!row.billingDocumentNumberSequenceId||row.allocatedSequenceNumber===null||row.fiscalNumber===null||row.issuanceIdempotencyKey===null||row.fiscalIssueDate===null||
  row.providerDocumentId!==null||row.haciendaKey!==null||row.providerEnvironment!==null||row.submittedAt!==null)corrupt();}
function dateOnly(value:string){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);if(!m)identityConflict();const date=new Date(Date.UTC(+m![1],+m![2]-1,+m![3]));if(date.getUTCFullYear()!==+m![1]||date.getUTCMonth()+1!==+m![2]||date.getUTCDate()!==+m![3])identityConflict();return date;}
function sameDate(a:Date|null,b:Date){return !!a&&Number.isFinite(a.getTime())&&a.getUTCFullYear()===b.getUTCFullYear()&&a.getUTCMonth()===b.getUTCMonth()&&a.getUTCDate()===b.getUTCDate();}
function notFound():never{throw fiscalBillingError("BILLING_DOCUMENT_NOT_FOUND");}function identityConflict():never{throw fiscalBillingError("BILLING_DOCUMENT_PROVIDER_ATTEMPT_IDENTITY_CONFLICT");}
function hashConflict():never{throw fiscalBillingError("BILLING_DOCUMENT_PROVIDER_REQUEST_HASH_CONFLICT");}function corrupt():never{throw fiscalBillingError("BILLING_DOCUMENT_PROVIDER_ATTEMPT_STATE_CORRUPT");}
function concurrent():never{throw fiscalBillingError("BILLING_DOCUMENT_PROVIDER_ATTEMPT_CONCURRENT_CONFLICT");}
