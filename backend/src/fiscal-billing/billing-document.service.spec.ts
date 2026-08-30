import { BillingMode } from "@prisma/client";
import { BillingDocumentService } from "./billing-document.service";
import type {
  BillingDocumentDraftCommand,
  BillingDocumentWorkspace,
} from "./billing-document.types";

describe("BillingDocumentService generic core", () => {
  it.each([
    ["Sales Order source", { sourceType: "SALES_ORDER" }],
    ["CR policy", { fiscalCalculationPolicyVersion: "CR_V44_DECIMAL_V1" }],
    ["arbitrary policy", { fiscalCalculationPolicyVersion: "OTHER_POLICY" }],
  ])("blocks generic %s before repository lookup", async (_label, runtime) => {
    const command = commandWithoutSalesOrder() as BillingDocumentDraftCommand &
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
    const repository = {
      findPrimaryDocument: jest.fn(),
      createDraft: jest.fn(),
    };
    const service = new BillingDocumentService(
      repository as never,
      {} as never,
      {} as never,
    );

    await expect(service.createOrResumeDraft(command)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "BILLING_DRAFT_CREATION_PATH_UNSUPPORTED",
      }),
    });
    expect(repository.findPrimaryDocument).not.toHaveBeenCalled();
    expect(repository.createDraft).not.toHaveBeenCalled();
  });
  it("reads workspace without invoking BCCR, allocation, outbox, queue, or provider behavior",async()=>{const workspace={id:"document-a",readiness:{receiverFiscalIdentityMissing:false,exchangeRateMissing:false}},repository={findWorkspace:jest.fn().mockResolvedValue(workspace),requestElectronicIssuance:jest.fn(),createDraft:jest.fn()},resolver={resolveExactObservation:jest.fn()},clock={now:jest.fn()},service=new BillingDocumentService(repository as never,resolver as never,clock as never);await expect(service.getWorkspace("tenant-a","document-a")).resolves.toBe(workspace);expect(repository.findWorkspace).toHaveBeenCalledTimes(1);expect(resolver.resolveExactObservation).not.toHaveBeenCalled();expect(clock.now).not.toHaveBeenCalled();expect(repository.requestElectronicIssuance).not.toHaveBeenCalled();expect(repository.createDraft).not.toHaveBeenCalled();});
  it("sanitizes workspace read failures and preserves tenant-scoped not-found",async()=>{let repository={findWorkspace:jest.fn().mockResolvedValue(null)},service=new BillingDocumentService(repository as never,{} as never,{} as never);await expect(service.getWorkspace("tenant-a","foreign-document")).rejects.toMatchObject({response:expect.objectContaining({code:"BILLING_DOCUMENT_NOT_FOUND"})});expect(repository.findWorkspace).toHaveBeenCalledWith("tenant-a","foreign-document");repository={findWorkspace:jest.fn().mockRejectedValue(new Error("raw prisma database-url Hacienda detail"))};service=new BillingDocumentService(repository as never,{} as never,{} as never);const error=await captureWorkspace(service.getWorkspace("tenant-a","document-a"));expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_SUBMISSION_READ_FAILED"});expect(JSON.stringify(error.getResponse())).not.toMatch(/prisma|database-url|Hacienda detail/);});

  it("projects an accepted document without provider or recovery internals", async () => {
    const workspace = acceptedWorkspace();
    const repository = { findWorkspace: jest.fn().mockResolvedValue(workspace) };
    const service = new BillingDocumentService(
      repository as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.getAcceptedInvoice("tenant-a", "document-a"),
    ).resolves.toEqual({
      billingDocumentId: "document-a",
      internalNumber: "BD-SO-order-a",
      fiscalNumber: "00100001010000000228",
      haciendaKey: "50630082600310100000000100001010000000228123456789",
      documentTypeCode: "01",
      lifecycleStatus: "SUBMITTED",
      taxAuthorityStatus: "ACCEPTED",
      issuedDate: "2026-08-30",
      currencyCode: "USD",
      issuer: {
        name: "Issuer",
        identificationType: "02",
        identificationNumber: "3101000000",
        email: "issuer@example.test",
        phone: null,
      },
      paymentCondition: {
        code: "01",
        creditTermDays: null,
        dueDate: "2026-08-30",
      },
      receiver: {
        name: "Customer",
        identificationType: "01",
        identificationNumber: "123456789",
        email: "customer@example.test",
      },
      salesOrder: { id: "order-a", number: "SO-2026-000010" },
      lines: [
        {
          lineNumber: 1,
          description: "Seguro · Cobertura: USD 60,000",
          quantity: "1.00000",
          unitOfMeasureCode: "Sp",
          unitPrice: "97.50000",
          subtotal: "97.50000",
          taxableBase: "97.50000",
          taxes: [
            {
              taxCode: "01",
              rateCode: "08",
              ratePercentage: "13.00000",
              taxableBase: "97.50000",
              taxAmount: "12.67500",
              netTaxAmount: "12.67500",
            },
          ],
          lineTotal: "110.17500",
        },
      ],
      totals: {
        subtotal: "97.50000",
        totalTax: "12.67500",
        total: "110.17500",
      },
    });
    expect(repository.findWorkspace).toHaveBeenCalledTimes(1);
    expect(repository.findWorkspace).toHaveBeenCalledWith(
      "tenant-a",
      "document-a",
    );
    const result = await service.getAcceptedInvoice("tenant-a", "document-a");
    expect(result).not.toHaveProperty("providerDocumentId");
    expect(result).not.toHaveProperty("providerEnvironment");
    expect(result.haciendaKey).toBe("50630082600310100000000100001010000000228123456789");
    expect(result).not.toHaveProperty("readiness");
    expect(result).not.toHaveProperty("providerLastErrorCode");
    expect(workspace.total).toBe("110.17500");
  });

  it.each([
    ["draft", { lifecycleStatus: "DRAFT", providerStatus: "NOT_SUBMITTED", taxAuthorityStatus: "NOT_SUBMITTED" }],
    ["processing", { providerStatus: "PROCESSING", taxAuthorityStatus: "PROCESSING" }],
    ["rejected", { taxAuthorityStatus: "REJECTED" }],
  ])("rejects an ineligible %s document", async (_label, overrides) => {
    const repository = {
      findWorkspace: jest.fn().mockResolvedValue(acceptedWorkspace(overrides)),
    };
    const service = new BillingDocumentService(repository as never, {} as never, {} as never);

    await expect(
      service.getAcceptedInvoice("tenant-a", "document-a"),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "BILLING_DOCUMENT_INVOICE_NOT_AVAILABLE",
      }),
    });
  });

  it("preserves tenant-scoped not-found behavior for invoice reads", async () => {
    const repository = { findWorkspace: jest.fn().mockResolvedValue(null) };
    const service = new BillingDocumentService(repository as never, {} as never, {} as never);

    await expect(
      service.getAcceptedInvoice("tenant-b", "document-a"),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "BILLING_DOCUMENT_NOT_FOUND" }),
    });
    expect(repository.findWorkspace).toHaveBeenCalledWith("tenant-b", "document-a");
  });
  it("accepts and forwards a source-agnostic draft command unchanged", async () => {
    const command = commandWithoutSalesOrder();
    const repository = {
      findPrimaryDocument: jest.fn().mockResolvedValue(null),
      createDraft: jest.fn().mockResolvedValue({
        id: "document-a",
        internalNumber: command.internalNumber,
        lifecycleStatus: "DRAFT",
        documentTypeCode: command.documentTypeCode,
      }),
      findWorkspace: jest.fn().mockResolvedValue({
        id: "document-a",
        sourceType: "CUSTOM_INTAKE",
      }),
    };
    const service = new BillingDocumentService(
      repository as never,
      {} as never,
      {} as never,
    );

    const result = await service.createOrResumeDraft(command);

    expect("salesOrder" in command).toBe(false);
    expect(repository.createDraft).toHaveBeenCalledWith(command);
    expect(repository.findPrimaryDocument).toHaveBeenCalledWith(
      "tenant-a",
      "CUSTOM_INTAKE",
      "custom-1",
    );
    expect(result).toEqual({ id: "document-a", sourceType: "CUSTOM_INTAKE" });
  });

  it("creates a CR v4.4 Sales Order draft without invoking BCCR and resumes the persisted workspace", async () => {
    const workspace = {
      id: "document-a",
      fiscalCalculationPolicyVersion: "CR_V44_DECIMAL_V1",
    };
    const repository = {
      findPrimaryDocument: jest.fn().mockResolvedValue(null),
      createCrV44SalesOrderDraft: jest.fn().mockResolvedValue({
        id: "document-a",
        internalNumber: "BD-SO-sales-a",
        lifecycleStatus: "DRAFT",
        documentTypeCode: "01",
      }),
      findWorkspace: jest.fn().mockResolvedValue(workspace),
    };
    const resolver = { resolveExactObservation: jest.fn() };
    const service = new BillingDocumentService(
      repository as never,
      resolver as never,
      { now: jest.fn() } as never,
    );
    const command = {
      tenantId: "tenant-a",
      salesOrderId: "sales-a",
      fiscalIssuerId: "issuer-a",
      internalNumber: "BD-SO-sales-a",
      documentTypeCode: "01",
      receiverIdentificationType: "01",
      receiverIdentification: "123456789",
      paymentMethods: [],
      createdByUserId: "user-a",
    };

    await expect(
      service.createOrResumeCrV44SalesOrderDraft(command),
    ).resolves.toBe(workspace);

    expect(repository.createCrV44SalesOrderDraft).toHaveBeenCalledWith(command);
    expect(repository.findWorkspace).toHaveBeenCalledWith(
      "tenant-a",
      "document-a",
    );
    expect(resolver.resolveExactObservation).not.toHaveBeenCalled();
  });

  it("recovers only the exact concurrent Sales Order winner", async () => {
    const winner = {
      id: "winner-a",
      internalNumber: "BD-SO-sales-a",
      lifecycleStatus: "DRAFT",
      documentTypeCode: "01",
    };
    const repository = {
      findPrimaryDocument: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(winner),
      createCrV44SalesOrderDraft: jest.fn().mockRejectedValue({ code: "P2002" }),
      findWorkspace: jest.fn().mockResolvedValue({ id: "winner-a" }),
    };
    const service = new BillingDocumentService(
      repository as never,
      { resolveExactObservation: jest.fn() } as never,
      {} as never,
    );

    await expect(
      service.createOrResumeCrV44SalesOrderDraft({
        tenantId: "tenant-a",
        salesOrderId: "sales-a",
        fiscalIssuerId: "issuer-a",
        internalNumber: "BD-SO-sales-a",
        documentTypeCode: "01",
        receiverIdentificationType: "01",
        receiverIdentification: "123456789",
        paymentMethods: [],
        createdByUserId: "user-a",
      }),
    ).resolves.toEqual({ id: "winner-a" });
    expect(repository.findPrimaryDocument).toHaveBeenNthCalledWith(
      2,
      "tenant-a",
      "SALES_ORDER",
      "sales-a",
    );
  });

  it.each([
    ["internal number", { internalNumber: "BD-SO-other" }],
    ["document type", { documentTypeCode: "04" }],
  ])(
    "rejects a concurrent Sales Order winner with a contradictory %s",
    async (_label, contradiction) => {
      const winner = {
        id: "winner-a",
        internalNumber: "BD-SO-sales-a",
        lifecycleStatus: "DRAFT",
        documentTypeCode: "01",
        ...contradiction,
      };
      const repository = {
        findPrimaryDocument: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(winner),
        createCrV44SalesOrderDraft: jest
          .fn()
          .mockRejectedValue({ code: "P2002" }),
        findWorkspace: jest.fn(),
      };
      const service = new BillingDocumentService(
        repository as never,
        { resolveExactObservation: jest.fn() } as never,
        {} as never,
      );

      await expect(
        service.createOrResumeCrV44SalesOrderDraft({
          tenantId: "tenant-a",
          salesOrderId: "sales-a",
          fiscalIssuerId: "issuer-a",
          internalNumber: "BD-SO-sales-a",
          documentTypeCode: "01",
          receiverIdentificationType: "01",
          receiverIdentification: "123456789",
          paymentMethods: [],
          createdByUserId: "user-a",
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: "BILLING_DRAFT_CONFLICT" }),
      });
      expect(repository.findWorkspace).not.toHaveBeenCalled();
    },
  );

  it("prepares CRC issuance without resolving an official rate", async () => {
    const allocation = {
      billingDocumentId: "document-a",
      sequenceId: "sequence-a",
      allocatedSequenceNumber: "225",
      providerBase: "0000000225",
      fiscalNumber: "00100001010000000225",
      issuanceIdempotencyKey:
        "billing-document:document-a:electronic-issuance:v1",
      outboxEventId: "outbox-a",
      outboxDeduplicationKey:
        "billing-document:document-a:electronic-issuance-requested:v1",
      lifecycleStatus: "CONFIRMED",
      providerStatus: "PENDING",
      newlyAllocated: true,
    };
    const repository = {
      findIssuancePreflight: jest.fn().mockResolvedValue(preflight()),
      requestElectronicIssuance: jest.fn().mockResolvedValue(allocation),
    };
    const resolver = { resolveExactObservation: jest.fn() };
    const instant = new Date("2026-08-22T05:59:59.123Z");
    const service = new BillingDocumentService(
      repository as never,
      resolver as never,
      { now: jest.fn().mockReturnValue(instant) } as never,
    );

    await expect(
      service.requestElectronicIssuance("tenant-a", "document-a", "user-a"),
    ).resolves.toEqual(allocation);
    expect(resolver.resolveExactObservation).not.toHaveBeenCalled();
    expect(repository.requestElectronicIssuance).toHaveBeenCalledWith(
      "tenant-a",
      "document-a",
      "user-a",
      {
        expectedCurrencyCode: "CRC",
        fiscalEmissionAt: instant,
        fiscalIssueDate: "2026-08-21",
        officialRate: null,
      },
    );
  });

  it("resolves the exact USD sell rate before passing an unchanged snapshot", async () => {
    const repository = {
      findIssuancePreflight: jest.fn().mockResolvedValue(preflight({ currencyCode: "USD" })),
      requestElectronicIssuance: jest.fn().mockResolvedValue({ newlyAllocated: true }),
    };
    const resolver = {
      resolveExactObservation: jest.fn().mockResolvedValue(observation()),
    };
    const instant = new Date("2026-08-22T06:00:00.456Z");
    const service = new BillingDocumentService(
      repository as never,
      resolver as never,
      { now: jest.fn().mockReturnValue(instant) } as never,
    );

    await service.requestElectronicIssuance("tenant-a", "document-a", "user-a");

    expect(resolver.resolveExactObservation).toHaveBeenCalledWith({
      countryCode: "CR",
      foreignCurrencyCode: "USD",
      localCurrencyCode: "CRC",
      rateType: "REFERENCE_SELL",
      effectiveDate: "2026-08-22",
    });
    expect(repository.requestElectronicIssuance).toHaveBeenCalledWith(
      "tenant-a",
      "document-a",
      "user-a",
      {
        expectedCurrencyCode: "USD",
        fiscalEmissionAt: instant,
        fiscalIssueDate: "2026-08-22",
        officialRate: {
          observationId: "observation-a",
          value: "454.340000000001",
          effectiveDate: "2026-08-22",
          sourceAuthority: "BCCR",
          sourceIndicatorCode: "318",
        },
      },
    );
  });

  it("bypasses the resolver for an existing complete allocation", async () => {
    const repository = {
      findIssuancePreflight: jest.fn().mockResolvedValue(preflight({
        lifecycleStatus: "CONFIRMED",
        providerStatus: "PENDING",
        billingDocumentNumberSequenceId: "sequence-a",
        allocatedSequenceNumber: 1n,
        issuanceIdempotencyKey: "existing-key",
        fiscalEmissionAt: new Date("2026-08-22T06:00:00Z"),
        fiscalIssueDate: new Date("2026-08-22T00:00:00Z"),
      })),
      requestElectronicIssuance: jest.fn().mockResolvedValue({ newlyAllocated: false }),
    };
    const resolver = { resolveExactObservation: jest.fn() };
    const clock = { now: jest.fn() };
    const service = new BillingDocumentService(repository as never, resolver as never, clock as never);

    await service.requestElectronicIssuance("tenant-a", "document-a", "user-a");

    expect(resolver.resolveExactObservation).not.toHaveBeenCalled();
    expect(clock.now).not.toHaveBeenCalled();
    expect(repository.requestElectronicIssuance).toHaveBeenCalledWith(
      "tenant-a", "document-a", "user-a", null,
    );
  });

  it("returns the same not-found error for a tenant-scoped preflight miss", async () => {
    const repository = { findIssuancePreflight: jest.fn().mockResolvedValue(null) };
    const resolver = { resolveExactObservation: jest.fn() };
    const service = new BillingDocumentService(repository as never, resolver as never, { now: jest.fn() } as never);

    await expect(service.requestElectronicIssuance("tenant-a", "foreign-document", "user-a"))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: "BILLING_DOCUMENT_NOT_FOUND" }) });
    expect(resolver.resolveExactObservation).not.toHaveBeenCalled();
  });

  it.each([null,""," ","UNKNOWN_POLICY"])("rejects unsupported policy %p before BCCR or allocation",async fiscalCalculationPolicyVersion=>{
    const repository={findIssuancePreflight:jest.fn().mockResolvedValue(preflight({currencyCode:"USD",fiscalCalculationPolicyVersion})),requestElectronicIssuance:jest.fn()};
    const resolver={resolveExactObservation:jest.fn()};const clock={now:jest.fn()};
    const service=new BillingDocumentService(repository as never,resolver as never,clock as never);
    await expect(service.requestElectronicIssuance("tenant-a","document-a","user-a")).rejects.toMatchObject({response:expect.objectContaining({code:"BILLING_DOCUMENT_FISCAL_CALCULATION_POLICY_UNSUPPORTED"})});
    expect(resolver.resolveExactObservation).not.toHaveBeenCalled();expect(clock.now).not.toHaveBeenCalled();expect(repository.requestElectronicIssuance).not.toHaveBeenCalled();
  });

  it("rejects unsupported currency and resolver failures before allocation", async () => {
    const unsupportedRepository = {
      findIssuancePreflight: jest.fn().mockResolvedValue(preflight({ currencyCode: "EUR" })),
      requestElectronicIssuance: jest.fn(),
    };
    const resolver = { resolveExactObservation: jest.fn() };
    const unsupported = new BillingDocumentService(unsupportedRepository as never, resolver as never, { now: jest.fn() } as never);
    await expect(unsupported.requestElectronicIssuance("tenant-a", "document-a", "user-a"))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: "BILLING_DOCUMENT_UNSUPPORTED_FISCAL_CURRENCY" }) });
    expect(resolver.resolveExactObservation).not.toHaveBeenCalled();
    expect(unsupportedRepository.requestElectronicIssuance).not.toHaveBeenCalled();

    const repository = {
      findIssuancePreflight: jest.fn().mockResolvedValue(preflight({ currencyCode: "USD" })),
      requestElectronicIssuance: jest.fn(),
    };
    const failure = new Error("safe resolver failure");
    const failingResolver = { resolveExactObservation: jest.fn().mockRejectedValue(failure) };
    const service = new BillingDocumentService(repository as never, failingResolver as never, { now: () => new Date("2026-08-22T06:00:00Z") } as never);
    await expect(service.requestElectronicIssuance("tenant-a", "document-a", "user-a")).rejects.toBe(failure);
    expect(repository.requestElectronicIssuance).not.toHaveBeenCalled();
  });
});

async function captureWorkspace(promise:Promise<unknown>):Promise<{getResponse():unknown}>{try{await promise;throw new Error("expected rejection");}catch(error){return error as {getResponse():unknown};}}

function acceptedWorkspace(
  overrides: Partial<BillingDocumentWorkspace> = {},
): BillingDocumentWorkspace {
  const now = new Date("2026-08-30T18:00:00.000Z");
  return {
    id: "document-a",
    billingMode: "ELECTRONIC_PROVIDER",
    internalNumber: "BD-SO-order-a",
    documentTypeCode: "01",
    sourceType: "SALES_ORDER",
    sourceId: "order-a",
    sourceNumber: "SO-2026-000010",
    sourceRole: "PRIMARY",
    schemaVersion: "4.4",
    fiscalCalculationPolicyVersion: "CR_V44_DECIMAL_V1",
    countryCode: "CR",
    currencyCode: "USD",
    exchangeRate: "500.00000",
    fiscalEmissionAt: now,
    fiscalIssueDate: "2026-08-30",
    dueDate: "2026-08-30",
    confirmedAt: now,
    submittedAt: now,
    issuedAt: now,
    taxAuthorityFinalizedAt: now,
    createdAt: now,
    updatedAt: now,
    paymentConditionCode: "01",
    creditTermDays: null,
    lifecycleStatus: "SUBMITTED",
    providerStatus: "PROCESSED",
    taxAuthorityStatus: "ACCEPTED",
    artifactStatus: "PENDING",
    fiscalNumber: "00100001010000000228",
    allocatedSequenceNumber: "228",
    haciendaKey: "50630082600310100000000100001010000000228123456789",
    haciendaRejectionDetail: null,
    providerEnvironment: "SANDBOX",
    providerDocumentId: "provider-sensitive-id",
    providerLastErrorCode: "provider-safe-code",
    providerLastErrorAt: now,
    issuerName: "Issuer",
    issuerIdentificationType: "02",
    issuerIdentification: "3101000000",
    issuerEconomicActivityCode: "791100",
    issuerEstablishmentCode: "001",
    issuerTerminalCode: "00001",
    issuerEmail: "issuer@example.test",
    issuerPhone: null,
    issuerAddressSnapshot: null,
    receiverName: "Customer",
    receiverIdentificationType: "01",
    receiverIdentification: "123456789",
    receiverEconomicActivityCode: null,
    receiverEmail: "customer@example.test",
    receiverPhone: null,
    receiverAddressSnapshot: null,
    grossSubtotal: "97.50000",
    discountTotal: "0.00000",
    taxableTotal: "97.50000",
    exemptTotal: "0.00000",
    exoneratedTotal: "0.00000",
    grossTaxTotal: "12.67500",
    exoneratedTaxTotal: "0.00000",
    netTaxTotal: "12.67500",
    total: "110.17500",
    paymentMethods: [],
    references: [],
    lines: [
      {
        id: "line-a",
        lineNumber: 1,
        cabysCode: "78111800",
        itemCode: "INSURANCE",
        description: "Seguro · Cobertura: USD 60,000",
        quantity: "1.00000",
        unitOfMeasureCode: "Sp",
        unitPrice: "97.50000",
        grossAmount: "97.50000",
        discountAmount: "0.00000",
        discountCode: null,
        discountReason: null,
        taxableBase: "97.50000",
        taxAmount: "12.67500",
        exoneratedTaxAmount: "0.00000",
        netTaxAmount: "12.67500",
        lineSubtotal: "97.50000",
        lineTotal: "110.17500",
        taxes: [
          {
            id: "tax-a",
            taxOrder: 1,
            taxCode: "01",
            rateCode: "08",
            ratePercentage: "13.00000",
            taxableBase: "97.50000",
            taxAmount: "12.67500",
            calculationFactor: null,
            netTaxAmount: "12.67500",
            exemption: null,
          },
        ],
      },
    ],
    readiness: {
      receiverFiscalIdentityMissing: false,
      exchangeRateMissing: false,
      fiscalCalculationPolicyUnsupported: false,
      calculatedSnapshotInvalid: false,
      issuanceReady: true,
      issues: [],
    },
    ...overrides,
  };
}

function preflight(overrides: Record<string, unknown> = {}) {
  return {
    id: "document-a", billingMode: "ELECTRONIC_PROVIDER", lifecycleStatus: "DRAFT",
    fiscalCalculationPolicyVersion: "CR_V44_DECIMAL_V1",
    providerStatus: "NOT_SUBMITTED", taxAuthorityStatus: "NOT_SUBMITTED",
    currencyCode: "CRC", fiscalNumber: null, providerDocumentId: null,
    billingDocumentNumberSequenceId: null, allocatedSequenceNumber: null,
    issuanceIdempotencyKey: null, fiscalEmissionAt: null, fiscalIssueDate: null,
    exchangeRate: null, officialExchangeRateObservationId: null,
    fiscalExchangeRateEffectiveDate: null, fiscalExchangeRateSourceAuthority: null,
    fiscalExchangeRateIndicatorCode: null, ...overrides,
  };
}

function observation() {
  return {
    id: "observation-a", countryCode: "CR", foreignCurrencyCode: "USD",
    localCurrencyCode: "CRC", rateType: "REFERENCE_SELL", effectiveDate: "2026-08-22",
    value: "454.340000000001", sourceAuthority: "BCCR", sourceIndicatorCode: "318",
    retrievedAt: new Date(0), sourcePublishedAt: null,
    requestIdentity: "identity", responseHash: "hash", newlyPersisted: false,
  };
}

function commandWithoutSalesOrder(): BillingDocumentDraftCommand {
  return {
    tenantId: "tenant-a",
    fiscalIssuerId: null,
    internalNumber: "GENERIC-1",
    documentTypeCode: "01",
    billingMode: BillingMode.ELECTRONIC_PROVIDER,
    source: {
      sourceType: "CUSTOM_INTAKE",
      sourceId: "custom-1",
      sourceNumber: null,
      sourceRole: "PRIMARY",
      creationDeduplicationKey: "custom-1-primary",
    },
    schemaVersion: "4.4",
    countryCode: "CR",
    currencyCode: "CRC",
    paymentConditionCode: "01",
    creditTermDays: null,
    issuer: {
      name: "Issuer",
      identificationType: "02",
      identification: "3101000000",
      economicActivityCode: "791100",
      establishmentCode: null,
      terminalCode: null,
      email: null,
      phone: null,
      address: null,
    },
    receiver: {
      name: null,
      identificationType: null,
      identification: null,
      economicActivityCode: null,
      email: null,
      phone: null,
      address: null,
    },
    totals: {
      grossSubtotal: "0.0000",
      discountTotal: "0.0000",
      taxableTotal: "0.0000",
      exemptTotal: "0.0000",
      exoneratedTotal: "0.0000",
      grossTaxTotal: "0.0000",
      exoneratedTaxTotal: "0.0000",
      netTaxTotal: "0.0000",
      total: "0.0000",
    },
    paymentMethods: [],
    lines: [],
    createdByUserId: "user-a",
  };
}
