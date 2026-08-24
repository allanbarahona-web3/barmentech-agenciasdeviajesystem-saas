import { HttpException } from "@nestjs/common";
import { BillingDocumentRecoveryPreparationService } from "./billing-document-recovery-preparation.service";
import { BillingDocumentSubmissionPreparationService, type BillingDocumentSubmissionPreparationResult } from "./billing-document-submission-preparation.service";
import { fiscalBillingError } from "./fiscal-billing.errors";

const HASH="a".repeat(64),ATTEMPT=new Date("2026-08-24T12:00:00.789Z"),ERROR_AT=new Date("2026-08-24T12:01:00.456Z");

describe("BillingDocumentRecoveryPreparationService",()=>{
  it("reuses one authoritative preparation and returns its exact submission with defensive attempt identity",async()=>{
    const prepared=preparation(),c=context(prepared);const result=await c.service.prepareRecovery("tenant-a","document-a");
    expect(c.prepare).toHaveBeenCalledTimes(1);expect(c.prepare).toHaveBeenCalledWith("tenant-a","document-a");
    expect(result.preparedSubmission).toBe(prepared.preparedSubmission);
    expect(result).toMatchObject({tenantId:"tenant-a",billingDocumentId:"document-a",billingDocumentNumberSequenceId:"sequence-a",allocatedSequenceNumber:"42",
      fiscalNumber:"00100001010000000042",documentTypeCode:"01",issuanceIdempotencyKey:"billing-document:document-a:electronic-issuance:v1",providerRequestHash:HASH,
      fiscalEmissionAt:new Date("2026-08-24T06:00:00.456Z"),fiscalIssueDate:"2026-08-24",
      lifecycleStatus:"CONFIRMED",providerStatus:"PENDING",taxAuthorityStatus:"NOT_SUBMITTED",providerReconciliationRequired:true,
      providerLastErrorCode:null,providerLastErrorAt:null,submittedAt:null,issuedAt:null});
    expect(result.providerLastAttemptAt.getTime()).toBe(ATTEMPT.getTime());expect(result.providerLastAttemptAt.toISOString()).toBe("2026-08-24T12:00:00.789Z");
    expect(result.providerLastAttemptAt).not.toBe(ATTEMPT);expect(c).not.toHaveProperty("provider");expect(c).not.toHaveProperty("prisma");
    expect(result.fiscalEmissionAt.getTime()).toBe(prepared.recoveryIdentity.fiscalEmissionAt.getTime());
    expect(result.fiscalEmissionAt).not.toBe(prepared.recoveryIdentity.fiscalEmissionAt);expect(result.fiscalIssueDate).toBe(prepared.recoveryIdentity.fiscalIssueDate);
  });

  it("preserves a complete safe uncertain error pair using a defensive timestamp copy",async()=>{
    const input=preparation({providerState:{providerLastErrorCode:"ELECTRONIC_SUBMISSION_TIMEOUT",providerLastErrorAt:ERROR_AT}}),c=context(input);
    const result=await c.service.prepareRecovery("tenant-a","document-a");
    expect(result.providerLastErrorCode).toBe("ELECTRONIC_SUBMISSION_TIMEOUT");expect(result.providerLastErrorAt?.getTime()).toBe(ERROR_AT.getTime());expect(result.providerLastErrorAt).not.toBe(ERROR_AT);
  });

  it.each([
    ["reconciliation false",{providerReconciliationRequired:false}], ["missing hash",{providerRequestHash:null}], ["missing attempt",{providerLastAttemptAt:null}],
    ["provider acknowledgement",{providerDocumentId:"provider-a"}], ["Hacienda acknowledgement",{haciendaKey:"5".repeat(50)}], ["provider environment",{providerEnvironment:"sandbox"}],
    ["processing",{providerStatus:"PROCESSED",taxAuthorityStatus:"PROCESSING",lifecycleStatus:"SUBMITTED",providerDocumentId:"provider-a",haciendaKey:"5".repeat(50),providerEnvironment:"sandbox",submittedAt:ATTEMPT,providerReconciliationRequired:false}],
    ["accepted",{providerStatus:"PROCESSED",taxAuthorityStatus:"ACCEPTED",lifecycleStatus:"SUBMITTED",providerDocumentId:"provider-a",haciendaKey:"5".repeat(50),providerEnvironment:"sandbox",submittedAt:ATTEMPT,providerReconciliationRequired:false}],
    ["rejected",{providerStatus:"PROCESSED",taxAuthorityStatus:"REJECTED",lifecycleStatus:"SUBMITTED",providerDocumentId:"provider-a",haciendaKey:"5".repeat(50),providerEnvironment:"sandbox",submittedAt:ATTEMPT,providerReconciliationRequired:false}],
    ["definite failure",{providerStatus:"FAILED",providerReconciliationRequired:false,providerLastErrorCode:"FAILURE",providerLastErrorAt:ERROR_AT}],
    ["pristine",{providerRequestHash:null,providerLastAttemptAt:null,providerReconciliationRequired:false}], ["wrong lifecycle",{lifecycleStatus:"SUBMITTED"}],
    ["wrong provider status",{providerStatus:"NOT_SUBMITTED"}], ["wrong authority status",{taxAuthorityStatus:"PROCESSING"}],
    ["submitted",{submittedAt:ATTEMPT}], ["one-sided code",{providerLastErrorCode:"TIMEOUT"}], ["one-sided time",{providerLastErrorAt:ERROR_AT}],
    ["unsupported billing mode",{billingMode:"EXTERNAL_REGISTRATION"}],
  ] as const)("rejects ineligible uncertain state: %s",async(_label,providerState)=>{
    const c=context(preparation({providerState}));const error=await capture(c.service.prepareRecovery("tenant-a","document-a"));
    expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_RECOVERY_INELIGIBLE"});expect(c.prepare).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["prepared tenant",{identity:{tenantId:"tenant-b"}}], ["prepared document",{identity:{billingDocumentId:"document-b"}}],
    ["metadata tenant",{preparedSubmission:{metadata:{tenantId:"tenant-b"}}}], ["metadata document",{preparedSubmission:{metadata:{billingDocumentId:"document-b"}}}],
    ["sequence",{allocationIdentity:{billingDocumentNumberSequenceId:""}}], ["allocation",{allocationIdentity:{allocatedSequenceNumber:"43"}}],
    ["fiscal number",{preparedSubmission:{metadata:{fiscalNumber:"00100001010000000043"}}}], ["document type",{preparedSubmission:{metadata:{documentTypeCode:"04"}}}],
    ["idempotency",{preparedSubmission:{idempotencyKey:"billing-document:other:electronic-issuance:v1"}}], ["hash",{preparedSubmission:{requestHash:"b".repeat(64)}}],
    ["persisted idempotency",{recoveryIdentity:{issuanceIdempotencyKey:"billing-document:other:electronic-issuance:v1"}}],
    ["missing persisted idempotency",{recoveryIdentity:{issuanceIdempotencyKey:null}}],
    ["missing allocation",{allocationIdentity:{allocatedSequenceNumber:null}}],
    ["provider environment",{providerState:{providerEnvironment:"production"}}], ["fiscal date",{preparedSubmission:{metadata:{fiscalIssueDate:"2026-08-23"}}}],
    ["issued",{recoveryIdentity:{issuedAt:ATTEMPT}}], ["unsupported type",{recoveryIdentity:{documentTypeCode:"03"}}],
    ["invalid fiscal emission",{recoveryIdentity:{fiscalEmissionAt:new Date("invalid")}}],
  ] as const)("rejects recovery identity mismatch: %s",async(_label,override)=>{
    const c=context(preparation(override));const error=await capture(c.service.prepareRecovery("tenant-a","document-a"));
    expect(error.getResponse()).toMatchObject({code:(["provider environment"].includes(_label as string)?"BILLING_DOCUMENT_RECOVERY_INELIGIBLE":"BILLING_DOCUMENT_RECOVERY_IDENTITY_MISMATCH")});
  });

  it.each([["", "document-a"],[" tenant-a","document-a"],["tenant-a",""]])("rejects invalid local identity before preparation",async(tenant,id)=>{
    const c=context(preparation());const error=await capture(c.service.prepareRecovery(tenant,id));expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_NOT_FOUND"});expect(c.prepare).not.toHaveBeenCalled();
  });

  it("propagates safe preparation errors and sanitizes unexpected exceptions",async()=>{
    let c=context(preparation(),fiscalBillingError("BILLING_DOCUMENT_NOT_FOUND"));let error=await capture(c.service.prepareRecovery("tenant-a","document-a"));expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_NOT_FOUND"});
    c=context(preparation(),new Error(`secret ${HASH} billing-document:document-a`));error=await capture(c.service.prepareRecovery("tenant-a","document-a"));
    expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_RECOVERY_PREPARATION_FAILED"});const safe=JSON.stringify(error.getResponse());expect(safe).not.toMatch(/secret|aaaa|billing-document|tenant-a|document-a/);
  });
});

function preparation(overrides:{identity?:Record<string,unknown>;allocationIdentity?:Record<string,unknown>;recoveryIdentity?:Record<string,unknown>;providerState?:Record<string,unknown>;preparedSubmission?:Record<string,unknown>}={}):BillingDocumentSubmissionPreparationResult{
  const metadata={tenantId:"tenant-a",billingDocumentId:"document-a",documentTypeCode:"01" as const,fiscalNumber:"00100001010000000042",fiscalIssueDate:"2026-08-24",...(overrides.preparedSubmission?.metadata as object??{})};
  return{identity:{tenantId:"tenant-a",billingDocumentId:"document-a",...overrides.identity},allocationIdentity:{billingDocumentNumberSequenceId:"sequence-a",allocatedSequenceNumber:"42",...overrides.allocationIdentity},
    recoveryIdentity:{fiscalNumber:"00100001010000000042",documentTypeCode:"01",issuanceIdempotencyKey:"billing-document:document-a:electronic-issuance:v1",fiscalEmissionAt:new Date("2026-08-24T06:00:00.456Z"),fiscalIssueDate:"2026-08-24",issuedAt:null,...overrides.recoveryIdentity},
    preparedSubmission:{endpoint:"/documents/factura",canonicalBody:'{"customer":"private"}',requestHash:HASH,idempotencyKey:"billing-document:document-a:electronic-issuance:v1",metadata,...overrides.preparedSubmission},
    providerState:{billingMode:"ELECTRONIC_PROVIDER",lifecycleStatus:"CONFIRMED",providerStatus:"PENDING",taxAuthorityStatus:"NOT_SUBMITTED",providerDocumentId:null,providerEnvironment:null,providerRequestHash:HASH,providerLastAttemptAt:ATTEMPT,
      providerLastErrorCode:null,providerLastErrorAt:null,providerReconciliationRequired:true,haciendaKey:null,submittedAt:null,...overrides.providerState}} as BillingDocumentSubmissionPreparationResult;
}
function context(value:BillingDocumentSubmissionPreparationResult,error?:Error){const prepare=jest.fn(async()=>{if(error)throw error;return value;});return{prepare,service:new BillingDocumentRecoveryPreparationService({prepare} as unknown as BillingDocumentSubmissionPreparationService)};}
async function capture(promise:Promise<unknown>):Promise<HttpException>{try{await promise;throw new Error("expected rejection");}catch(error){expect(error).toBeInstanceOf(HttpException);return error as HttpException;}}
