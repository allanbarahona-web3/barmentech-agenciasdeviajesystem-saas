import { AccountReceivableStatus, Prisma } from "@prisma/client";
import { FiscalCreditNoteFinanceEffectService } from "./fiscal-credit-note-finance-effect.service";
import { FISCAL_CREDIT_NOTE_FINANCE_EFFECT_REQUESTED_EVENT_TYPE } from "./jobs/fiscal-accepted-fanout.constants";
const d=(v:string)=>new Prisma.Decimal(v);

describe("FiscalCreditNoteFinanceEffectService",()=>{
  it.each([["100","25","75","0"],["10","25","0","15"],["0","25","0","25"]])("reduces Factura AR before available credit (%s/%s)",async(outstanding,total,expectedOutstanding,expectedAvailable)=>{
    const c=context({outstanding,total}); await c.service.applyClaimedEvent(claim());
    expect(c.ar.outstandingAmount.toFixed()).toBe(expectedOutstanding);
    expect(c.ar.originalAmount.toFixed()).toBe("100");
    expect(c.effect.availableCreditAmount.toFixed()).toBe(expectedAvailable);
    expect(c.effect.amountAppliedToAr.toFixed()).toBe(d(total).minus(expectedAvailable).toFixed());
    if (d(total).minus(expectedAvailable).gt(0)) expect(c.tx.accountReceivable.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:expectedOutstanding==="0"?AccountReceivableStatus.SETTLED:AccountReceivableStatus.PARTIALLY_SETTLED})}));
    else expect(c.tx.accountReceivable.update).not.toHaveBeenCalled();
  });
  it("creates full available credit for a Tiquete without fabricating AR",async()=>{
    const c=context({type:"04",total:"25"}); await c.service.applyClaimedEvent(claim());
    expect(c.tx.accountReceivable.findUnique).not.toHaveBeenCalled(); expect(c.effect.amountAppliedToAr.toFixed()).toBe("0"); expect(c.effect.availableCreditAmount.toFixed()).toBe("25"); expect(c.adjustments).toHaveLength(0);
  });
  it("is idempotent for a repeated accepted-NC child",async()=>{
    const c=context({outstanding:"10",total:"25"}); await c.service.applyClaimedEvent(claim()); await c.service.applyClaimedEvent(claim());
    expect(c.ar.outstandingAmount.toFixed()).toBe("0"); expect(c.effects).toHaveLength(1); expect(c.adjustments).toHaveLength(1);
  });
});

function claim(){return{tenantId:"tenant-a",billingOutboxEventId:"child-a",lockOwner:"worker-a"};}
function context(options:{type?:"01"|"04";outstanding?:string;total?:string}={}){
 const type=options.type??"01", total=d(options.total??"25"), ar={id:"ar-a",customerId:"customer-a",currencyCode:"CRC",originalAmount:d("100"),outstandingAmount:d(options.outstanding??"100")}; const effects:any[]=[],adjustments:any[]=[];
 const child:any={id:"child-a",tenantId:"tenant-a",eventType:FISCAL_CREDIT_NOTE_FINANCE_EFFECT_REQUESTED_EVENT_TYPE,eventVersion:1,aggregateType:"BillingDocument",aggregateId:"nc-a",causationId:"parent-a",payload:{tenantId:"tenant-a",billingDocumentId:"nc-a",eventVersion:1}};
 const nc:any={id:"nc-a",tenantId:"tenant-a",documentTypeCode:"03",taxAuthorityStatus:"ACCEPTED",customerId:"customer-a",currencyCode:"CRC",total,taxAuthorityFinalizedAt:new Date("2026-10-08T12:00:00.000Z"),references:[{referencedBillingDocumentId:"original-a",referencedDocumentTypeCode:type,referenceOrder:1}]};
 const original:any={id:"original-a",customerId:"customer-a",currencyCode:"CRC",documentTypeCode:type,taxAuthorityStatus:"ACCEPTED"};
 const tx:any={
  $queryRaw:jest.fn(async(strings:any)=>{const sql=String(strings);if(sql.includes('"billing_outbox_events"'))return[{id:"child-a"}];if(sql.includes('"fiscal_credit_note_finance_effects"'))return effects; if(sql.includes('"account_receivables"'))return[{id:"ar-a"}];return[];}),
  $executeRaw:jest.fn(async(strings:any,...values:any[])=>{const sql=String(strings);if(sql.includes('"fiscal_credit_note_finance_effects"')){effects.push({id:values[0],tenantId:values[1],customerId:values[2],currencyCode:values[3],creditNoteBillingDocumentId:values[4],referencedBillingDocumentId:values[5],affectedAccountReceivableId:values[6],totalCreditAmount:values[7],amountAppliedToAr:values[8],availableCreditAmount:values[9]});}if(sql.includes('"fiscal_credit_note_ar_adjustments"'))adjustments.push(values);return 1;}),
  billingOutboxEvent:{findUnique:jest.fn().mockResolvedValue(child),updateMany:jest.fn().mockResolvedValue({count:1})},
  billingDocument:{findUnique:jest.fn(async({where}:any)=>where.id_tenantId.id==="nc-a"?nc:original)},
  accountReceivable:{findUnique:jest.fn().mockResolvedValue(ar),update:jest.fn(async({data}:any)=>Object.assign(ar,data))},
 };
 const prisma:any={...tx,$transaction:async(fn:any)=>fn(tx)};return{service:new FiscalCreditNoteFinanceEffectService(prisma),tx,ar,effects,adjustments,get effect(){return effects[0];}};
}
