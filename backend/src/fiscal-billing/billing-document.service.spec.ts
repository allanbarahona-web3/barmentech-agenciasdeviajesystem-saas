import { BillingMode } from "@prisma/client";
import { BillingDocumentService } from "./billing-document.service";
import type { BillingDocumentDraftCommand } from "./billing-document.types";

describe("BillingDocumentService generic core", () => {
  it("sanitizes workspace read failures and preserves tenant-scoped not-found",async()=>{let repository={findWorkspace:jest.fn().mockResolvedValue(null)},service=new BillingDocumentService(repository as never,{} as never,{} as never);await expect(service.getWorkspace("tenant-a","foreign-document")).rejects.toMatchObject({response:expect.objectContaining({code:"BILLING_DOCUMENT_NOT_FOUND"})});expect(repository.findWorkspace).toHaveBeenCalledWith("tenant-a","foreign-document");repository={findWorkspace:jest.fn().mockRejectedValue(new Error("raw prisma database-url Hacienda detail"))};service=new BillingDocumentService(repository as never,{} as never,{} as never);const error=await captureWorkspace(service.getWorkspace("tenant-a","document-a"));expect(error.getResponse()).toMatchObject({code:"BILLING_DOCUMENT_SUBMISSION_READ_FAILED"});expect(JSON.stringify(error.getResponse())).not.toMatch(/prisma|database-url|Hacienda detail/);});
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

function preflight(overrides: Record<string, unknown> = {}) {
  return {
    id: "document-a", billingMode: "ELECTRONIC_PROVIDER", lifecycleStatus: "DRAFT",
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
