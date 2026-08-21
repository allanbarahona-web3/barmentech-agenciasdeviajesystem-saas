import { HttpException } from "@nestjs/common";
import { BillingDocumentService } from "./billing-document.service";
import { SalesOrderFiscalBillingService } from "./fiscal-billing.service";

describe("SalesOrderFiscalBillingService", () => {
  it.each([
    [null, "SALES_ORDER_NOT_FOUND"],
    [salesOrder({ sourceType: "CONTRACT" }), "SALES_ORDER_SOURCE_NOT_ELIGIBLE"],
    [salesOrder({ status: "CANCELLED" }), "SALES_ORDER_STATUS_NOT_ELIGIBLE"],
    [salesOrder({ lines: [] }), "SALES_ORDER_HAS_NO_LINES"],
  ])("enforces source eligibility", async (source, code) => {
    const { service, repository } = setup();
    repository.findSalesOrder.mockResolvedValue(source);
    await expectCode(service.prepare("tenant-a", "sales-a"), code);
    expect(repository.createDraft).not.toHaveBeenCalled();
  });

  it("prepares without writes and reports missing receiver data", async () => {
    const { service, repository, fiscalCatalog } = setup();

    const result = await service.prepare("tenant-a", "sales-a");

    expect(result.canCreateDraft).toBe(true);
    expect(result.customer).toEqual({
      name: "Customer A",
      email: null,
      receiverFiscalIdentityComplete: false,
    });
    expect(result.issues).toContainEqual({
      code: "RECEIVER_FISCAL_IDENTITY_INCOMPLETE",
      blocking: false,
    });
    expect(repository.createDraft).not.toHaveBeenCalled();
    expect(fiscalCatalog.evaluateFiscalProfiles).toHaveBeenCalledTimes(1);
  });

  it.each([
    [null, "BILLING_CONFIGURATION_NOT_FOUND"],
    [configuration({ billingEnabled: false }), "BILLING_NOT_ENABLED"],
    [configuration({ electronicIssuanceEnabled: false }), "BILLING_NOT_ENABLED"],
  ])("blocks creation for missing or disabled configuration", async (value, code) => {
    const { service, repository } = setup();
    repository.findBillingConfiguration.mockResolvedValue(value);

    await expectCode(
      service.createOrResumeDraft("tenant-a", "sales-a", draftInput, "user-a"),
      code,
    );
    expect(repository.createDraft).not.toHaveBeenCalled();
  });

  it("rejects a foreign issuer as not found without disclosure", async () => {
    const { service, repository } = setup();
    repository.findIssuer.mockResolvedValue(null);

    await expectCode(
      service.createOrResumeDraft("tenant-a", "sales-a", draftInput, "user-a"),
      "FISCAL_ISSUER_NOT_FOUND",
    );
    expect(repository.findIssuer).toHaveBeenCalledWith("tenant-a", "issuer-a");
  });

  it("rejects an inactive issuer", async () => {
    const { service, repository } = setup();
    repository.findIssuer.mockResolvedValue(issuer({ isActive: false }));

    await expectCode(
      service.createOrResumeDraft("tenant-a", "sales-a", draftInput, "user-a"),
      "FISCAL_ISSUER_NOT_ACTIVE",
    );
  });

  it("rejects an issuer without a primary economic activity", async () => {
    const inactivePrimary = issuer({
      economicActivities: [
        {
          economicActivityCode: "791100",
          description: "Travel",
          isPrimary: false,
          displayOrder: 0,
        },
      ],
    });
    const { service, repository } = setup({ issuer: inactivePrimary });

    await expectCode(
      service.createOrResumeDraft("tenant-a", "sales-a", draftInput, "user-a"),
      "FISCAL_ISSUER_ECONOMIC_ACTIVITY_NOT_CONFIGURED",
    );
  });

  it("rejects a missing catalog identity", async () => {
    const source = salesOrder({
      lines: [sourceLine({ additionalServiceCatalogId: null })],
    });
    const { service, repository } = setup({ salesOrder: source, profiles: [] });

    await expectCode(
      service.createOrResumeDraft("tenant-a", "sales-a", draftInput, "user-a"),
      "SALES_ORDER_LINE_SOURCE_IDENTITY_MISSING",
    );
    expect(repository.createDraft).not.toHaveBeenCalled();
  });

  it.each([
    [[], "SALES_ORDER_LINE_FISCAL_PROFILE_MISSING"],
    [[profile({ isActive: false })], "SALES_ORDER_LINE_FISCAL_PROFILE_INACTIVE"],
    [[profile()], "SALES_ORDER_LINE_FISCAL_PROFILE_INVALID"],
  ])("rejects missing, inactive, or globally invalid fiscal profiles", async (profiles, code) => {
    const { service, repository, fiscalCatalog } = setup({ profiles });
    if (code === "SALES_ORDER_LINE_FISCAL_PROFILE_INVALID") {
      fiscalCatalog.evaluateFiscalProfiles.mockResolvedValue(
        new Map([
          ["catalog-a", { status: "INVALID", isReady: false, issues: ["CABYS_INVALID"] }],
        ]),
      );
    }

    await expectCode(
      service.createOrResumeDraft("tenant-a", "sales-a", draftInput, "user-a"),
      code,
    );
    expect(repository.createDraft).not.toHaveBeenCalled();
  });

  it("rejects a fiscal-profile percentage mismatch", async () => {
    const { service, repository } = setup({
      profiles: [profile({ taxPercentage: "4.0000" })],
    });

    await expectCode(
      service.createOrResumeDraft("tenant-a", "sales-a", draftInput, "user-a"),
      "SALES_ORDER_LINE_TAX_MISMATCH",
    );
    expect(repository.createDraft).not.toHaveBeenCalled();
  });

  it("rejects a mismatch between line and header totals", async () => {
    const { service, repository } = setup({
      salesOrder: salesOrder({ total: "999.0000" }),
    });

    await expectCode(
      service.createOrResumeDraft("tenant-a", "sales-a", draftInput, "user-a"),
      "SALES_ORDER_TOTALS_MISMATCH",
    );
    expect(repository.createDraft).not.toHaveBeenCalled();
  });

  it.each(["01", "04"])(
    "creates a valid %s draft with immutable line and tax snapshots",
    async (documentTypeCode) => {
      const { service, repository, fiscalCatalog } = setup();

      const result = await service.createOrResumeDraft(
        "tenant-a",
        "sales-a",
        { ...draftInput, documentTypeCode },
        "user-a",
      );

      expect(result).toEqual(workspace);
      const create = repository.createDraft.mock.calls[0][0];
      expect(create).toMatchObject({
        tenantId: "tenant-a",
        fiscalIssuerId: "issuer-a",
        documentTypeCode,
        internalNumber: "BD-SO-sales-a",
        source: {
          sourceType: "SALES_ORDER",
          sourceId: "sales-a",
          sourceNumber: "SO-2026-000001",
          sourceRole: "PRIMARY",
          creationDeduplicationKey:
            "billing-document:primary:sales-order:sales-a",
        },
        totals: {
          grossSubtotal: "100.0000",
          grossTaxTotal: "13.0000",
          total: "113.0000",
        },
        issuer: { economicActivityCode: "791100" },
      });
      expect(create.lines).toEqual([
        expect.objectContaining({
          quantity: "1.0000",
          unitPrice: "100.0000",
          grossAmount: "100.0000",
          taxableBase: "100.0000",
          taxAmount: "13.0000",
          netTaxAmount: "13.0000",
          lineTotal: "113.0000",
          taxes: [
            expect.objectContaining({
              taxCode: "01",
              rateCode: "08",
              ratePercentage: "13.0000",
            }),
          ],
        }),
      ]);
      expect(fiscalCatalog.evaluateFiscalProfiles).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps repository and global-readiness operations bounded for multiple lines", async () => {
    const secondLine = sourceLine({
      id: "line-b",
      additionalServiceCatalogId: "catalog-b",
      serviceCode: "TRANSFER",
      subtotal: "50.0000",
      vatAmount: "6.5000",
      total: "56.5000",
    });
    const source = salesOrder({
      commercialSubtotal: "150.0000",
      totalVat: "19.5000",
      total: "169.5000",
      lines: [sourceLine(), secondLine],
    });
    const secondProfile = profile({ additionalServiceCatalogId: "catalog-b" });
    const { service, repository, fiscalCatalog } = setup({
      salesOrder: source,
      profiles: [profile(), secondProfile],
    });
    fiscalCatalog.evaluateFiscalProfiles.mockResolvedValue(
      new Map([
        ["catalog-a", { status: "READY", isReady: true, issues: [] }],
        ["catalog-b", { status: "READY", isReady: true, issues: [] }],
      ]),
    );

    await service.prepare("tenant-a", "sales-a");

    expect(repository.findFiscalProfiles).toHaveBeenCalledTimes(1);
    expect(repository.findFiscalProfiles).toHaveBeenCalledWith("tenant-a", [
      "catalog-a",
      "catalog-b",
    ]);
    expect(fiscalCatalog.evaluateFiscalProfiles).toHaveBeenCalledTimes(1);
  });

  it("resumes an existing DRAFT without validation or duplicate writes", async () => {
    const { service, repository, fiscalCatalog } = setup();
    repository.findPrimaryDocument.mockResolvedValueOnce(primaryDocument());

    const result = await service.createOrResumeDraft(
      "tenant-a",
      "sales-a",
      draftInput,
      "user-a",
    );

    expect(result).toEqual(workspace);
    expect(repository.createDraft).not.toHaveBeenCalled();
    expect(repository.findSalesOrder).not.toHaveBeenCalled();
    expect(fiscalCatalog.evaluateFiscalProfiles).not.toHaveBeenCalled();
  });

  it("recovers a concurrent P2002 by returning the winning DRAFT", async () => {
    const { service, repository } = setup();
    repository.findPrimaryDocument
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(primaryDocument());
    repository.createDraft.mockRejectedValue({ code: "P2002" });

    const result = await service.createOrResumeDraft(
      "tenant-a",
      "sales-a",
      draftInput,
      "user-a",
    );

    expect(result).toEqual(workspace);
    expect(repository.createDraft).toHaveBeenCalledTimes(1);
  });

  it("maps an unexpected P2002 without exposing persistence details", async () => {
    const { service, repository } = setup();
    repository.findPrimaryDocument.mockResolvedValue(null);
    repository.createDraft.mockRejectedValue({ code: "P2002", meta: "private" });

    await expectCode(
      service.createOrResumeDraft("tenant-a", "sales-a", draftInput, "user-a"),
      "BILLING_DRAFT_CONFLICT",
    );
  });

  it.each(["CONFIRMED", "SUBMITTED", "CANCELLED"])(
    "rejects an existing advanced PRIMARY document in %s",
    async (lifecycleStatus) => {
      const { service, repository } = setup();
      repository.findPrimaryDocument.mockResolvedValueOnce(
        primaryDocument({ lifecycleStatus }),
      );

      await expectCode(
        service.createOrResumeDraft("tenant-a", "sales-a", draftInput, "user-a"),
        "BILLING_DRAFT_ALREADY_ADVANCED",
      );
      expect(repository.createDraft).not.toHaveBeenCalled();
    },
  );

  it("reads a workspace only from persisted document snapshots", async () => {
    const { billingDocumentService, repository, fiscalCatalog } = setup();

    expect(
      await billingDocumentService.getWorkspace("tenant-a", "document-a"),
    ).toEqual(workspace);
    expect(repository.findWorkspace).toHaveBeenCalledWith("tenant-a", "document-a");
    expect(repository.findFiscalProfiles).not.toHaveBeenCalled();
    expect(fiscalCatalog.evaluateFiscalProfiles).not.toHaveBeenCalled();
  });

  it("rejects unsupported document types", async () => {
    const { service, repository } = setup();
    await expectCode(
      service.createOrResumeDraft(
        "tenant-a",
        "sales-a",
        { fiscalIssuerId: "issuer-a", documentTypeCode: "99" },
        "user-a",
      ),
      "BILLING_DOCUMENT_TYPE_INVALID",
    );
    expect(repository.findPrimaryDocument).not.toHaveBeenCalled();
  });
});

const draftInput = { fiscalIssuerId: "issuer-a", documentTypeCode: "01" };
const workspace = { id: "document-a", lifecycleStatus: "DRAFT", lines: [] };

function setup(options: {
  salesOrder?: ReturnType<typeof salesOrder>;
  profiles?: Array<ReturnType<typeof profile>>;
  issuer?: ReturnType<typeof issuer>;
} = {}) {
  const selectedIssuer = options.issuer ?? issuer();
  const repository = {
    listEligibleSalesOrders: jest.fn(),
    findSalesOrder: jest.fn().mockResolvedValue(options.salesOrder ?? salesOrder()),
    findBillingConfiguration: jest.fn().mockResolvedValue(configuration()),
    findFiscalProfiles: jest.fn().mockResolvedValue(options.profiles ?? [profile()]),
    findActiveIssuers: jest.fn().mockResolvedValue([selectedIssuer]),
    findIssuer: jest.fn().mockResolvedValue(selectedIssuer),
    findPrimaryDocument: jest.fn().mockResolvedValue(null),
    createDraft: jest.fn().mockResolvedValue(primaryDocument()),
    findWorkspace: jest.fn().mockResolvedValue(workspace),
  };
  const fiscalCatalog = {
    evaluateFiscalProfiles: jest.fn().mockResolvedValue(
      new Map([
        ["catalog-a", { status: "READY", isReady: true, issues: [] }],
      ]),
    ),
  };
  const billingDocumentService = new BillingDocumentService(
    repository as never,
  );
  return {
    service: new SalesOrderFiscalBillingService(
      repository as never,
      fiscalCatalog as never,
      billingDocumentService,
    ),
    billingDocumentService,
    repository,
    fiscalCatalog,
  };
}

function salesOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "sales-a",
    tenantId: "tenant-a",
    orderNumber: "SO-2026-000001",
    status: "CREATED",
    sourceType: "ADDITIONAL_SERVICE_ORDER",
    customerId: "customer-a",
    customerName: "Customer A",
    customerEmail: null,
    currency: "CRC",
    commercialSubtotal: "100.0000",
    totalVat: "13.0000",
    total: "113.0000",
    paymentConditionType: "CASH",
    paymentTermValue: null,
    paymentTermUnit: null,
    commercialObservations: "Snapshot",
    createdAt: new Date("2026-08-17T00:00:00Z"),
    lines: [sourceLine()],
    ...overrides,
  };
}

function sourceLine(overrides: Record<string, unknown> = {}) {
  return {
    id: "line-a",
    additionalServiceCatalogId: "catalog-a",
    serviceCode: "TOUR",
    serviceName: "Tour",
    serviceDetailsVersion: 1,
    serviceDetails: { destination: "Arenal" },
    commercialNotes: "Keep",
    subtotal: "100.0000",
    vatPercentage: "13.0000",
    vatAmount: "13.0000",
    total: "113.0000",
    participants: [{ fullName: "Traveler" }],
    ...overrides,
  };
}

function profile(overrides: Record<string, unknown> = {}) {
  return {
    additionalServiceCatalogId: "catalog-a",
    cabysCode: "1234567890123",
    unitOfMeasureCode: "Sp",
    taxCode: "01",
    taxRateCode: "08",
    taxPercentage: "13.0000",
    isActive: true,
    ...overrides,
  };
}

function configuration(overrides: Record<string, unknown> = {}) {
  return {
    billingEnabled: true,
    electronicIssuanceEnabled: true,
    countryCode: "CR",
    fiscalSchemaVersion: "4.4",
    ...overrides,
  };
}

function issuer(overrides: Record<string, unknown> = {}) {
  return {
    id: "issuer-a",
    tenantId: "tenant-a",
    displayName: "Issuer",
    isActive: true,
    legalName: "Issuer Legal",
    identificationTypeCode: "02",
    identificationNumber: "3101000000",
    email: "issuer@example.test",
    phoneCountryCode: "506",
    phoneNumber: "22220000",
    provinceCode: "1",
    cantonCode: "01",
    districtCode: "01",
    neighborhoodCode: null,
    otherAddressDetails: "San José",
    establishmentCode: "001",
    terminalCode: "00001",
    economicActivities: [
      {
        economicActivityCode: "791100",
        description: "Travel",
        isPrimary: true,
        displayOrder: 0,
      },
    ],
    ...overrides,
  };
}

function primaryDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: "document-a",
    internalNumber: "BD-SO-sales-a",
    lifecycleStatus: "DRAFT",
    documentTypeCode: "01",
    ...overrides,
  };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getResponse()).toMatchObject({ code });
  }
}
