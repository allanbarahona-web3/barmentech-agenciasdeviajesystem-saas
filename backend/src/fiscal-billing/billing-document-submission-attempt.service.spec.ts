import { HttpException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service";
import type { BillingDocumentSubmissionPreparationResult } from "./billing-document-submission-preparation.service";
import { BillingDocumentSubmissionAttemptService } from "./billing-document-submission-attempt.service";
import type { FiscalIssuanceClock } from "./fiscal-issuance.clock";

const HASH="a".repeat(64),OTHER_HASH="b".repeat(64),ATTEMPT=new Date("2026-08-24T12:00:00.123Z");
const FISCAL_NUMBER="00100001010000000042",KEY=`506240826003101678166${FISCAL_NUMBER}142351111`;

describe("BillingDocumentSubmissionAttemptService",()=>{
  it("claims pristine state with one tenant-scoped lock, reread, clock call, and atomic CAS",async()=>{
    const ctx=context(row());const result=await ctx.service.claim(input());
    expect(result).toEqual({classification:"CLAIMED",tenantId:"tenant-a",billingDocumentId:"document-a",requestHash:HASH,attemptedAt:ATTEMPT,issuanceIdempotencyKey:"billing-document:document-a:electronic-issuance:v1"});
    expect(ctx.prisma.$transaction).toHaveBeenCalledTimes(1);expect(ctx.tx.$queryRaw).toHaveBeenCalledTimes(1);
    const [sql,id,tenantId]=ctx.tx.$queryRaw.mock.calls[0];expect(String.raw({raw:sql},...[])).toContain("FOR UPDATE");expect(id).toBe("document-a");expect(tenantId).toBe("tenant-a");
    expect(ctx.tx.billingDocument.findUnique).toHaveBeenCalledWith(expect.objectContaining({where:{id_tenantId:{id:"document-a",tenantId:"tenant-a"}}}));
    expect(ctx.clock.now).toHaveBeenCalledTimes(1);expect(ctx.tx.billingDocument.updateMany).toHaveBeenCalledTimes(1);
    const write=ctx.tx.billingDocument.updateMany.mock.calls[0][0];
    expect(write.where).toMatchObject({id:"document-a",tenantId:"tenant-a",billingDocumentNumberSequenceId:"sequence-a",allocatedSequenceNumber:42n,fiscalNumber:FISCAL_NUMBER,documentTypeCode:"01",issuanceIdempotencyKey:"billing-document:document-a:electronic-issuance:v1",providerRequestHash:null,providerLastAttemptAt:null,providerLastErrorCode:null,providerLastErrorAt:null,providerReconciliationRequired:false,providerDocumentId:null,haciendaKey:null,providerEnvironment:null});
    expect(write.data).toEqual({providerRequestHash:HASH,providerLastAttemptAt:ATTEMPT,providerReconciliationRequired:true});
  });

  it.each(["missing","foreign tenant"])("makes %s indistinguishable",async()=>{const ctx=context(null,{locked:[]});const error=await capture(ctx.service.claim(input()));expect(error.getStatus()).toBe(404);expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_NOT_FOUND"});expect(ctx.clock.now).not.toHaveBeenCalled();expect(ctx.tx.billingDocument.updateMany).not.toHaveBeenCalled();});

  it.each([
    ["ALREADY_ACKNOWLEDGED",row({lifecycleStatus:"SUBMITTED",providerStatus:"PROCESSED",taxAuthorityStatus:"PROCESSING",providerRequestHash:HASH,providerLastAttemptAt:ATTEMPT,providerDocumentId:"provider-a",haciendaKey:KEY,providerEnvironment:"sandbox",submittedAt:ATTEMPT})],
    ["RECONCILIATION_REQUIRED",row({providerRequestHash:HASH,providerLastAttemptAt:ATTEMPT,providerReconciliationRequired:true})],
    ["ALREADY_FAILED",row({providerStatus:"FAILED",providerRequestHash:HASH,providerLastAttemptAt:ATTEMPT,providerLastErrorCode:"SAFE_CODE",providerLastErrorAt:ATTEMPT})],
  ] as const)("returns %s without write or clock",async(classification,persisted)=>{const ctx=context(persisted);await expect(ctx.service.claim(input())).resolves.toEqual({classification,tenantId:"tenant-a",billingDocumentId:"document-a"});expect(ctx.clock.now).not.toHaveBeenCalled();expect(ctx.tx.billingDocument.updateMany).not.toHaveBeenCalled();});

  it("does not reclaim the same hash and rejects a different hash without clock",async()=>{let ctx=context(row({providerRequestHash:HASH,providerLastAttemptAt:ATTEMPT,providerReconciliationRequired:true}));await expect(ctx.service.claim(input())).resolves.toMatchObject({classification:"RECONCILIATION_REQUIRED"});expect(ctx.tx.billingDocument.updateMany).not.toHaveBeenCalled();ctx=context(row({providerRequestHash:OTHER_HASH,providerLastAttemptAt:ATTEMPT,providerReconciliationRequired:true}));const error=await capture(ctx.service.claim(input()));expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_PROVIDER_REQUEST_HASH_CONFLICT"});expect(ctx.clock.now).not.toHaveBeenCalled();});

  it.each([
    {providerRequestHash:HASH},{providerLastAttemptAt:ATTEMPT},{providerDocumentId:"provider-a"},{providerDocumentId:"provider-a",haciendaKey:KEY},
    {providerLastErrorCode:"SAFE"},{providerLastErrorAt:ATTEMPT},
    {lifecycleStatus:"SUBMITTED",providerStatus:"PROCESSED",taxAuthorityStatus:"PROCESSING",providerRequestHash:HASH,providerLastAttemptAt:ATTEMPT,providerDocumentId:"provider-a",haciendaKey:KEY,providerEnvironment:"sandbox",submittedAt:ATTEMPT,providerReconciliationRequired:true},
  ])("rejects partial or contradictory provider state without clock: %o",async override=>{const ctx=context(row(override));const error=await capture(ctx.service.claim(input()));expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_PROVIDER_ATTEMPT_STATE_CORRUPT"});expect(ctx.clock.now).not.toHaveBeenCalled();expect(ctx.tx.billingDocument.updateMany).not.toHaveBeenCalled();});

  it.each([
    ["sequence",{billingDocumentNumberSequenceId:"sequence-b"}], ["allocation",{allocatedSequenceNumber:43n}], ["fiscal number",{fiscalNumber:"00100001010000000043"}],
    ["type",{documentTypeCode:"04"}], ["idempotency",{issuanceIdempotencyKey:"billing-document:other:electronic-issuance:v1"}], ["date",{fiscalIssueDate:new Date("2026-08-23T00:00:00Z")}],
  ])("rejects locked %s identity mismatch without clock",async(_label,override)=>{const ctx=context(row(override));const error=await capture(ctx.service.claim(input()));expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_PROVIDER_ATTEMPT_IDENTITY_CONFLICT"});expect(ctx.clock.now).not.toHaveBeenCalled();});

  it.each([{lifecycleStatus:"DRAFT"},{providerStatus:"NOT_SUBMITTED"},{taxAuthorityStatus:"ACCEPTED"},{billingMode:"DIRECT"},{documentTypeCode:"03"}])("rejects unsupported pristine eligibility: %o",async override=>{const ctx=context(row(overridesToRecord(override)));const error=await capture(ctx.service.claim(input()));expect(error.getResponse()).toMatchObject({code:override.documentTypeCode?"BILLING_DOCUMENT_PROVIDER_ATTEMPT_IDENTITY_CONFLICT":"BILLING_DOCUMENT_PROVIDER_ATTEMPT_STATE_CORRUPT"});expect(ctx.clock.now).not.toHaveBeenCalled();});

  it("requires exactly one CAS update and wraps persistence failures safely",async()=>{let ctx=context(row(),{count:0});let error=await capture(ctx.service.claim(input()));expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_PROVIDER_ATTEMPT_CONCURRENT_CONFLICT"});ctx=context(row(),{transactionError:new Error("raw prisma database-url secret")});error=await capture(ctx.service.claim(input()));expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_PROVIDER_ATTEMPT_PERSISTENCE_FAILED"});expect(JSON.stringify(error.getResponse())).not.toMatch(/raw prisma|database-url|a{64}|billing-document:/);});

  it("serializes duplicate delivery into one claim and one reconciliation classification",async()=>{const first=row(),second=row({providerRequestHash:HASH,providerLastAttemptAt:ATTEMPT,providerReconciliationRequired:true});const ctx=context(first);ctx.tx.billingDocument.findUnique.mockResolvedValueOnce(first).mockResolvedValueOnce(second);expect((await ctx.service.claim(input())).classification).toBe("CLAIMED");expect((await ctx.service.claim(input())).classification).toBe("RECONCILIATION_REQUIRED");expect(ctx.tx.billingDocument.updateMany).toHaveBeenCalledTimes(1);expect(ctx.clock.now).toHaveBeenCalledTimes(1);});

  it("uses independent row-lock identities for different documents and no global mutex",async()=>{const a=context(row()),b=context(row({id:"document-b",fiscalNumber:"00100001010000000043",issuanceIdempotencyKey:"billing-document:document-b:electronic-issuance:v1"}));await a.service.claim(input());await b.service.claim(input("document-b","00100001010000000043"));expect(a.tx.$queryRaw.mock.calls[0][1]).toBe("document-a");expect(b.tx.$queryRaw.mock.calls[0][1]).toBe("document-b");expect(a.tx.billingDocument.updateMany).toHaveBeenCalledTimes(1);expect(b.tx.billingDocument.updateMany).toHaveBeenCalledTimes(1);});

  it("contains no provider, Redis, BCCR, Hacienda, or secondary persistence operation",async()=>{const ctx=context(row());await ctx.service.claim(input());expect(Object.keys(ctx.tx).sort()).toEqual(["$queryRaw","billingDocument"]);expect(Object.keys(ctx.tx.billingDocument).sort()).toEqual(["findUnique","updateMany"]);});
});

function context(persisted:ReturnType<typeof row>|null,options:{locked?:Array<{id:string}>;count?:number;transactionError?:Error}={}){const tx={$queryRaw:jest.fn().mockResolvedValue(options.locked??[{id:"document-a"}]),billingDocument:{findUnique:jest.fn().mockResolvedValue(persisted),updateMany:jest.fn().mockResolvedValue({count:options.count??1})}};const prisma={$transaction:jest.fn(async(callback:(value:typeof tx)=>unknown)=>{if(options.transactionError)throw options.transactionError;return callback(tx);})};const clock={now:jest.fn(()=>ATTEMPT)};return{tx,prisma,clock,service:new BillingDocumentSubmissionAttemptService(prisma as unknown as PrismaService,clock as unknown as FiscalIssuanceClock)};}
function row(overrides:Record<string,unknown>={}){return{id:"document-a",tenantId:"tenant-a",billingMode:"ELECTRONIC_PROVIDER",lifecycleStatus:"CONFIRMED",providerStatus:"PENDING",taxAuthorityStatus:"NOT_SUBMITTED",documentTypeCode:"01",billingDocumentNumberSequenceId:"sequence-a",allocatedSequenceNumber:42n,fiscalNumber:FISCAL_NUMBER,issuanceIdempotencyKey:"billing-document:document-a:electronic-issuance:v1",fiscalIssueDate:new Date("2026-08-24T00:00:00Z"),providerRequestHash:null,providerLastAttemptAt:null,providerLastErrorCode:null,providerLastErrorAt:null,providerReconciliationRequired:false,providerDocumentId:null,haciendaKey:null,providerEnvironment:null,submittedAt:null,...overrides};}
function input(id="document-a",fiscalNumber=FISCAL_NUMBER):BillingDocumentSubmissionPreparationResult{return{identity:{tenantId:"tenant-a",billingDocumentId:id},allocationIdentity:{billingDocumentNumberSequenceId:"sequence-a",allocatedSequenceNumber:"42"},preparedSubmission:{endpoint:"/documents/factura",canonicalBody:'{"safe":true}',requestHash:HASH,idempotencyKey:`billing-document:${id}:electronic-issuance:v1`,metadata:{billingDocumentId:id,tenantId:"tenant-a",documentTypeCode:"01",fiscalNumber,fiscalIssueDate:"2026-08-24"}},providerState:{billingMode:"ELECTRONIC_PROVIDER",lifecycleStatus:"CONFIRMED",providerStatus:"PENDING",taxAuthorityStatus:"NOT_SUBMITTED",providerDocumentId:null,providerEnvironment:null,providerRequestHash:null,providerLastAttemptAt:null,providerLastErrorCode:null,providerLastErrorAt:null,providerReconciliationRequired:false,haciendaKey:null,submittedAt:null}};}
async function capture(promise:Promise<unknown>){try{await promise;throw new Error("expected error");}catch(error){expect(error).toBeInstanceOf(HttpException);return error as HttpException;}}
function overridesToRecord(value:object):Record<string,unknown>{return value as Record<string,unknown>;}
