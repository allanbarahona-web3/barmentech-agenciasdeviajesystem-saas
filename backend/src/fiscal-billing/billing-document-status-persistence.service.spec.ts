import { BillingDocumentStatusPersistenceService } from "./billing-document-status-persistence.service";
import type { BillingDocumentStatusLookupResult } from "./billing-document-status-lookup.service";
import { FiscalIssuanceClock } from "./fiscal-issuance.clock";
import { PrismaService } from "../prisma/prisma.service";

const NUMBER="00100001010000000042",KEY="50624082600310167816600100001010000000042142351111",HASH="a".repeat(64);
const ATTEMPT=new Date("2026-08-24T12:00:00.123Z"),EMISSION=new Date("2026-08-24T05:59:59.987Z"),ISSUED=new Date("2026-08-24T12:05:00.456Z");

describe("BillingDocumentStatusPersistenceService",()=>{
  it.each(["queued","future_safe_status"])("persists each completed %s non-final check",async providerStatus=>{
    const c=context(row(),lookup({providerResult:{providerStatus}}));
    const result=await c.service.persist(c.lookup);
    expect(result).toEqual({tenantId:"tenant-a",billingDocumentId:"document-a",final:false,finalDecision:null,lifecycleStatus:"SUBMITTED",providerStatus:"PROCESSED",taxAuthorityStatus:"PROCESSING",issuedAt:null,newlyPersisted:true,rejectionDetail:null});
    expect(c.prisma.$transaction).toHaveBeenCalledTimes(1);expect(c.tx.$queryRaw).toHaveBeenCalledTimes(1);
    const [sql,id,tenant]=c.tx.$queryRaw.mock.calls[0];expect((sql as string[]).join("?")).toContain("FOR UPDATE");expect(id).toBe("document-a");expect(tenant).toBe("tenant-a");
    expect(c.tx.billingDocument.findUnique).toHaveBeenCalledWith(expect.objectContaining({where:{id_tenantId:{id:"document-a",tenantId:"tenant-a"}}}));
    expect(c.tx.billingDocument.updateMany).toHaveBeenCalledTimes(1);expect((c.tx.billingDocument.updateMany.mock.calls[0][0] as {data:unknown}).data).toMatchObject({providerStatusCheckAttempts:1,providerLastStatusCheckAt:ISSUED,providerNextStatusCheckAt:new Date(ISSUED.getTime()+20_000),providerStatusCheckLockOwner:null,providerStatusCheckLeaseUntil:null});expect(c.clock.now).toHaveBeenCalledTimes(1);noSideEffects(c);
  });

  it("stops scheduling and requires controlled reconciliation when the window is exhausted",async()=>{
    const completed=new Date(ATTEMPT.getTime()+30*60_000),c=context(row(),lookup());c.clock.now.mockReturnValueOnce(completed);
    await expect(c.service.persist(c.lookup)).resolves.toMatchObject({taxAuthorityStatus:"PROCESSING",newlyPersisted:true});
    expect((c.tx.billingDocument.updateMany.mock.calls[0][0] as {data:unknown}).data).toMatchObject({providerStatusCheckAttempts:1,providerLastStatusCheckAt:completed,providerNextStatusCheckAt:null,providerReconciliationRequired:true,providerStatusCheckLockOwner:null,providerStatusCheckLeaseUntil:null});
    expect(c.clock.now).toHaveBeenCalledTimes(1);
  });

  it("recognizes an exact completed non-final winner without a write or clock",async()=>{
    const winner=row({providerStatusCheckAttempts:1,providerLastStatusCheckAt:ISSUED,providerNextStatusCheckAt:new Date(ISSUED.getTime()+20_000)}),c=context(winner,lookup());
    await expect(c.service.persist(c.lookup)).resolves.toMatchObject({taxAuthorityStatus:"PROCESSING",newlyPersisted:false});
    expect(c.tx.billingDocument.updateMany).not.toHaveBeenCalled();expect(c.clock.now).not.toHaveBeenCalled();
  });

  it.each([
    ["attempts",{providerStatusCheckAttempts:1}],["last check",{providerLastStatusCheckAt:new Date(ATTEMPT.getTime()+5_000)}],
    ["next check",{providerNextStatusCheckAt:new Date(ATTEMPT.getTime()+20_000)}],
    ["lock owner",{providerStatusCheckLockOwner:"worker-b",providerStatusCheckLeaseUntil:new Date(ISSUED.getTime()+60_000)}],
  ] as const)("rejects stale %s scheduling identity before clearing a lock",async(_label,override)=>{
    const input=lookup({persistedIdentity:{providerStatusCheckLockOwner:"worker-a",providerStatusCheckLeaseUntil:new Date(ISSUED.getTime()+60_000)}});
    const source=row({providerStatusCheckLockOwner:"worker-a",providerStatusCheckLeaseUntil:new Date(ISSUED.getTime()+60_000),...override});const c=context(source,input);
    const error=await capture(c.service.persist(input));expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_STATUS_STALE"});expect(c.tx.billingDocument.updateMany).not.toHaveBeenCalled();expect(c.clock.now).not.toHaveBeenCalled();
  });

  it("atomically persists acceptance with one clock reading and exact tenant-scoped CAS",async()=>{
    const c=context(row(),lookup({providerResult:accepted()}));
    const result=await c.service.persist(c.lookup);
    expect(result).toEqual(expect.objectContaining({final:true,finalDecision:"ACCEPTED",taxAuthorityStatus:"ACCEPTED",issuedAt:ISSUED,newlyPersisted:true}));
    expect(result.issuedAt).not.toBe(ISSUED);expect(c.clock.now).toHaveBeenCalledTimes(1);
    const write=c.tx.billingDocument.updateMany.mock.calls[0][0] as {where:Record<string,unknown>;data:Record<string,unknown>};
    expect(write.where).toMatchObject({id:"document-a",tenantId:"tenant-a",billingMode:"ELECTRONIC_PROVIDER",lifecycleStatus:"SUBMITTED",providerStatus:"PROCESSED",taxAuthorityStatus:"PROCESSING",
      billingDocumentNumberSequenceId:"sequence-a",allocatedSequenceNumber:42n,fiscalNumber:NUMBER,documentTypeCode:"01",issuanceIdempotencyKey:"billing-document:document-a:electronic-issuance:v1",
      providerRequestHash:HASH,providerLastAttemptAt:ATTEMPT,providerDocumentId:"provider_a-1",haciendaKey:KEY,providerEnvironment:"sandbox",fiscalEmissionAt:EMISSION,
      submittedAt:ATTEMPT,providerReconciliationRequired:false,providerLastErrorCode:null,providerLastErrorAt:null,issuedAt:null});
    expect(write.data).toEqual({taxAuthorityStatus:"ACCEPTED",providerReconciliationRequired:false,providerLastErrorCode:null,providerLastErrorAt:null,providerStatusCheckAttempts:1,providerLastStatusCheckAt:ISSUED,providerNextStatusCheckAt:null,providerStatusCheckLockOwner:null,providerStatusCheckLeaseUntil:null,issuedAt:ISSUED});
    for(const preserved of ["allocatedSequenceNumber","fiscalNumber","submittedAt","providerRequestHash","providerLastAttemptAt","fiscalEmissionAt"])expect(write.data).not.toHaveProperty(preserved);
    noSideEffects(c);
  });

  it("returns an exact accepted winner idempotently and preserves its original issuedAt",async()=>{
    const c=context(finalRow("ACCEPTED"),lookup({providerResult:accepted()}));
    const result=await c.service.persist(c.lookup);
    expect(result).toMatchObject({taxAuthorityStatus:"ACCEPTED",issuedAt:ISSUED,newlyPersisted:false});
    expect(c.tx.billingDocument.updateMany).not.toHaveBeenCalled();expect(c.clock.now).not.toHaveBeenCalled();
  });

  it("persists rejection without issuedAt or free-text/error persistence",async()=>{
    const detail="Rechazo fiscal limitado";const c=context(row(),lookup({providerResult:rejected(detail)}));
    const result=await c.service.persist(c.lookup);const write=c.tx.billingDocument.updateMany.mock.calls[0][0] as {data:Record<string,unknown>};
    expect(result).toMatchObject({final:true,finalDecision:"REJECTED",taxAuthorityStatus:"REJECTED",issuedAt:null,newlyPersisted:true,rejectionDetail:detail});
    expect(write.data).toEqual({taxAuthorityStatus:"REJECTED",providerReconciliationRequired:false,providerLastErrorCode:null,providerLastErrorAt:null,providerStatusCheckAttempts:1,providerLastStatusCheckAt:ISSUED,providerNextStatusCheckAt:null,providerStatusCheckLockOwner:null,providerStatusCheckLeaseUntil:null,issuedAt:null});
    expect(JSON.stringify(write.data)).not.toContain(detail);expect(c.clock.now).toHaveBeenCalledTimes(1);noSideEffects(c);
  });

  it("returns a normalized rejection detail longer than 1,000 characters unchanged and never persists it",async()=>{
    const detail="R".repeat(1500);const input=lookup({providerResult:rejected(detail)});const c=context(row(),input);
    const result=await c.service.persist(input);const write=c.tx.billingDocument.updateMany.mock.calls[0][0] as {data:Record<string,unknown>};
    expect(result.rejectionDetail).toBe(detail);expect(result.rejectionDetail).toHaveLength(1500);
    expect(JSON.stringify(write.data)).not.toContain(detail);expect(write.data).not.toHaveProperty("rejectionDetail");expect(c.clock.now).toHaveBeenCalledTimes(1);
  });

  it.each([null,undefined])("keeps a %s rejection detail absent",async detail=>{
    const input=lookup({providerResult:{...rejected(null),rejectionDetail:detail}});const c=context(row(),input);
    await expect(c.service.persist(input)).resolves.toMatchObject({rejectionDetail:null});
  });

  it("returns an exact rejected state idempotently",async()=>{
    const input=lookup({providerResult:rejected("detail")});
    const c=context(finalRow("REJECTED"),input);const result=await c.service.persist(input);
    expect(result).toMatchObject({taxAuthorityStatus:"REJECTED",newlyPersisted:false,rejectionDetail:"detail"});
    expect(c.tx.billingDocument.updateMany).not.toHaveBeenCalled();expect(c.clock.now).not.toHaveBeenCalled();
  });

  it.each([
    ["provider ID",{providerDocumentId:"provider_other"}], ["Hacienda key",{haciendaKey:KEY.slice(0,49)+"2"}],
    ["fiscal number",{fiscalNumber:"00100001010000000043",allocatedSequenceNumber:43n,haciendaKey:KEY.slice(0,21)+"00100001010000000043"+KEY.slice(41)}],
    ["request hash",{providerRequestHash:"b".repeat(64)}], ["attempt",{providerLastAttemptAt:new Date(ATTEMPT.getTime()+1),submittedAt:new Date(ATTEMPT.getTime()+1)}],
    ["allocation ID",{billingDocumentNumberSequenceId:"sequence-b"}],
    ["allocation number",{allocatedSequenceNumber:43n,fiscalNumber:"00100001010000000043",haciendaKey:KEY.slice(0,21)+"00100001010000000043"+KEY.slice(41)}],
    ["fiscal emission",{fiscalEmissionAt:new Date(EMISSION.getTime()+1)}],
    ["fiscal date",{fiscalIssueDate:new Date("2026-08-23T00:00:00Z"),haciendaKey:KEY.slice(0,3)+"230826"+KEY.slice(9)}],
    ["environment",{providerEnvironment:"production"}],
    ["document type",{documentTypeCode:"04",fiscalNumber:"00100001040000000042",haciendaKey:KEY.slice(0,21)+"00100001040000000042"+KEY.slice(41)}],
  ] as const)("rejects stale %s before mutation",async(_label,override)=>{
    const c=context(row(override),lookup());const error=await capture(c.service.persist(c.lookup));
    expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_STATUS_STALE"});expect(c.tx.billingDocument.updateMany).not.toHaveBeenCalled();expect(c.clock.now).not.toHaveBeenCalled();
  });

  it.each([
    {providerDocumentId:null},{haciendaKey:null},{providerLastErrorCode:"ERROR",providerLastErrorAt:ATTEMPT},{providerReconciliationRequired:true},
    {providerLastErrorCode:"ERROR"},{providerLastErrorAt:ATTEMPT},
    {issuanceIdempotencyKey:"billing-document:other:electronic-issuance:v1"},{submittedAt:new Date(ATTEMPT.getTime()+1)},
    {lifecycleStatus:"CONFIRMED"},{providerStatus:"FAILED"},{taxAuthorityStatus:"NOT_SUBMITTED"},{taxAuthorityStatus:"REJECTED",issuedAt:ISSUED},
  ])("rejects corrupt persisted state before mutation: %o",async override=>{
    const c=context(row(override),lookup());const error=await capture(c.service.persist(c.lookup));
    expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_STATUS_STATE_CORRUPT"});expect(c.tx.billingDocument.updateMany).not.toHaveBeenCalled();expect(c.clock.now).not.toHaveBeenCalled();
  });

  it("never downgrades accepted or changes rejected to accepted",async()=>{
    let c=context(finalRow("ACCEPTED"),lookup());
    let error=await capture(c.service.persist(c.lookup));expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_STATUS_CONFLICT"});
    c=context(finalRow("REJECTED"),lookup({providerResult:accepted()}));
    error=await capture(c.service.persist(c.lookup));expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_STATUS_CONFLICT"});
  });

  it.each([null,row({tenantId:"tenant-b"})])("makes missing and foreign-tenant rows indistinguishable",async persisted=>{
    const c=context(persisted,lookup());const error=await capture(c.service.persist(c.lookup));
    expect(error.getResponse()).toEqual({statusCode:404,error:"BILLING_DOCUMENT_NOT_FOUND",code:"BILLING_DOCUMENT_NOT_FOUND"});expect(c.tx.billingDocument.updateMany).not.toHaveBeenCalled();
  });

  it("recognizes accepted and rejected winners in the authoritative locked reread without clock or write",async()=>{
    for(const decision of ["ACCEPTED","REJECTED"] as const){const persistedFinal=finalRow(decision);
      const input=lookup({providerResult:decision==="ACCEPTED"?accepted():rejected(null)});const c=context(persistedFinal,input);
      const result=await c.service.persist(input);expect(result).toMatchObject({finalDecision:decision,newlyPersisted:false,taxAuthorityStatus:decision});
      expect(c.clock.now).not.toHaveBeenCalled();expect(c.tx.billingDocument.updateMany).not.toHaveBeenCalled();
    }
  });

  it("treats an accepted zero-row CAS after its single clock read as conflict, never idempotent success",async()=>{
    const input=lookup({providerResult:accepted()});const c=context(row(),input);c.tx.billingDocument.updateMany.mockResolvedValueOnce({count:0});
    const error=await capture(c.service.persist(input));expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_STATUS_CONFLICT"});
    expect(c.clock.now).toHaveBeenCalledTimes(1);expect(c.tx.billingDocument.findUnique).toHaveBeenCalledTimes(2);
  });

  it("can defensively recognize an exact rejected winner after a zero-row CAS without clock",async()=>{
    const input=lookup({providerResult:rejected(null)});const c=context(row(),input);c.tx.billingDocument.updateMany.mockResolvedValueOnce({count:0});
    c.tx.billingDocument.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(finalRow("REJECTED"));
    await expect(c.service.persist(input)).resolves.toMatchObject({finalDecision:"REJECTED",newlyPersisted:false});expect(c.clock.now).toHaveBeenCalledTimes(1);
  });

  it("rejects a contradictory concurrent winner",async()=>{
    const c=context(row(),lookup({providerResult:accepted()}));c.tx.billingDocument.updateMany.mockResolvedValueOnce({count:0});
    c.tx.billingDocument.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(finalRow("REJECTED"));
    const error=await capture(c.service.persist(c.lookup));expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_STATUS_CONFLICT"});
  });

  it("maps unexpected transaction failures safely",async()=>{
    const c=context(row(),lookup());c.prisma.$transaction.mockRejectedValueOnce(new Error(`secret ${KEY}`));
    const error=await capture(c.service.persist(c.lookup));expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_STATUS_PERSISTENCE_FAILED"});
    expect(JSON.stringify(error.getResponse())).not.toContain(KEY);
  });

  it.each([
    ["provider document ID",{providerDocumentId:"provider_other"}],
    ["Hacienda key",{haciendaKey:KEY.slice(0,49)+"2"}],
    ["consecutive",{consecutive:"00100001010000000043"}],
    ["environment",{providerEnvironment:"production"}],
    ["document type encoded by consecutive",{consecutive:"00100001040000000042"}],
    ["fiscal issue date",{fiscalIssuedAt:"2026-08-25T12:04:00-06:00"}],
  ])("rejects provider-result identity mismatch: %s",async(_label,providerResult)=>{
    const input=lookup({providerResult:{...accepted(),...providerResult}});const c=context(row(),input);const error=await capture(c.service.persist(input));
    expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_STATUS_STATE_CORRUPT"});expect(c.prisma.$transaction).not.toHaveBeenCalled();expect(c.clock.now).not.toHaveBeenCalled();
  });

  it("compares the supported BigInt upper boundary without numeric conversion",async()=>{
    const maximum="9999999999",number="0010000101"+maximum,key=KEY.slice(0,21)+number+KEY.slice(41);
    const input=lookup({persistedIdentity:{allocatedSequenceNumber:maximum,fiscalNumber:number,haciendaKey:key},providerResult:{consecutive:number,haciendaKey:key}});
    let c=context(row({allocatedSequenceNumber:9999999999n,fiscalNumber:number,haciendaKey:key}),input);
    await expect(c.service.persist(input)).resolves.toMatchObject({newlyPersisted:true});
    const lower="9999999998",lowerNumber="0010000101"+lower,lowerKey=KEY.slice(0,21)+lowerNumber+KEY.slice(41);
    c=context(row({allocatedSequenceNumber:9999999998n,fiscalNumber:lowerNumber,haciendaKey:lowerKey}),input);
    const error=await capture(c.service.persist(input));expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_STATUS_STALE"});expect(c.clock.now).not.toHaveBeenCalled();
  });
});

function row(overrides:Record<string,unknown>={}){return{id:"document-a",tenantId:"tenant-a",billingMode:"ELECTRONIC_PROVIDER",lifecycleStatus:"SUBMITTED",providerStatus:"PROCESSED",taxAuthorityStatus:"PROCESSING",
  providerDocumentId:"provider_a-1",haciendaKey:KEY,fiscalNumber:NUMBER,documentTypeCode:"01",providerEnvironment:"sandbox",fiscalIssueDate:new Date("2026-08-24T00:00:00Z"),fiscalEmissionAt:EMISSION,
  billingDocumentNumberSequenceId:"sequence-a",allocatedSequenceNumber:42n,issuanceIdempotencyKey:"billing-document:document-a:electronic-issuance:v1",providerRequestHash:HASH,
  providerLastAttemptAt:ATTEMPT,providerReconciliationRequired:false,providerLastErrorCode:null,providerLastErrorAt:null,submittedAt:ATTEMPT,issuedAt:null,
  providerStatusCheckAttempts:0,providerLastStatusCheckAt:null,providerNextStatusCheckAt:new Date(ATTEMPT.getTime()+10_000),providerStatusCheckLockOwner:null,providerStatusCheckLeaseUntil:null,...overrides};}
function finalRow(decision:"ACCEPTED"|"REJECTED"){return row({taxAuthorityStatus:decision,issuedAt:decision==="ACCEPTED"?ISSUED:null,providerStatusCheckAttempts:1,providerLastStatusCheckAt:ISSUED,providerNextStatusCheckAt:null,providerStatusCheckLockOwner:null,providerStatusCheckLeaseUntil:null});}
function lookup(overrides:{persistedIdentity?:Record<string,unknown>;providerResult?:Record<string,unknown>}={}):BillingDocumentStatusLookupResult{return{persistedIdentity:{tenantId:"tenant-a",billingDocumentId:"document-a",billingDocumentNumberSequenceId:"sequence-a",allocatedSequenceNumber:"42",providerDocumentId:"provider_a-1",haciendaKey:KEY,
  issuanceIdempotencyKey:"billing-document:document-a:electronic-issuance:v1",fiscalEmissionAt:EMISSION,providerRequestHash:HASH,providerLastAttemptAt:ATTEMPT,fiscalNumber:NUMBER,documentTypeCode:"01",providerEnvironment:"sandbox",
  fiscalIssueDate:"2026-08-24",lifecycleStatus:"SUBMITTED",providerStatus:"PROCESSED",taxAuthorityStatus:"PROCESSING",providerReconciliationRequired:false,submittedAt:ATTEMPT,issuedAt:null,
  providerStatusCheckAttempts:0,providerLastStatusCheckAt:null,providerNextStatusCheckAt:new Date(ATTEMPT.getTime()+10_000),providerStatusCheckLockOwner:null,providerStatusCheckLeaseUntil:null,...overrides.persistedIdentity},
  providerResult:{classification:"ELECTRONIC_DOCUMENT_STATUS",providerDocumentId:"provider_a-1",haciendaKey:KEY,consecutive:NUMBER,providerEnvironment:"sandbox",providerStatus:"queued",final:false,finalDecision:null,fiscalIssuedAt:null,rejectionDetail:null,...overrides.providerResult}} as BillingDocumentStatusLookupResult;}
function accepted(){return{providerStatus:"accepted",final:true,finalDecision:"ACCEPTED",fiscalIssuedAt:"2026-08-24T12:04:00-06:00",rejectionDetail:null};}
function rejected(detail:string|null){return{providerStatus:"rejected",final:true,finalDecision:"REJECTED",fiscalIssuedAt:null,rejectionDetail:detail};}
function context(persisted:ReturnType<typeof row>|null,input:BillingDocumentStatusLookupResult){const owned=!!persisted&&persisted.tenantId===input.persistedIdentity.tenantId&&persisted.id===input.persistedIdentity.billingDocumentId;const tx={billingDocument:{findUnique:jest.fn(async(_args:unknown)=>owned?persisted:null),updateMany:jest.fn(async(_args:unknown)=>({count:1}))},$queryRaw:jest.fn(async(..._args:unknown[])=>owned?[{id:"document-a"}]:[])};
  const prisma={$transaction:jest.fn(async(callback:(client:typeof tx)=>unknown)=>callback(tx))};const clock={now:jest.fn(()=>ISSUED)};return{tx,prisma,clock,lookup:input,service:new BillingDocumentStatusPersistenceService(prisma as unknown as PrismaService,clock as unknown as FiscalIssuanceClock)};}
function noSideEffects(c:ReturnType<typeof context>){expect(c.tx).not.toHaveProperty("billingOutboxEvent");expect(c.tx).not.toHaveProperty("billingDocumentNumberSequence");expect(c.tx).not.toHaveProperty("salesOrder");}
async function capture(promise:Promise<unknown>):Promise<{getResponse():unknown}>{try{await promise;throw new Error("expected rejection");}catch(error){return error as {getResponse():unknown};}}
