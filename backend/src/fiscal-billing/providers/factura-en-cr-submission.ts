import { createHash } from "node:crypto";
import { buildRequestIdentity, buildResponseHash } from "../../official-exchange-rates/official-exchange-rate.resolver";

export type FacturaEnCrPreparationErrorCode = "FACTURA_EN_CR_DOCUMENT_TYPE_UNSUPPORTED" | "FACTURA_EN_CR_SNAPSHOT_INCOMPLETE" | "FACTURA_EN_CR_RECEIVER_INVALID" | "FACTURA_EN_CR_PAYMENT_METHODS_UNSUPPORTED" | "FACTURA_EN_CR_DISCOUNT_UNSUPPORTED" | "FACTURA_EN_CR_LINE_TAX_INVALID" | "FACTURA_EN_CR_ALLOCATION_MISMATCH" | "FACTURA_EN_CR_FISCAL_TIMESTAMP_MISMATCH" | "FACTURA_EN_CR_OFFICIAL_RATE_MISMATCH" | "FACTURA_EN_CR_CANONICAL_SERIALIZATION_FAILED";
export class FacturaEnCrPreparationError extends Error { constructor(readonly code: FacturaEnCrPreparationErrorCode) { super(code); this.name = "FacturaEnCrPreparationError"; } }

/** A later tenant-scoped adapter must construct this from one authoritative BillingDocument read. This type proves shape, not DB provenance. */
export interface FacturaEnCrSubmissionAggregate {
  id: string; tenantId: string; documentTypeCode: string; issuerIdentification: string; issuerEconomicActivityCode: string | null;
  issuerEstablishmentCode: string | null; issuerTerminalCode: string | null; billingDocumentNumberSequenceId: string | null;
  allocatedSequenceNumber: string | bigint | null; fiscalNumber: string | null; issuanceIdempotencyKey: string | null;
  fiscalEmissionAt: Date | null; fiscalIssueDate: Date | string | null; currencyCode: string; exchangeRate: string | null;
  officialExchangeRateObservation: FacturaEnCrOfficialRateSnapshot | null; paymentConditionCode: string | null; creditTermDays: number | null;
  receiver: FacturaEnCrReceiverSnapshot | null; paymentMethods: Array<{ paymentMethodOrder: number; paymentMethodCode: string; description: string | null; declaredAmount: string | null }>;
  lines: FacturaEnCrLineSnapshot[];
}
export interface FacturaEnCrOfficialRateSnapshot { id: string; countryCode: string; foreignCurrencyCode: string; localCurrencyCode: string; rateType: string; effectiveDate: Date | string; value: string; sourceAuthority: string; sourceIndicatorCode: string; requestIdentity: string; responseHash: string | null; }
export interface FacturaEnCrReceiverSnapshot { name: string | null; identificationType: string | null; identification: string | null; economicActivityCode: string | null; email: string | null; /** Unconstrained persisted phone is intentionally not parsed/emitted. */ phone: string | null; address: { provinceCode?: unknown; cantonCode?: unknown; districtCode?: unknown; neighborhoodCode?: unknown; otherAddressDetails?: unknown } | null; }
export interface FacturaEnCrLineSnapshot { lineNumber: number; cabysCode: string | null; itemCode?: string | null; description: string; quantity: string; unitOfMeasureCode: string; unitPrice: string; grossAmount: string; discountAmount: string; discountCode: string | null; discountReason: string | null; taxableBase: string; taxAmount: string; exoneratedTaxAmount: string; netTaxAmount: string; lineSubtotal: string; lineTotal: string; taxes: FacturaEnCrTaxSnapshot[]; }
export interface FacturaEnCrTaxSnapshot { taxOrder: number; taxCode: string; rateCode: string; ratePercentage: string; taxableBase: string; taxAmount: string; calculationFactor: string | null; netTaxAmount: string; exemption: null | { documentTypeCode: string; documentNumber: string; legalArticle: string | null; legalSection: string | null; issuingInstitutionCode: string | null; issuingInstitutionName: string | null; otherInstitutionDescription: string | null; issueDate: Date | string; exemptedPercentage: string; exemptedAmount: string }; }
export interface FacturaEnCrPreparedSubmission { endpoint: "/documents/factura" | "/documents/tiquete"; canonicalBody: string; requestHash: string; idempotencyKey: string; metadata: { billingDocumentId: string; tenantId: string; documentTypeCode: "01" | "04"; fiscalNumber: string }; }

type Json = string | boolean | null | ExactDecimal | Json[] | { [key: string]: Json }; class ExactDecimal { constructor(readonly value: string) {} }
type Dec = { coefficient: bigint; scale: number; canonical: string };
const PAYMENTS = new Set(["01","02","03","04","05","06","07","99"]), DISCOUNTS = new Set(["01","02","03","04","05","06","07","08","09"]);
const EXEMPTION_DOCS = new Set(["01","02","03","04","05","06","07","08","09","10","11"]), ARTICLE = new Set(["02","03","06","07","08"]), INSTITUTIONS = new Set(["01","02","03","04","05","06","07","08","09","10","11","12","99"]);
// Current draft-flow subset: ordinary IVA only. Additional persisted taxes are rejected, never dropped.
const IVA_RATES: Readonly<Record<string,string>> = { "01":"0", "02":"1", "03":"2", "04":"4", "08":"13", "09":"0.5", "10":"0", "11":"0" };

export function prepareFacturaEnCrSubmission(d: FacturaEnCrSubmissionAggregate): FacturaEnCrPreparedSubmission {
  const endpoint = d.documentTypeCode === "01" ? "/documents/factura" : d.documentTypeCode === "04" ? "/documents/tiquete" : fail("FACTURA_EN_CR_DOCUMENT_TYPE_UNSUPPORTED");
  const branch = required(d.issuerEstablishmentCode), terminal = required(d.issuerTerminalCode);
  if (!/^\d{3}$/.test(branch) || !/^\d{5}$/.test(terminal) || !d.billingDocumentNumberSequenceId) fail("FACTURA_EN_CR_ALLOCATION_MISMATCH");
  const rawBase = typeof d.allocatedSequenceNumber === "bigint" ? d.allocatedSequenceNumber.toString() : d.allocatedSequenceNumber;
  if (!rawBase || !/^[1-9]\d{0,9}$/.test(rawBase)) fail("FACTURA_EN_CR_ALLOCATION_MISMATCH");
  const base = rawBase.padStart(10,"0"), fiscalNumber = branch + terminal + d.documentTypeCode + base;
  if (fiscalNumber.length !== 20 || d.fiscalNumber !== fiscalNumber) fail("FACTURA_EN_CR_ALLOCATION_MISMATCH");
  const idempotencyKey = `billing-document:${d.id}:electronic-issuance:v1`;
  if (idempotencyKey.length > 100 || d.issuanceIdempotencyKey !== idempotencyKey) fail("FACTURA_EN_CR_SNAPSHOT_INCOMPLETE");
  const receiver = mapReceiver(d.receiver, d.documentTypeCode), fechaEmision = emissionTime(d.fiscalEmissionAt, d.fiscalIssueDate);
  const methods = [...d.paymentMethods].sort((a,b) => a.paymentMethodOrder-b.paymentMethodOrder);
  if (methods.length !== 1 || !positiveInt(methods[0].paymentMethodOrder) || !PAYMENTS.has(methods[0].paymentMethodCode) || methods[0].declaredAmount !== null) fail("FACTURA_EN_CR_PAYMENT_METHODS_UNSUPPORTED");
  if (!d.lines.length) fail("FACTURA_EN_CR_LINE_TAX_INVALID"); uniquePositive(d.lines.map(x=>x.lineNumber));
  // Root order: issuer/allocation, emission, activity, commerce, currency, receiver, detail.
  const body: { [key:string]: Json } = { emisorLegalId: required(d.issuerIdentification), branchCode: branch, terminalCode: terminal, consecutivoNumero: base, fechaEmision, situacion: "1", codigoActividad: required(d.issuerEconomicActivityCode) };
  if (d.paymentConditionCode === "01" && d.creditTermDays === null) body.condicionVenta = "01";
  else if (d.paymentConditionCode === "02" && Number.isSafeInteger(d.creditTermDays) && d.creditTermDays! > 0) { body.condicionVenta="02"; body.plazoCredito=String(d.creditTermDays); }
  else fail("FACTURA_EN_CR_SNAPSHOT_INCOMPLETE");
  body.medioPago=[methods[0].paymentMethodCode];
  if (d.currencyCode === "CRC") { if (d.exchangeRate !== null || d.officialExchangeRateObservation !== null) fail("FACTURA_EN_CR_OFFICIAL_RATE_MISMATCH"); body.currency="CRC"; }
  else if (d.currencyCode === "USD") { const value=officialRate(d.officialExchangeRateObservation,d.exchangeRate,dateOnly(d.fiscalIssueDate)); body.currency="USD"; body.exchangeRate=new ExactDecimal(value); }
  else fail("FACTURA_EN_CR_OFFICIAL_RATE_MISMATCH");
  if (receiver) { if (d.receiver!.economicActivityCode) body.codigoActividadReceptor=d.receiver!.economicActivityCode; body.receptor=receiver; }
  body.detalle=[...d.lines].sort((a,b)=>a.lineNumber-b.lineNumber).map(mapLine);
  let canonicalBody: string; try { canonicalBody=serialize(body); } catch(error) { if(error instanceof FacturaEnCrPreparationError) throw error; fail("FACTURA_EN_CR_CANONICAL_SERIALIZATION_FAILED"); }
  return { endpoint,canonicalBody,requestHash:createHash("sha256").update(canonicalBody,"utf8").digest("hex"),idempotencyKey,metadata:{billingDocumentId:d.id,tenantId:d.tenantId,documentTypeCode:d.documentTypeCode as "01"|"04",fiscalNumber} };
}

function officialRate(o: FacturaEnCrOfficialRateSnapshot|null, exchangeRate:string|null, issueDate:string):string {
  if (!o?.id || o.countryCode!=="CR" || o.foreignCurrencyCode!=="USD" || o.localCurrencyCode!=="CRC" || o.rateType!=="REFERENCE_SELL" || dateOnly(o.effectiveDate,"FACTURA_EN_CR_OFFICIAL_RATE_MISMATCH")!==issueDate || o.sourceAuthority!=="BCCR" || o.sourceIndicatorCode!=="318" || !/^[a-f0-9]{64}$/.test(o.responseHash??"")) fail("FACTURA_EN_CR_OFFICIAL_RATE_MISMATCH");
  const value=decimal(o.value,30,12,true,"FACTURA_EN_CR_OFFICIAL_RATE_MISMATCH").canonical, persisted=decimal(exchangeRate,30,12,true,"FACTURA_EN_CR_OFFICIAL_RATE_MISMATCH").canonical;
  const identity={countryCode:"CR",foreignCurrencyCode:"USD",localCurrencyCode:"CRC",rateType:"REFERENCE_SELL" as const,effectiveDate:issueDate,sourceAuthority:"BCCR",sourceIndicatorCode:"318"};
  if(value!==persisted || o.requestIdentity!==buildRequestIdentity(identity) || o.responseHash!==buildResponseHash(identity,value)) fail("FACTURA_EN_CR_OFFICIAL_RATE_MISMATCH"); return value;
}
function mapReceiver(r:FacturaEnCrReceiverSnapshot|null,type:string):Json|null {
  const any=r&&Object.values(r).some(v=>v!==null); if(!any){if(type==="01")fail("FACTURA_EN_CR_RECEIVER_INVALID");return null;}
  if(!r?.name?.trim()||!r.identificationType||!r.identification)fail("FACTURA_EN_CR_RECEIVER_INVALID");
  // Receiver order: identity/name, optional activity/email, location. Phone and neighborhood code are omitted.
  const out:{[key:string]:Json}={tipoIdentificacion:r.identificationType,numeroIdentificacion:r.identification,nombre:r.name}; if(r.economicActivityCode)out.codigoActividad=r.economicActivityCode;if(r.email)out.correoElectronico=r.email;
  if(r.address){const allowed=new Set(["provinceCode","cantonCode","districtCode","neighborhoodCode","otherAddressDetails"]);if(Object.keys(r.address).some(k=>!allowed.has(k)))fail("FACTURA_EN_CR_RECEIVER_INVALID");const {provinceCode:p,cantonCode:c,districtCode:di,otherAddressDetails:o}=r.address;if(typeof p!=="string"||!/^\d$/.test(p)||typeof c!=="string"||!/^\d{2}$/.test(c)||typeof di!=="string"||!/^\d{2}$/.test(di)||typeof o!=="string"||!o.trim())fail("FACTURA_EN_CR_RECEIVER_INVALID");out.ubicacion={provincia:p,canton:c,distrito:di,otrasSenas:o};} return out;
}
function mapLine(l:FacturaEnCrLineSnapshot):Json {
  if(!/^\d{13}$/.test(l.cabysCode??"")||!l.description.trim()||!l.unitOfMeasureCode.trim())fail("FACTURA_EN_CR_LINE_TAX_INVALID");
  const q=decimal(l.quantity,18,4,true),price=decimal(l.unitPrice,18,4,false),gross=decimal(l.grossAmount,18,4,false),discount=decimal(l.discountAmount,18,4,false),base=decimal(l.taxableBase,18,4,false),taxTotal=decimal(l.taxAmount,18,4,false),exemptedTotal=decimal(l.exoneratedTaxAmount,18,4,false),netTotal=decimal(l.netTaxAmount,18,4,false),subtotal=decimal(l.lineSubtotal,18,4,false),total=decimal(l.lineTotal,18,4,false);
  if(!eq(mul(q,price),gross)||!eq(sub(gross,discount),subtotal)||!eq(base,subtotal))fail("FACTURA_EN_CR_LINE_TAX_INVALID");
  const taxes=[...l.taxes].sort((a,b)=>a.taxOrder-b.taxOrder);if(taxes.length!==1)fail("FACTURA_EN_CR_LINE_TAX_INVALID");uniquePositive(taxes.map(x=>x.taxOrder));let taxSum=zero(),exSum=zero(),netSum=zero();
  const mapped=taxes.map(t=>{const x=mapTax(t);if(!eq(x.base,base))fail("FACTURA_EN_CR_LINE_TAX_INVALID");taxSum=add(taxSum,x.amount);exSum=add(exSum,x.exempted);netSum=add(netSum,x.net);return x.json;});if(!eq(taxSum,taxTotal)||!eq(exSum,exemptedTotal)||!eq(netSum,netTotal)||!eq(add(subtotal,netTotal),total))fail("FACTURA_EN_CR_LINE_TAX_INVALID");
  const out:{[key:string]:Json}={codigoCabys:l.cabysCode!,cantidad:new ExactDecimal(q.canonical),unidadMedida:l.unitOfMeasureCode,detalle:l.description,precioUnitario:new ExactDecimal(price.canonical)};
  if(discount.coefficient!==0n){if(!l.discountCode||!DISCOUNTS.has(l.discountCode)||(["01","03"].includes(l.discountCode)&&!eq(discount,gross)))fail("FACTURA_EN_CR_DISCOUNT_UNSUPPORTED");out.descuento=[{montoDescuento:new ExactDecimal(discount.canonical),codigoDescuento:l.discountCode,...(l.discountReason?{naturalezaDescuento:l.discountReason}:{})}];}else if(l.discountCode||l.discountReason)fail("FACTURA_EN_CR_DISCOUNT_UNSUPPORTED");out.impuesto=mapped;return out;
}
function mapTax(t:FacturaEnCrTaxSnapshot):{json:Json;base:Dec;amount:Dec;exempted:Dec;net:Dec}{
  if(t.taxCode!=="01"||!(t.rateCode in IVA_RATES))fail("FACTURA_EN_CR_LINE_TAX_INVALID");const rate=decimal(t.ratePercentage,7,4,false);if(rate.canonical!==IVA_RATES[t.rateCode]||t.calculationFactor!==null)fail("FACTURA_EN_CR_LINE_TAX_INVALID");const base=decimal(t.taxableBase,18,4,false);const amount=decimal(t.taxAmount,18,4,false),net=decimal(t.netTaxAmount,18,4,false);if(!eq(percent(base,rate),amount))fail("FACTURA_EN_CR_LINE_TAX_INVALID");let exempted=zero();const json:{[key:string]:Json}={codigo:t.taxCode,codigoTarifa:t.rateCode,tarifa:new ExactDecimal(rate.canonical)};if(t.exemption){const x=mapExemption(t.exemption);json.exoneracion=x.json;exempted=x.amount;}if(!eq(sub(amount,exempted),net))fail("FACTURA_EN_CR_LINE_TAX_INVALID");return{json,base,amount,exempted,net};
}
function mapExemption(x:NonNullable<FacturaEnCrTaxSnapshot["exemption"]>):{json:Json;amount:Dec}{
  if(!EXEMPTION_DOCS.has(x.documentTypeCode)||!INSTITUTIONS.has(x.issuingInstitutionCode??"")||!x.documentNumber.trim())fail("FACTURA_EN_CR_LINE_TAX_INVALID");if(ARTICLE.has(x.documentTypeCode)&&(!x.legalArticle?.trim()||!x.legalSection?.trim()))fail("FACTURA_EN_CR_LINE_TAX_INVALID");if(x.issuingInstitutionCode==="99"&&!x.otherInstitutionDescription?.trim())fail("FACTURA_EN_CR_LINE_TAX_INVALID");if(x.issuingInstitutionCode!=="99"&&x.otherInstitutionDescription)fail("FACTURA_EN_CR_LINE_TAX_INVALID");const pct=decimal(x.exemptedPercentage,7,4,false),amount=decimal(x.exemptedAmount,18,4,false);if(cmp(pct,decimal("100",7,4,false))>0)fail("FACTURA_EN_CR_LINE_TAX_INVALID");const json:{[key:string]:Json}={tipoDocumento:x.documentTypeCode,numeroDocumento:x.documentNumber,fechaEmision:`${dateOnly(x.issueDate,"FACTURA_EN_CR_LINE_TAX_INVALID")}T00:00:00-06:00`,nombreInstitucion:x.issuingInstitutionCode!,...(x.issuingInstitutionCode==="99"?{nombreInstitucionOtros:x.otherInstitutionDescription!}:{}),porcentajeExoneracion:new ExactDecimal(pct.canonical),montoExoneracion:new ExactDecimal(amount.canonical)};if(x.legalArticle)json.articulo=article(x.legalArticle);if(x.legalSection)json.inciso=article(x.legalSection);return{json,amount};
}
function emissionTime(at:Date|null,issue:Date|string|null):string{if(!at||!Number.isFinite(at.getTime()))fail("FACTURA_EN_CR_FISCAL_TIMESTAMP_MISMATCH");const shifted=new Date(at.getTime()-6*3_600_000),day=shifted.toISOString().slice(0,10);if(dateOnly(issue)!==day)fail("FACTURA_EN_CR_FISCAL_TIMESTAMP_MISMATCH");return shifted.toISOString().replace(/Z$/,"-06:00");}
function dateOnly(v:Date|string|null,code:FacturaEnCrPreparationErrorCode="FACTURA_EN_CR_SNAPSHOT_INCOMPLETE"):string{const s=v instanceof Date&&Number.isFinite(v.getTime())?v.toISOString().slice(0,10):v,m=typeof s==="string"?/^(\d{4})-(\d{2})-(\d{2})$/.exec(s):null;if(!m)fail(code);const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));if(d.getUTCFullYear()!==+m[1]||d.getUTCMonth()+1!==+m[2]||d.getUTCDate()!==+m[3])fail(code);return s as string;}
function decimal(v:string|null,precision:number,scale:number,positive:boolean,code:FacturaEnCrPreparationErrorCode="FACTURA_EN_CR_LINE_TAX_INVALID"):Dec{const m=typeof v==="string"?/^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(v):null;if(!m)fail(code);const i=m[1],raw=m[2]??"",f=raw.replace(/0+$/,"");if(f.length>scale||i.length>precision-scale||i.length+f.length>precision)fail(code);const canonical=f?`${i}.${f}`:i,result={coefficient:BigInt(i+f),scale:f.length,canonical};if(positive&&result.coefficient===0n)fail(code);return result;}
function align(a:Dec,b:Dec){const scale=Math.max(a.scale,b.scale);return{a:a.coefficient*10n**BigInt(scale-a.scale),b:b.coefficient*10n**BigInt(scale-b.scale),scale};}function norm(coefficient:bigint,scale:number):Dec{while(scale&&coefficient%10n===0n){coefficient/=10n;scale--;}const s=coefficient.toString().padStart(scale+1,"0");return{coefficient,scale,canonical:scale?`${s.slice(0,-scale)}.${s.slice(-scale)}`:s};}function add(a:Dec,b:Dec){const x=align(a,b);return norm(x.a+x.b,x.scale);}function sub(a:Dec,b:Dec){const x=align(a,b);if(x.a<x.b)fail("FACTURA_EN_CR_LINE_TAX_INVALID");return norm(x.a-x.b,x.scale);}function mul(a:Dec,b:Dec){return norm(a.coefficient*b.coefficient,a.scale+b.scale);}function percent(a:Dec,b:Dec){return norm(a.coefficient*b.coefficient,a.scale+b.scale+2);}function eq(a:Dec,b:Dec){const x=align(a,b);return x.a===x.b;}function cmp(a:Dec,b:Dec){const x=align(a,b);return x.a<x.b?-1:x.a>x.b?1:0;}function zero(){return norm(0n,0);}
function positiveInt(v:number){return Number.isSafeInteger(v)&&v>0;}function uniquePositive(v:number[]){if(v.some(x=>!positiveInt(x))||new Set(v).size!==v.length)fail("FACTURA_EN_CR_LINE_TAX_INVALID");}function article(v:string){if(!/^[A-Za-z0-9 .()/-]{1,20}$/.test(v))fail("FACTURA_EN_CR_LINE_TAX_INVALID");return v;}function required(v:string|null){if(!v||!v.trim())fail("FACTURA_EN_CR_SNAPSHOT_INCOMPLETE");return v;}
function serialize(v:Json):string{if(v instanceof ExactDecimal)return v.value;if(v===null||typeof v==="boolean"||typeof v==="string")return JSON.stringify(v);if(Array.isArray(v))return`[${v.map(serialize).join(",")}]`;if(typeof v!=="object"||v===undefined)fail("FACTURA_EN_CR_CANONICAL_SERIALIZATION_FAILED");return`{${Object.entries(v).map(([k,x])=>`${JSON.stringify(k)}:${serialize(x)}`).join(",")}}`;}
function fail(code:FacturaEnCrPreparationErrorCode):never{throw new FacturaEnCrPreparationError(code);}
