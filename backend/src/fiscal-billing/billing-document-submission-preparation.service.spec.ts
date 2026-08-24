import { HttpException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { BillingDocumentSubmissionPreparationService } from "./billing-document-submission-preparation.service";
import * as facturaBuilder from "./providers/factura-en-cr-submission";

describe("BillingDocumentSubmissionPreparationService",()=>{
  afterEach(()=>jest.restoreAllMocks());

  it("loads one tenant-scoped bounded aggregate, maps exact snapshots, and returns the builder result unchanged",async()=>{
    const findUnique=jest.fn().mockResolvedValue(row());
    const service=subject(findUnique), expected=prepared();
    const builder=jest.spyOn(facturaBuilder,"prepareFacturaEnCrSubmission").mockReturnValue(expected);
    const result=await service.prepare("tenant-a","document-a");

    expect(findUnique).toHaveBeenCalledTimes(1);
    const query=findUnique.mock.calls[0][0];
    expect(query.where).toEqual({id_tenantId:{id:"document-a",tenantId:"tenant-a"}});
    expect(query).toHaveProperty("select.lines.orderBy",[{lineNumber:"asc"},{id:"asc"}]);
    expect(query).toHaveProperty("select.lines.select.taxes.orderBy",[{taxOrder:"asc"},{id:"asc"}]);
    expect(query).toHaveProperty("select.paymentMethods.orderBy",[{paymentMethodOrder:"asc"},{id:"asc"}]);
    expect(query.select).not.toHaveProperty("sourceId");expect(query.select).not.toHaveProperty("issuerPhone");expect(query.select).not.toHaveProperty("issuerAddressSnapshot");
    expect(builder).toHaveBeenCalledTimes(1);
    const aggregate=builder.mock.calls[0][0];
    expect(aggregate.tenantId).toBe("tenant-a");expect(aggregate.id).toBe("document-a");
    expect(aggregate.allocatedSequenceNumber).toBe("9999999999");
    expect(aggregate.fiscalIssueDate).toBe("2026-08-24");expect(aggregate.fiscalEmissionAt).toEqual(new Date("2026-08-24T06:00:00.456Z"));
    expect(aggregate.lines[0]).toMatchObject({quantity:"0.000000000000000001",unitPrice:"999999999999999999.123456789012",discountCode:"07",discountReason:"Persisted"});
    expect(aggregate.lines[0].taxes[0].exemption).toMatchObject({documentNumber:"AUTH-1",issueDate:"2024-02-29",exemptedPercentage:"100"});
    expect(aggregate.receiver).toMatchObject({economicActivityCode:null,phone:"506 22220000",address:{provinceCode:"1",cantonCode:"01",districtCode:"02",neighborhoodCode:"03",otherAddressDetails:"Centro"}});
    expect(result.preparedSubmission).toBe(expected);
    expect(result.allocationIdentity).toEqual({billingDocumentNumberSequenceId:"sequence-a",allocatedSequenceNumber:"9999999999"});
    expect(result.preparedSubmission.canonicalBody).not.toContain("sequence-a");expect(result.preparedSubmission.canonicalBody).not.toContain("9999999999");
    expect(result.preparedSubmission.requestHash).toBe(createHash("sha256").update(result.preparedSubmission.canonicalBody,"utf8").digest("hex"));
    expect(result.identity).toEqual({tenantId:"tenant-a",billingDocumentId:"document-a"});
    expect(result.providerState).toMatchObject({providerStatus:"PENDING",providerReconciliationRequired:false});
  });

  it.each([["missing",null],["foreign tenant",null]])("makes %s documents indistinguishable",async(_label,value)=>{
    const findUnique=jest.fn().mockResolvedValue(value),service=subject(findUnique);
    const error=await capture(service.prepare("tenant-a","document-a"));
    expect(error.getStatus()).toBe(404);expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_NOT_FOUND"});
    expect(findUnique.mock.calls[0][0].where).toEqual({id_tenantId:{id:"document-a",tenantId:"tenant-a"}});
  });

  it("rejects a tenant mismatch in any tenant-owned nested snapshot before the builder",async()=>{
    const corrupt=row();corrupt.lines[0].taxes[0].exemption!.tenantId="tenant-b";
    const builder=jest.spyOn(facturaBuilder,"prepareFacturaEnCrSubmission");
    const error=await capture(subject(jest.fn().mockResolvedValue(corrupt)).prepare("tenant-a","document-a"));
    expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_SUBMISSION_SNAPSHOT_INVALID"});expect(builder).not.toHaveBeenCalled();
  });

  it("maps the complete frozen BCCR identity linked by the document",async()=>{
    const usd=row({currencyCode:"USD",exchangeRate:d("512.123456789012"),officialExchangeRateObservationId:"obs-a",
      fiscalExchangeRateEffectiveDate:new Date("2026-08-24T00:00:00.000Z"),fiscalExchangeRateSourceAuthority:"BCCR",fiscalExchangeRateIndicatorCode:"318",
      officialExchangeRateObservation:{id:"obs-a",countryCode:"CR",foreignCurrencyCode:"USD",localCurrencyCode:"CRC",rateType:"REFERENCE_SELL",effectiveDate:new Date("2026-08-24T00:00:00.000Z"),value:d("512.123456789012"),sourceAuthority:"BCCR",sourceIndicatorCode:"318",requestIdentity:"identity",responseHash:"a".repeat(64)}});
    const builder=jest.spyOn(facturaBuilder,"prepareFacturaEnCrSubmission").mockReturnValue(prepared());
    await subject(jest.fn().mockResolvedValue(usd)).prepare("tenant-a","document-a");
    expect(builder.mock.calls[0][0].officialExchangeRateObservation).toEqual({id:"obs-a",countryCode:"CR",foreignCurrencyCode:"USD",localCurrencyCode:"CRC",rateType:"REFERENCE_SELL",effectiveDate:"2026-08-24",value:"512.123456789012",sourceAuthority:"BCCR",sourceIndicatorCode:"318",requestIdentity:"identity",responseHash:"a".repeat(64)});
  });

  it("passes receiver codes through without guessing phone, neighborhood, or missing activity into the provider body",async()=>{
    const valid=row({allocatedSequenceNumber:42n,lines:[{id:"line-a",tenantId:"tenant-a",lineNumber:1,cabysCode:"1234567890123",itemCode:null,description:"Service",quantity:d("1.0000"),unitOfMeasureCode:"Sp",unitPrice:d("100.0000"),grossAmount:d("100.0000"),discountAmount:d("0.0000"),discountCode:null,discountReason:null,taxableBase:d("100.0000"),taxAmount:d("13.0000"),exoneratedTaxAmount:d("0.0000"),netTaxAmount:d("13.0000"),lineSubtotal:d("100.0000"),lineTotal:d("113.0000"),taxes:[{id:"tax-a",tenantId:"tenant-a",taxOrder:1,taxCode:"01",rateCode:"08",ratePercentage:d("13.0000"),taxableBase:d("100.0000"),taxAmount:d("13.0000"),calculationFactor:null,netTaxAmount:d("13.0000"),exemption:null}]}]});
    const builder=jest.spyOn(facturaBuilder,"prepareFacturaEnCrSubmission");
    const result=await subject(jest.fn().mockResolvedValue(valid)).prepare("tenant-a","document-a");
    expect(builder).toHaveBeenCalledTimes(1);const body=JSON.parse(result.preparedSubmission.canonicalBody);
    expect(body.receptor.ubicacion).toEqual({provincia:"1",canton:"01",distrito:"02",otrasSenas:"Centro"});
    expect(body.receptor).not.toHaveProperty("telefono");expect(body.receptor).not.toHaveProperty("codigoActividad");expect(body.receptor.ubicacion).not.toHaveProperty("barrio");
  });

  it("fails safely for incomplete eligibility, builder rejection, and Prisma read errors",async()=>{
    const incomplete=row({fiscalNumber:null});
    jest.spyOn(facturaBuilder,"prepareFacturaEnCrSubmission").mockImplementationOnce(()=>{throw new facturaBuilder.FacturaEnCrPreparationError("FACTURA_EN_CR_ALLOCATION_MISMATCH");});
    let error=await capture(subject(jest.fn().mockResolvedValue(incomplete)).prepare("tenant-a","document-a"));
    expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_SUBMISSION_PREPARATION_FAILED"});expect(JSON.stringify(error.getResponse())).not.toContain("FACTURA_EN_CR");
    error=await capture(subject(jest.fn().mockRejectedValue(new Error("raw prisma secret"))).prepare("tenant-a","document-a"));
    expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_SUBMISSION_READ_FAILED"});expect(JSON.stringify(error.getResponse())).not.toContain("raw prisma secret");
  });

  it.each([{billingDocumentNumberSequenceId:null},{allocatedSequenceNumber:null}])("fails safely when frozen allocation identity is missing: %o",async override=>{
    const builder=jest.spyOn(facturaBuilder,"prepareFacturaEnCrSubmission");const findUnique=jest.fn().mockResolvedValue(row(override));
    const error=await capture(subject(findUnique).prepare("tenant-a","document-a"));
    expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_SUBMISSION_SNAPSHOT_INVALID"});expect(builder).not.toHaveBeenCalled();expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it("performs no writes or external lookups",async()=>{
    const prisma={billingDocument:{findUnique:jest.fn().mockResolvedValue(row()),update:jest.fn()},salesOrder:{findFirst:jest.fn()},client:{findFirst:jest.fn()},officialExchangeRateObservation:{findUnique:jest.fn()},$transaction:jest.fn()};
    jest.spyOn(facturaBuilder,"prepareFacturaEnCrSubmission").mockReturnValue(prepared());
    await new BillingDocumentSubmissionPreparationService(prisma as unknown as PrismaService).prepare("tenant-a","document-a");
    expect(prisma.billingDocument.update).not.toHaveBeenCalled();expect(prisma.salesOrder.findFirst).not.toHaveBeenCalled();expect(prisma.client.findFirst).not.toHaveBeenCalled();expect(prisma.officialExchangeRateObservation.findUnique).not.toHaveBeenCalled();expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

function subject(findUnique:jest.Mock){return new BillingDocumentSubmissionPreparationService({billingDocument:{findUnique}} as unknown as PrismaService);}
function d(value:string){return new Prisma.Decimal(value);}
function row(overrides:Record<string,unknown>={}){return{id:"document-a",tenantId:"tenant-a",documentTypeCode:"01",billingMode:"ELECTRONIC_PROVIDER",lifecycleStatus:"CONFIRMED",
  issuerIdentification:"3101000000",issuerEconomicActivityCode:"791100",issuerEstablishmentCode:"001",issuerTerminalCode:"00001",
  billingDocumentNumberSequenceId:"sequence-a",allocatedSequenceNumber:9999999999n,fiscalNumber:"00100001010000000042",issuanceIdempotencyKey:"billing-document:document-a:electronic-issuance:v1",
  fiscalEmissionAt:new Date("2026-08-24T06:00:00.456Z"),fiscalIssueDate:new Date("2026-08-24T00:00:00.000Z"),currencyCode:"CRC",exchangeRate:null,
  officialExchangeRateObservationId:null,fiscalExchangeRateEffectiveDate:null,fiscalExchangeRateSourceAuthority:null,fiscalExchangeRateIndicatorCode:null,officialExchangeRateObservation:null,
  paymentConditionCode:"01",creditTermDays:null,receiverName:"Receiver",receiverIdentificationType:"02",receiverIdentification:"3101999999",receiverEconomicActivityCode:null,
  receiverEmail:null,receiverPhone:"506 22220000",receiverAddressSnapshot:{provinceCode:"1",cantonCode:"01",districtCode:"02",neighborhoodCode:"03",otherAddressDetails:"Centro"},
  providerStatus:"PENDING",taxAuthorityStatus:"NOT_SUBMITTED",providerDocumentId:null,providerEnvironment:null,providerRequestHash:null,providerLastAttemptAt:null,providerLastErrorCode:null,providerLastErrorAt:null,providerReconciliationRequired:false,haciendaKey:null,submittedAt:null,
  paymentMethods:[{id:"payment-a",tenantId:"tenant-a",paymentMethodOrder:1,paymentMethodCode:"01",description:null,declaredAmount:null}],
  lines:[{id:"line-a",tenantId:"tenant-a",lineNumber:1,cabysCode:"1234567890123",itemCode:null,description:"Service",quantity:d("0.000000000000000001"),unitOfMeasureCode:"Sp",unitPrice:d("999999999999999999.123456789012"),grossAmount:d("100"),discountAmount:d("10"),discountCode:"07",discountReason:"Persisted",taxableBase:d("90"),taxAmount:d("11.7"),exoneratedTaxAmount:d("11.7"),netTaxAmount:d("0"),lineSubtotal:d("90"),lineTotal:d("90"),taxes:[{id:"tax-a",tenantId:"tenant-a",taxOrder:1,taxCode:"01",rateCode:"08",ratePercentage:d("13"),taxableBase:d("90"),taxAmount:d("11.7"),calculationFactor:null,netTaxAmount:d("0"),exemption:{id:"ex-a",tenantId:"tenant-a",documentTypeCode:"01",documentNumber:"AUTH-1",legalArticle:null,legalSection:null,issuingInstitutionCode:"01",issuingInstitutionName:"Hacienda",otherInstitutionDescription:null,issueDate:new Date("2024-02-29T00:00:00.000Z"),exemptedPercentage:d("100"),exemptedAmount:d("11.7")}}]}],...overrides};}
function prepared(){const canonicalBody='{"safe":true}';return{endpoint:"/documents/factura" as const,canonicalBody,requestHash:createHash("sha256").update(canonicalBody,"utf8").digest("hex"),idempotencyKey:"billing-document:document-a:electronic-issuance:v1",metadata:{billingDocumentId:"document-a",tenantId:"tenant-a",documentTypeCode:"01" as const,fiscalNumber:"00100001010000000042",fiscalIssueDate:"2026-08-24"}};}
async function capture(promise:Promise<unknown>){try{await promise;throw new Error("expected error");}catch(error){expect(error).toBeInstanceOf(HttpException);return error as HttpException;}}
