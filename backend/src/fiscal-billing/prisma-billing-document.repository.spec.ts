import { BillingMode, Prisma } from "@prisma/client";
import type { BillingDocumentDraftCommand } from "./billing-document.types";
import { PrismaBillingDocumentRepository } from "./prisma-billing-document.repository";

describe("PrismaBillingDocumentRepository generic draft persistence", () => {
  it.each([
    ["Sales Order source", { sourceType: "SALES_ORDER" }],
    ["CR policy", { fiscalCalculationPolicyVersion: "CR_V44_DECIMAL_V1" }],
    ["arbitrary policy", { fiscalCalculationPolicyVersion: "OTHER_POLICY" }],
  ])("independently blocks generic %s before transaction", async (_label, runtime) => {
    const command = genericCommand() as BillingDocumentDraftCommand &
      Record<string, unknown>;
    const candidate = runtime as {
      sourceType?: string;
      fiscalCalculationPolicyVersion?: string;
    };
    if (candidate.sourceType) command.source!.sourceType = candidate.sourceType;
    if (candidate.fiscalCalculationPolicyVersion) {
      command.fiscalCalculationPolicyVersion =
        candidate.fiscalCalculationPolicyVersion;
    }
    const transaction = jest.fn();
    const repository = new PrismaBillingDocumentRepository({
      $transaction: transaction,
    } as never);

    await expect(
      Promise.resolve().then(() => repository.createDraft(command)),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "BILLING_DRAFT_CREATION_PATH_UNSUPPORTED",
      }),
    });
    expect(transaction).not.toHaveBeenCalled();
  });
  it.each([[9999999999n,"9999999999"],[null,null]] as const)("returns a tenant-scoped HTTP-safe workspace allocation %s",async(allocated,expected)=>{const findUnique=jest.fn().mockResolvedValue(workspaceRow({allocatedSequenceNumber:allocated}));const repository=new PrismaBillingDocumentRepository({billingDocument:{findUnique}} as never);const result=await repository.findWorkspace("tenant-a","document-a");expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({where:{id_tenantId:{id:"document-a",tenantId:"tenant-a"}}}));expect(result?.allocatedSequenceNumber).toBe(expected);expect(result?.fiscalCalculationPolicyVersion).toBeNull();expect(result?.exchangeRate).toBe("454.340000000001");expect(result?.fiscalIssueDate).toBe("2026-08-24");expect(result?.submittedAt?.getTime()).toBe(new Date("2026-08-24T12:00:00.123Z").getTime());expect(result?.submittedAt).not.toBe((await findUnique.mock.results[0].value)?.submittedAt);expect(result?.haciendaRejectionDetail).toBe("Normalized Hacienda detail");expectNoBigInt(result);const select=findUnique.mock.calls[0][0].select;for(const internal of ["tenantId","providerRequestHash","issuanceIdempotencyKey","billingDocumentNumberSequenceId","providerStatusCheckLockOwner","providerStatusCheckLeaseUntil","providerRefreshLockOwner","providerRefreshLeaseUntil"])expect(select).not.toHaveProperty(internal);});

  it("returns null for missing or foreign-tenant workspace without a fallback read",async()=>{const findUnique=jest.fn().mockResolvedValue(null),repository=new PrismaBillingDocumentRepository({billingDocument:{findUnique}} as never);await expect(repository.findWorkspace("tenant-a","foreign-document")).resolves.toBeNull();expect(findUnique).toHaveBeenCalledTimes(1);expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({where:{id_tenantId:{id:"foreign-document",tenantId:"tenant-a"}}}));});
  it.each([
    ["clean USD draft",{lifecycleStatus:"DRAFT",currencyCode:"USD",exchangeRate:null,fiscalEmissionAt:null,fiscalIssueDate:null,officialExchangeRateObservationId:null,fiscalExchangeRateEffectiveDate:null,fiscalExchangeRateSourceAuthority:null,fiscalExchangeRateIndicatorCode:null,fiscalNumber:null,allocatedSequenceNumber:null},false],
    ["clean CRC draft",{lifecycleStatus:"DRAFT",currencyCode:"CRC",exchangeRate:null,fiscalEmissionAt:null,fiscalIssueDate:null,officialExchangeRateObservationId:null,fiscalExchangeRateEffectiveDate:null,fiscalExchangeRateSourceAuthority:null,fiscalExchangeRateIndicatorCode:null,fiscalNumber:null,allocatedSequenceNumber:null},false],
    ["unsupported draft currency",{lifecycleStatus:"DRAFT",currencyCode:"EUR",exchangeRate:null,fiscalEmissionAt:null,fiscalIssueDate:null,officialExchangeRateObservationId:null,fiscalExchangeRateEffectiveDate:null,fiscalExchangeRateSourceAuthority:null,fiscalExchangeRateIndicatorCode:null,fiscalNumber:null,allocatedSequenceNumber:null},true],
    ["partial official-rate snapshot",{lifecycleStatus:"DRAFT",currencyCode:"USD",exchangeRate:new Prisma.Decimal("500"),fiscalEmissionAt:null,fiscalIssueDate:null,officialExchangeRateObservationId:null,fiscalExchangeRateEffectiveDate:null,fiscalExchangeRateSourceAuthority:null,fiscalExchangeRateIndicatorCode:null,fiscalNumber:null,allocatedSequenceNumber:null},true],
    ["partial fiscal-emission identity",{lifecycleStatus:"DRAFT",currencyCode:"USD",exchangeRate:null,fiscalEmissionAt:new Date("2026-08-24T06:00:00.123Z"),fiscalIssueDate:null,officialExchangeRateObservationId:null,fiscalExchangeRateEffectiveDate:null,fiscalExchangeRateSourceAuthority:null,fiscalExchangeRateIndicatorCode:null,fiscalNumber:null,allocatedSequenceNumber:null},true],
    ["allocated USD missing official snapshot",{lifecycleStatus:"CONFIRMED",currencyCode:"USD",exchangeRate:null,fiscalEmissionAt:new Date("2026-08-24T06:00:00.123Z"),fiscalIssueDate:new Date("2026-08-24T00:00:00.000Z"),officialExchangeRateObservationId:null,fiscalExchangeRateEffectiveDate:null,fiscalExchangeRateSourceAuthority:null,fiscalExchangeRateIndicatorCode:null,fiscalNumber:"00100001010000000042",allocatedSequenceNumber:42n},true],
    ["allocated USD complete official snapshot",{lifecycleStatus:"CONFIRMED",currencyCode:"USD",exchangeRate:new Prisma.Decimal("500.123456789012"),fiscalEmissionAt:new Date("2026-08-24T06:00:00.123Z"),fiscalIssueDate:new Date("2026-08-24T00:00:00.000Z"),officialExchangeRateObservationId:"observation-a",fiscalExchangeRateEffectiveDate:new Date("2026-08-24T00:00:00.000Z"),fiscalExchangeRateSourceAuthority:"BCCR",fiscalExchangeRateIndicatorCode:"318",fiscalNumber:"00100001010000000042",allocatedSequenceNumber:42n},false],
  ] as const)("maps %s fiscal readiness without resolving a rate",async(_label,override,expectedMissing)=>{const findUnique=jest.fn().mockResolvedValue(workspaceRow({...override})),repository=new PrismaBillingDocumentRepository({billingDocument:{findUnique}} as never);const result=await repository.findWorkspace("tenant-a","document-a");expect(result?.readiness.exchangeRateMissing).toBe(expectedMissing);expect(findUnique).toHaveBeenCalledTimes(1);expect((findUnique.mock.calls[0][0].select as Record<string,unknown>)).toMatchObject({officialExchangeRateObservationId:true,fiscalExchangeRateEffectiveDate:true,fiscalExchangeRateSourceAuthority:true,fiscalExchangeRateIndicatorCode:true});});
  it("loads issuance preflight only by the tenant-scoped document identity", async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: "document-a",
      billingMode: "ELECTRONIC_PROVIDER",
      lifecycleStatus: "DRAFT",
      providerStatus: "NOT_SUBMITTED",
      taxAuthorityStatus: "NOT_SUBMITTED",
      currencyCode: "USD",
      fiscalNumber: null,
      providerDocumentId: null,
      billingDocumentNumberSequenceId: null,
      allocatedSequenceNumber: null,
      issuanceIdempotencyKey: null,
      fiscalEmissionAt: null,
      fiscalIssueDate: null,
      exchangeRate: null,
      officialExchangeRateObservationId: null,
      fiscalExchangeRateEffectiveDate: null,
      fiscalExchangeRateSourceAuthority: null,
      fiscalExchangeRateIndicatorCode: null,
    });
    const repository = new PrismaBillingDocumentRepository({
      billingDocument: { findUnique },
    } as never);

    await repository.findIssuancePreflight("tenant-a", "document-a");

    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id_tenantId: { id: "document-a", tenantId: "tenant-a" } },
    }));
  });
  it("produces a Prisma-valid USD type-01 nested snapshot with tenant-safe inherited relations", async () => {
    const tx = {
      billingDocument: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: "document-generic",
          internalNumber: "GENERIC-REF-1",
          lifecycleStatus: "DRAFT",
          documentTypeCode: "01",
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    };
    const repository = new PrismaBillingDocumentRepository(prisma as never);
    const command = genericCommand();
    command.paymentMethods.push({
      paymentMethodOrder: 2,
      paymentMethodCode: "01",
      description: null,
      declaredAmount: null,
    });

    await repository.createDraft(command);

    expect("salesOrder" in command).toBe(false);
    expect(tx.billingDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "tenant-a",
          sourceType: "CUSTOM_INTAKE",
          sourceId: "custom-source-1",
          sourceRole: "PRIMARY",
        },
      }),
    );
    const data = tx.billingDocument.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: "tenant-a",
      fiscalIssuerId: "issuer-generic",
      internalNumber: "GENERIC-REF-1",
      fiscalCalculationPolicyVersion: null,
      sourceType: "CUSTOM_INTAKE",
      sourceId: "custom-source-1",
      sourceNumber: "CUSTOM-0001",
      sourceRole: "PRIMARY",
      creationDeduplicationKey: "custom-deduplication-key",
      currencyCode: "USD",
      exchangeRate: null,
      receiverName: "Generic Receiver",
      fiscalNumber: null,
      haciendaKey: null,
      issuedAt: null,
      lifecycleStatus: "DRAFT",
      providerStatus: "NOT_SUBMITTED",
      taxAuthorityStatus: "NOT_SUBMITTED",
    });
    expect(data).not.toHaveProperty("officialExchangeRateObservationId");
    expect(data).not.toHaveProperty("fiscalExchangeRateEffectiveDate");
    expect(data).not.toHaveProperty("fiscalExchangeRateSourceAuthority");
    expect(data).not.toHaveProperty("fiscalExchangeRateIndicatorCode");
    expect(data).not.toHaveProperty("fiscalEmissionAt");
    expect(data).not.toHaveProperty("fiscalIssueDate");
    expect(JSON.stringify(data)).not.toContain("SALES_ORDER");
    expect(JSON.stringify(data)).not.toContain("BD-SO-");
    expect(JSON.stringify(data)).not.toContain("billingDocumentNumberSequence");
    expect(data.lines.create[0].taxes.create).toHaveLength(1);
    expect(data.lines.create[0]).not.toHaveProperty("tenantId");
    expect(data.lines.create[0].taxes.create[0]).not.toHaveProperty("tenantId");
    expect(data.paymentMethods.create.every((method: Record<string, unknown>) => !("tenantId" in method))).toBe(true);
    expect(data.paymentMethods.create).toEqual([
      {
        paymentMethodOrder: 1,
        paymentMethodCode: "04",
        description: null,
        declaredAmount: null,
      },
      {
        paymentMethodOrder: 2,
        paymentMethodCode: "01",
        description: null,
        declaredAmount: null,
      },
    ]);
    expect(data).not.toHaveProperty("billingDocumentNumberSequenceId");
    expect(data).not.toHaveProperty("issuanceIdempotencyKey");
    expect(data).not.toHaveProperty("providerDocumentId");
    expect(data).not.toHaveProperty("fiscalEmissionAt");
    expect(data).not.toHaveProperty("fiscalIssueDate");
    expect("references" in data).toBe(false);
  });

  it("persists a CRC draft with no fiscal exchange-rate or emission snapshot", async () => {
    const tx = {
      billingDocument: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: "document-crc",
          internalNumber: "GENERIC-REF-1",
          lifecycleStatus: "DRAFT",
          documentTypeCode: "01",
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    };
    const command = genericCommand();
    command.currencyCode = "CRC";

    await new PrismaBillingDocumentRepository(prisma as never).createDraft(command);

    const data = tx.billingDocument.create.mock.calls[0][0].data;
    expect(data.currencyCode).toBe("CRC");
    expect(data.exchangeRate).toBeNull();
    for (const field of [
      "officialExchangeRateObservationId",
      "fiscalExchangeRateEffectiveDate",
      "fiscalExchangeRateSourceAuthority",
      "fiscalExchangeRateIndicatorCode",
      "fiscalEmissionAt",
      "fiscalIssueDate",
    ]) {
      expect(data).not.toHaveProperty(field);
    }
  });

  it("supports a generic draft with no local fiscal issuer", async () => {
    const tx = {
      billingDocument: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: "external-document",
          internalNumber: "EXTERNAL-1",
          lifecycleStatus: "DRAFT",
          documentTypeCode: "01",
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    };
    const repository = new PrismaBillingDocumentRepository(prisma as never);
    const command = genericCommand();
    command.billingMode = BillingMode.EXTERNAL_REGISTRATION;
    command.fiscalIssuerId = null;

    await repository.createDraft(command);

    expect(tx.billingDocument.create.mock.calls[0][0].data).toMatchObject({
      tenantId: "tenant-a",
      fiscalIssuerId: null,
      billingMode: BillingMode.EXTERNAL_REGISTRATION,
      fiscalNumber: null,
      haciendaKey: null,
      issuedAt: null,
      lifecycleStatus: "DRAFT",
      providerStatus: "NOT_SUBMITTED",
    });
  });

  it("returns an existing primary draft without replacing its issuer", async () => {
    const existing = {
      id: "existing-document",
      internalNumber: "GENERIC-REF-1",
      lifecycleStatus: "DRAFT",
      documentTypeCode: "01",
    };
    const tx = {
      billingDocument: {
        findFirst: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    };
    const repository = new PrismaBillingDocumentRepository(prisma as never);
    const command = genericCommand();
    command.fiscalIssuerId = "different-requested-issuer";

    await expect(repository.createDraft(command)).resolves.toEqual(existing);

    expect(tx.billingDocument.create).not.toHaveBeenCalled();
  });
});

function workspaceRow(overrides:Record<string,unknown>={}){const decimal=(value:string)=>new Prisma.Decimal(value),timestamp=new Date("2026-08-24T12:00:00.123Z"),date=new Date("2026-08-24T00:00:00.000Z");return{id:"document-a",billingMode:"ELECTRONIC_PROVIDER",internalNumber:"BD-SO-A",documentTypeCode:"01",sourceType:"SALES_ORDER",sourceId:"sales-a",sourceNumber:"SO-1",sourceRole:"PRIMARY",schemaVersion:"4.4",fiscalCalculationPolicyVersion:null,countryCode:"CR",currencyCode:"USD",exchangeRate:decimal("454.340000000001"),fiscalEmissionAt:timestamp,fiscalIssueDate:date,dueDate:date,confirmedAt:timestamp,submittedAt:timestamp,issuedAt:null,createdAt:timestamp,updatedAt:timestamp,paymentConditionCode:"01",creditTermDays:null,lifecycleStatus:"SUBMITTED",providerStatus:"PROCESSED",taxAuthorityStatus:"REJECTED",artifactStatus:"NOT_GENERATED",fiscalNumber:"00100001010000000042",allocatedSequenceNumber:42n,haciendaKey:"5".repeat(50),haciendaRejectionDetail:"Normalized Hacienda detail",providerEnvironment:"sandbox",providerDocumentId:"provider-a",providerLastErrorCode:null,providerLastErrorAt:null,issuerName:"Issuer",issuerIdentificationType:"02",issuerIdentification:"3101678166",issuerEconomicActivityCode:"791100",issuerEstablishmentCode:"001",issuerTerminalCode:"00001",issuerEmail:"issuer@example.test",issuerPhone:null,issuerAddressSnapshot:{provinceCode:"1"},receiverName:"Receiver",receiverIdentificationType:"01",receiverIdentification:"109990999",receiverEconomicActivityCode:null,receiverEmail:null,receiverPhone:null,receiverAddressSnapshot:null,grossSubtotal:decimal("100.0000"),discountTotal:decimal("0.0000"),taxableTotal:decimal("100.0000"),exemptTotal:decimal("0.0000"),exoneratedTotal:decimal("0.0000"),grossTaxTotal:decimal("13.0000"),exoneratedTaxTotal:decimal("0.0000"),netTaxTotal:decimal("13.0000"),total:decimal("113.0000"),paymentMethods:[{id:"payment-a",paymentMethodOrder:1,paymentMethodCode:"01",description:null,declaredAmount:null}],references:[{id:"reference-a",referenceOrder:1,referencedBillingDocumentId:null,externalDocumentKey:"external",externalDocumentNumber:"1",referencedDocumentTypeCode:"01",reasonCode:"01",reasonDescription:null,referenceDate:date}],lines:[{id:"line-a",lineNumber:1,cabysCode:"1234567890123",itemCode:"ITEM",description:"Line",quantity:decimal("1.0000"),unitOfMeasureCode:"Sp",unitPrice:decimal("100.0000"),grossAmount:decimal("100.0000"),discountAmount:decimal("0.0000"),discountCode:null,discountReason:null,taxableBase:decimal("100.0000"),taxAmount:decimal("13.0000"),exoneratedTaxAmount:decimal("0.0000"),netTaxAmount:decimal("13.0000"),lineSubtotal:decimal("100.0000"),lineTotal:decimal("113.0000"),taxes:[{id:"tax-a",taxOrder:1,taxCode:"01",rateCode:"08",ratePercentage:decimal("13.0000"),taxableBase:decimal("100.0000"),taxAmount:decimal("13.0000"),calculationFactor:null,netTaxAmount:decimal("13.0000"),exemption:{id:"exemption-a",documentTypeCode:"01",documentNumber:"EX-1",legalArticle:null,legalSection:null,issuingInstitutionCode:null,issuingInstitutionName:null,otherInstitutionDescription:null,issueDate:date,exemptedPercentage:decimal("0.0000"),exemptedAmount:decimal("0.0000")}}]}],...overrides};}
function expectNoBigInt(value:unknown):void{if(typeof value==="bigint")throw new Error("raw bigint escaped workspace");if(Array.isArray(value)){value.forEach(expectNoBigInt);return;}if(value&&typeof value==="object")Object.values(value as Record<string,unknown>).forEach(expectNoBigInt);}

function genericCommand(): BillingDocumentDraftCommand {
  return {
    tenantId: "tenant-a",
    fiscalIssuerId: "issuer-generic",
    internalNumber: "GENERIC-REF-1",
    documentTypeCode: "01",
    billingMode: BillingMode.ELECTRONIC_PROVIDER,
    source: {
      sourceType: "CUSTOM_INTAKE",
      sourceId: "custom-source-1",
      sourceNumber: "CUSTOM-0001",
      sourceRole: "PRIMARY",
      creationDeduplicationKey: "custom-deduplication-key",
    },
    schemaVersion: "4.4",
    countryCode: "CR",
    currencyCode: "USD",
    paymentConditionCode: "01",
    creditTermDays: null,
    issuer: {
      name: "Generic Issuer",
      identificationType: "02",
      identification: "3101000000",
      economicActivityCode: "791100",
      establishmentCode: "001",
      terminalCode: "00001",
      email: "issuer@example.test",
      phone: null,
      address: { provinceCode: "1" },
    },
    receiver: {
      name: "Generic Receiver",
      identificationType: null,
      identification: null,
      economicActivityCode: null,
      email: "receiver@example.test",
      phone: null,
      address: null,
    },
    totals: {
      grossSubtotal: "100.0000",
      discountTotal: "0.0000",
      taxableTotal: "100.0000",
      exemptTotal: "0.0000",
      exoneratedTotal: "0.0000",
      grossTaxTotal: "13.0000",
      exoneratedTaxTotal: "0.0000",
      netTaxTotal: "13.0000",
      total: "113.0000",
    },
    paymentMethods: [
      {
        paymentMethodOrder: 1,
        paymentMethodCode: "04",
        description: null,
        declaredAmount: null,
      },
    ],
    lines: [
      {
        lineNumber: 1,
        cabysCode: "1234567890123",
        itemCode: "CUSTOM",
        description: "Generic item",
        quantity: "1.0000",
        unitOfMeasureCode: "Sp",
        unitPrice: "100.0000",
        grossAmount: "100.0000",
        discountAmount: "0.0000",
        discountCode: null,
        discountReason: null,
        taxableBase: "100.0000",
        taxAmount: "13.0000",
        exoneratedTaxAmount: "0.0000",
        netTaxAmount: "13.0000",
        lineSubtotal: "100.0000",
        lineTotal: "113.0000",
        taxes: [
          {
            taxOrder: 1,
            taxCode: "01",
            rateCode: "08",
            ratePercentage: "13.0000",
            taxableBase: "100.0000",
            taxAmount: "13.0000",
            calculationFactor: null,
            netTaxAmount: "13.0000",
          },
        ],
      },
    ],
    createdByUserId: "user-a",
  };
}
