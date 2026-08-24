import { BillingDocumentRecoveryExecutorService, BILLING_DOCUMENT_RECOVERY_LEASE_MS } from "./billing-document-recovery-executor.service";
import type { BillingDocumentRecoveryPreparationResult } from "./billing-document-recovery-preparation.service";
import { BillingDocumentRecoveryPreparationService } from "./billing-document-recovery-preparation.service";
import { BillingDocumentSubmissionOutcomeService } from "./billing-document-submission-outcome.service";
import { FiscalIssuanceClock } from "./fiscal-issuance.clock";
import { PrismaService } from "../prisma/prisma.service";
import { ElectronicDocumentSubmissionError, type ElectronicDocumentSubmissionProvider } from "./providers/electronic-document-submission.provider";

const HASH="a".repeat(64),PREVIOUS=new Date("2026-08-24T12:00:00.123Z"),NOW=new Date("2026-08-24T12:01:00.123Z"),EMISSION=new Date("2026-08-24T06:00:00.456Z");
describe("BillingDocumentRecoveryExecutorService",()=>{
  it("runs preparation, committed claim, one provider call, and existing outcome persistence in exact order",async()=>{
    const c=context();const result=await c.service.recover("tenant-a","document-a");
    expect(c.order).toEqual(["prepare","tx-start","lock","read","write","tx-commit","provider","outcome"]);
    expect(c.prepare).toHaveBeenCalledTimes(1);expect(c.provider).toHaveBeenCalledTimes(1);expect(c.provider).toHaveBeenCalledWith(c.input.preparedSubmission);
    expect(c.persist).toHaveBeenCalledTimes(1);expect(c.persist).toHaveBeenCalledWith(expect.objectContaining({classification:"ACKNOWLEDGED",attempt:{tenantId:"tenant-a",billingDocumentId:"document-a",requestHash:HASH,attemptedAt:NOW}}));
    expect(result).toMatchObject({classification:"RECOVERED",providerStatus:"PROCESSED",taxAuthorityStatus:"PROCESSING",newlyPersisted:true});
    expect(c.clock).toHaveBeenCalledTimes(1);const write=c.tx.billingDocument.updateMany.mock.calls[0][0] as {where:Record<string,unknown>;data:Record<string,unknown>};
    expect(write.where).toMatchObject({id:"document-a",tenantId:"tenant-a",allocatedSequenceNumber:42n,providerLastAttemptAt:PREVIOUS,providerRequestHash:HASH,providerReconciliationRequired:true,providerDocumentId:null,haciendaKey:null,providerEnvironment:null,submittedAt:null,issuedAt:null});
    expect(write.data).toEqual({providerLastAttemptAt:NOW,providerReconciliationRequired:true,providerLastErrorCode:null,providerLastErrorAt:null});
    expect(c.tx).not.toHaveProperty("billingOutboxEvent");expect(c.tx).not.toHaveProperty("billingDocumentNumberSequence");
  });

  it.each([[59_999,1],[0,60_000],[-1,60_000]] as const)("returns deterministic NOT_DUE at elapsed %i",async(elapsed,remaining)=>{
    const now=new Date(PREVIOUS.getTime()+elapsed),c=context({now});const result=await c.service.recover("tenant-a","document-a");
    expect(result).toEqual({classification:"NOT_DUE",tenantId:"tenant-a",billingDocumentId:"document-a",retryAfterMilliseconds:remaining});
    expect(c.clock).toHaveBeenCalledTimes(1);expect(c.tx.billingDocument.updateMany).not.toHaveBeenCalled();expect(c.provider).not.toHaveBeenCalled();expect(c.persist).not.toHaveBeenCalled();
  });

  it("claims exactly at the 60-second boundary with exact milliseconds",async()=>{const c=context({now:new Date(PREVIOUS.getTime()+BILLING_DOCUMENT_RECOVERY_LEASE_MS)});await c.service.recover("tenant-a","document-a");
    expect(c.tx.billingDocument.updateMany).toHaveBeenCalledTimes(1);expect(c.provider).toHaveBeenCalledTimes(1);expect(c.clock).toHaveBeenCalledTimes(1);});

  it("claims after the 60-second boundary",async()=>{const c=context({now:new Date(PREVIOUS.getTime()+BILLING_DOCUMENT_RECOVERY_LEASE_MS+1)});await c.service.recover("tenant-a","document-a");
    expect(c.tx.billingDocument.updateMany).toHaveBeenCalledTimes(1);expect(c.provider).toHaveBeenCalledTimes(1);});

  it("rejects an invalid clock without writing or calling the provider",async()=>{const c=context({now:new Date(Number.NaN)});const error=await capture(c.service.recover("tenant-a","document-a"));
    expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_RECOVERY_STATE_CORRUPT"});expect(c.tx.billingDocument.updateMany).not.toHaveBeenCalled();expect(c.provider).not.toHaveBeenCalled();});

  it("classifies an already-claimed locked row before clock and provider",async()=>{const c=context({row:row({providerLastAttemptAt:NOW})});const result=await c.service.recover("tenant-a","document-a");
    expect(result).toEqual({classification:"ALREADY_CLAIMED",tenantId:"tenant-a",billingDocumentId:"document-a"});expect(c.clock).not.toHaveBeenCalled();expect(c.provider).not.toHaveBeenCalled();expect(c.persist).not.toHaveBeenCalled();});

  it("recognizes its exact zero-row CAS winner with one reread and no provider",async()=>{const c=context();c.tx.billingDocument.updateMany.mockResolvedValueOnce({count:0});c.tx.billingDocument.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({providerLastAttemptAt:NOW}));
    await expect(c.service.recover("tenant-a","document-a")).resolves.toMatchObject({classification:"ALREADY_CLAIMED"});expect(c.tx.billingDocument.findUnique).toHaveBeenCalledTimes(2);expect(c.provider).not.toHaveBeenCalled();});

  it.each([
    ["sequence",{billingDocumentNumberSequenceId:"sequence-b"}],["allocation",{allocatedSequenceNumber:43n}],["fiscal",{fiscalNumber:"00100001010000000043"}],
    ["type",{documentTypeCode:"04"}],["idempotency",{issuanceIdempotencyKey:"other"}],["hash",{providerRequestHash:"b".repeat(64)}],
    ["emission",{fiscalEmissionAt:new Date(EMISSION.getTime()+1)}],["date",{fiscalIssueDate:new Date("2026-08-23T00:00:00Z")}],
  ] as const)("rejects stale %s before clock/provider",async(_label,override)=>{const c=context({row:row(override)});const error=await capture(c.service.recover("tenant-a","document-a"));expect(error.getResponse()).toMatchObject({code:expect.stringMatching(/RECOVERY_(STALE|STATE_CORRUPT)/)});expect(c.clock).not.toHaveBeenCalled();expect(c.provider).not.toHaveBeenCalled();});

  it.each([{providerReconciliationRequired:false},{providerDocumentId:"provider-a"},{haciendaKey:"5".repeat(50)},{providerEnvironment:"sandbox"},{providerStatus:"FAILED"},{taxAuthorityStatus:"ACCEPTED"},{submittedAt:PREVIOUS},{issuedAt:PREVIOUS},{providerLastErrorCode:"TIMEOUT"}])("rejects corrupt/no-longer-uncertain state without clock/provider: %o",async override=>{
    const c=context({row:row(override)});const error=await capture(c.service.recover("tenant-a","document-a"));expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_RECOVERY_STATE_CORRUPT"});expect(c.clock).not.toHaveBeenCalled();expect(c.provider).not.toHaveBeenCalled();});

  it.each([
    ["definite",new ElectronicDocumentSubmissionError("ELECTRONIC_SUBMISSION_INVALID","DEFINITE_REJECTION"),"DEFINITE_FAILURE"],
    ["timeout",new ElectronicDocumentSubmissionError("ELECTRONIC_SUBMISSION_TIMEOUT","UNKNOWN_REQUIRES_RECONCILIATION",12),"RECONCILIATION_REQUIRED"],
    ["unavailable",new ElectronicDocumentSubmissionError("ELECTRONIC_SUBMISSION_PROVIDER_UNAVAILABLE","UNKNOWN_REQUIRES_RECONCILIATION",9),"RECONCILIATION_REQUIRED"],
    ["unexpected",new Error("provider secret"),"RECONCILIATION_REQUIRED"],
  ] as const)("reuses normal provider mapping for %s",async(_label,providerError,classification)=>{const c=context({providerError});const result=await c.service.recover("tenant-a","document-a");
    expect(result.classification).toBe(classification);expect(c.provider).toHaveBeenCalledTimes(1);expect(c.persist).toHaveBeenCalledTimes(1);
    if(_label==="timeout")expect(result).toMatchObject({retryAfterSeconds:12});});

  it.each([
    ["accepted",{providerStatus:"accepted",final:true,accepted:true,rejected:false},"ACCEPTED"],
    ["rejected",{providerStatus:"rejected",final:true,accepted:false,rejected:true},"REJECTED"],
  ] as const)("persists an immediate %s acknowledgement",async(_label,status,taxAuthorityStatus)=>{const c=context({acknowledgementStatus:status});const result=await c.service.recover("tenant-a","document-a");
    expect(result).toMatchObject({classification:"RECOVERED",providerStatus:"PROCESSED",taxAuthorityStatus});expect(c.provider).toHaveBeenCalledTimes(1);expect(c.persist).toHaveBeenCalledTimes(1);});

  it("propagates a safe outcome-persistence failure",async()=>{const c=context({persistenceError:new ElectronicDocumentSubmissionError("ELECTRONIC_SUBMISSION_PROVIDER_UNAVAILABLE","UNKNOWN_REQUIRES_RECONCILIATION")});
    await expect(c.service.recover("tenant-a","document-a")).rejects.toMatchObject({code:"ELECTRONIC_SUBMISSION_PROVIDER_UNAVAILABLE"});expect(c.provider).toHaveBeenCalledTimes(1);expect(c.persist).toHaveBeenCalledTimes(1);});

  it("keeps different tenant/document transactions independent",async()=>{const a=context(),b=context({input:recovery("tenant-b","document-b"),row:row({id:"document-b",tenantId:"tenant-b",issuanceIdempotencyKey:"billing-document:document-b:electronic-issuance:v1"})});
    await a.service.recover("tenant-a","document-a");await b.service.recover("tenant-b","document-b");expect(a.tx.$queryRaw.mock.calls[0][1]).toBe("document-a");expect(b.tx.$queryRaw.mock.calls[0][1]).toBe("document-b");});
});

function recovery(tenantId="tenant-a",billingDocumentId="document-a"):BillingDocumentRecoveryPreparationResult{const preparedSubmission={endpoint:"/documents/factura" as const,canonicalBody:'{"exact":true}',requestHash:HASH,idempotencyKey:`billing-document:${billingDocumentId}:electronic-issuance:v1`,metadata:{tenantId,billingDocumentId,documentTypeCode:"01" as const,fiscalNumber:"00100001010000000042",fiscalIssueDate:"2026-08-24"}};
  return{tenantId,billingDocumentId,preparedSubmission,billingDocumentNumberSequenceId:"sequence-a",allocatedSequenceNumber:"42",fiscalNumber:"00100001010000000042",documentTypeCode:"01",issuanceIdempotencyKey:preparedSubmission.idempotencyKey,providerRequestHash:HASH,providerLastAttemptAt:PREVIOUS,fiscalEmissionAt:EMISSION,fiscalIssueDate:"2026-08-24",lifecycleStatus:"CONFIRMED",providerStatus:"PENDING",taxAuthorityStatus:"NOT_SUBMITTED",providerReconciliationRequired:true,providerLastErrorCode:null,providerLastErrorAt:null,submittedAt:null,issuedAt:null};}
function row(overrides:Record<string,unknown>={}){return{id:"document-a",tenantId:"tenant-a",billingMode:"ELECTRONIC_PROVIDER",lifecycleStatus:"CONFIRMED",providerStatus:"PENDING",taxAuthorityStatus:"NOT_SUBMITTED",billingDocumentNumberSequenceId:"sequence-a",allocatedSequenceNumber:42n,fiscalNumber:"00100001010000000042",documentTypeCode:"01",issuanceIdempotencyKey:"billing-document:document-a:electronic-issuance:v1",fiscalEmissionAt:EMISSION,fiscalIssueDate:new Date("2026-08-24T00:00:00Z"),providerRequestHash:HASH,providerLastAttemptAt:PREVIOUS,providerLastErrorCode:null,providerLastErrorAt:null,providerReconciliationRequired:true,providerDocumentId:null,haciendaKey:null,providerEnvironment:null,submittedAt:null,issuedAt:null,...overrides};}
function context(options:{now?:Date;row?:ReturnType<typeof row>;input?:BillingDocumentRecoveryPreparationResult;providerError?:Error;acknowledgementStatus?:{providerStatus:string;final:boolean;accepted:boolean;rejected:boolean};persistenceError?:Error}={}){const order:string[]=[],input=options.input??recovery(),persisted=options.row??row();const prepare=jest.fn(async()=>{order.push("prepare");return input;}),clock=jest.fn(()=>options.now??NOW);
  const tx={billingDocument:{findUnique:jest.fn(async(_args:unknown)=>{order.push("read");return persisted;}),updateMany:jest.fn(async(_args:unknown)=>{order.push("write");return{count:1};})},$queryRaw:jest.fn(async(..._args:unknown[])=>{order.push("lock");return[{id:persisted.id}];})};
  const prisma={$transaction:jest.fn(async(cb:(x:typeof tx)=>Promise<unknown>)=>{order.push("tx-start");const result=await cb(tx);order.push("tx-commit");return result;})};
  const acknowledgement={classification:"ACKNOWLEDGED_PROVIDER_SUBMISSION" as const,providerDocumentId:"provider-a",haciendaKey:"50624082600310167816600100001010000000042142351111",consecutive:"00100001010000000042",status:options.acknowledgementStatus??{providerStatus:"queued",final:false,accepted:false,rejected:false},providerEnvironment:"sandbox" as const,estimatedReadyAt:null};
  const provider=jest.fn(async()=>{order.push("provider");if(options.providerError)throw options.providerError;return acknowledgement;}),persist=jest.fn(async()=>{order.push("outcome");if(options.persistenceError)throw options.persistenceError;return{classification:"PERSISTED" as const,tenantId:input.tenantId,billingDocumentId:input.billingDocumentId};});
  return{order,input,prepare,clock,tx,provider,persist,service:new BillingDocumentRecoveryExecutorService({prepareRecovery:prepare} as unknown as BillingDocumentRecoveryPreparationService,prisma as unknown as PrismaService,{now:clock} as unknown as FiscalIssuanceClock,{submitElectronicDocument:provider} as ElectronicDocumentSubmissionProvider,{persist} as unknown as BillingDocumentSubmissionOutcomeService)};}
async function capture(p:Promise<unknown>):Promise<{getResponse():any}>{try{await p;throw new Error("expected rejection");}catch(e){return e as {getResponse():any};}}
