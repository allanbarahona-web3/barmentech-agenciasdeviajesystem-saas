import { Prisma } from "@prisma/client";
import * as fiscalPolicy from "./cr-v44-fiscal-calculation-policy";
import type { CrV44SalesOrderDraftCommand } from "./billing-document.types";
import { PrismaBillingDocumentRepository } from "./prisma-billing-document.repository";

describe("PrismaBillingDocumentRepository CR_V44_DECIMAL_V1 draft", () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(["SERVICE", "MERCHANDISE"] as const)(
    "calculates a new %s line once and persists exact five-decimal results",
    async (fiscalItemCategory) => {
      const calculate = jest.spyOn(fiscalPolicy, "calculateCrV44FiscalDocument");
      const context = setup({ order: salesOrder({ fiscalItemCategory }) });
      const originalCommercial = {
        subtotal: context.order.lines[0].subtotal.toFixed(),
        vatAmount: context.order.lines[0].vatAmount.toFixed(),
        total: context.order.lines[0].total.toFixed(),
      };

      await context.repository.createCrV44SalesOrderDraft(command());

      expect(calculate).toHaveBeenCalledTimes(1);
      expect(calculate).toHaveBeenCalledWith({
        lines: [
          {
            lineNumber: 1,
            category: fiscalItemCategory,
            quantity: "1",
            unitPrice: "31.25",
            discounts: [],
            taxes: [
              {
                kind: "ORDINARY_IVA",
                tariffCode: "08",
                ratePercentage: "13",
              },
            ],
          },
        ],
      });
      const data = createdData(context);
      expect(data.fiscalCalculationPolicyVersion).toBe("CR_V44_DECIMAL_V1");
      expect(decimals(data, [
        "grossSubtotal",
        "discountTotal",
        "taxableTotal",
        "grossTaxTotal",
        "netTaxTotal",
        "total",
      ])).toEqual({
        grossSubtotal: "31.25",
        discountTotal: "0",
        taxableTotal: "31.25",
        grossTaxTotal: "4.0625",
        netTaxTotal: "4.0625",
        total: "35.3125",
      });
      const line = firstLine(data);
      expect(decimals(line, [
        "quantity",
        "unitPrice",
        "grossAmount",
        "discountAmount",
        "taxableBase",
        "taxAmount",
        "exoneratedTaxAmount",
        "netTaxAmount",
        "lineSubtotal",
        "lineTotal",
      ])).toEqual({
        quantity: "1",
        unitPrice: "31.25",
        grossAmount: "31.25",
        discountAmount: "0",
        taxableBase: "31.25",
        taxAmount: "4.0625",
        exoneratedTaxAmount: "0",
        netTaxAmount: "4.0625",
        lineSubtotal: "31.25",
        lineTotal: "35.3125",
      });
      expect(line.discountCode).toBeNull();
      expect(line.discountReason).toBeNull();
      const tax = firstTax(line);
      expect(tax).toMatchObject({
        taxOrder: 1,
        taxCode: "01",
        rateCode: "08",
        calculationFactor: null,
      });
      expect(decimals(tax, [
        "ratePercentage",
        "taxableBase",
        "taxAmount",
        "netTaxAmount",
      ])).toEqual({
        ratePercentage: "13",
        taxableBase: "31.25",
        taxAmount: "4.0625",
        netTaxAmount: "4.0625",
      });
      expect(tax).not.toHaveProperty("exemption");
      expect(data.exchangeRate).toBeNull();
      expect({
        subtotal: context.order.lines[0].subtotal.toFixed(),
        vatAmount: context.order.lines[0].vatAmount.toFixed(),
        total: context.order.lines[0].total.toFixed(),
      }).toEqual(originalCommercial);
      for (const field of [
        "billingDocumentNumberSequenceId",
        "issuanceIdempotencyKey",
        "providerDocumentId",
        "fiscalEmissionAt",
        "fiscalIssueDate",
        "references",
      ]) {
        expect(data).not.toHaveProperty(field);
      }
    },
  );

  it("calculates mixed categories in one bounded aggregate read", async () => {
    const calculate = jest.spyOn(fiscalPolicy, "calculateCrV44FiscalDocument");
    const order = salesOrder({
      lines: [
        sourceLine({ fiscalItemCategory: "SERVICE" }),
        sourceLine({
          id: "line-b",
          additionalServiceCatalogId: "catalog-b",
          fiscalItemCategory: "MERCHANDISE",
          serviceCode: "ITEM",
          subtotal: decimal("10"),
          vatAmount: decimal("1.3"),
          total: decimal("11.3"),
          additionalServiceCatalog: catalog("catalog-b"),
        }),
      ],
      commercialSubtotal: decimal("41.25"),
      totalVat: decimal("5.36"),
      total: decimal("46.61"),
    });
    const context = setup({ order });

    await context.repository.createCrV44SalesOrderDraft(command());

    expect(context.tx.salesOrder.findFirst).toHaveBeenCalledTimes(1);
    expect(context.tx.salesOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sales-a", tenantId: "tenant-a" },
      }),
    );
    expect(context.tx.tenantBillingConfiguration.findUnique).toHaveBeenCalledTimes(1);
    expect(context.tx.fiscalIssuer.findFirst).toHaveBeenCalledTimes(1);
    expect(context.tx.fiscalCatalogRelease.findMany).toHaveBeenCalledTimes(1);
    expect(context.tx.fiscalCabysEntry.findMany).toHaveBeenCalledTimes(1);
    expect(context.tx.fiscalUnitOfMeasureEntry.findMany).toHaveBeenCalledTimes(1);
    expect(context.tx.fiscalTaxEntry.findMany).toHaveBeenCalledTimes(1);
    expect(context.tx.fiscalTaxRateEntry.findMany).toHaveBeenCalledTimes(1);
    expect(calculate).toHaveBeenCalledTimes(1);
    expect(calculate.mock.calls[0][0]).toMatchObject({
      lines: [
        { lineNumber: 1, category: "SERVICE" },
        { lineNumber: 2, category: "MERCHANDISE" },
      ],
    });
    expect(firstLine(createdData(context)).lineNumber).toBe(1);
    expect((createdData(context).lines as { create: unknown[] }).create).toHaveLength(2);
  });

  it("persists exempt tariff 10 into exempt rather than taxable totals", async () => {
    const context = setup({
      order: salesOrder({
        vatPercentage: decimal("0"),
        vatAmount: decimal("0"),
        total: decimal("31.25"),
        profile: { taxRateCode: "10", taxPercentage: decimal("0") },
      }),
    });

    await context.repository.createCrV44SalesOrderDraft(command());

    const data = createdData(context);
    expect(decimals(data, [
      "taxableTotal",
      "exemptTotal",
      "grossTaxTotal",
      "netTaxTotal",
      "total",
    ])).toEqual({
      taxableTotal: "0",
      exemptTotal: "31.25",
      grossTaxTotal: "0",
      netTaxTotal: "0",
      total: "31.25",
    });
    const line = firstLine(data);
    expect(decimals(line, ["taxableBase", "taxAmount", "lineTotal"])).toEqual({
      taxableBase: "31.25",
      taxAmount: "0",
      lineTotal: "31.25",
    });
    expect(firstTax(line)).toMatchObject({
      taxCode: "01",
      rateCode: "10",
    });
    expect(decimals(firstTax(line), ["taxableBase", "taxAmount", "netTaxAmount"]))
      .toEqual({ taxableBase: "31.25", taxAmount: "0", netTaxAmount: "0" });
  });

  it("persists two different supported tariff pairs exactly", async () => {
    const order = salesOrder({
      lines: [
        sourceLine(),
        sourceLine({
          id: "line-b",
          additionalServiceCatalogId: "catalog-b",
          fiscalItemCategory: "MERCHANDISE",
          serviceCode: "ITEM",
          subtotal: decimal("10"),
          vatPercentage: decimal("4"),
          vatAmount: decimal("0.4"),
          total: decimal("10.4"),
          additionalServiceCatalog: catalog("catalog-b", {
            taxRateCode: "04",
            taxPercentage: decimal("4"),
          }),
        }),
      ],
      commercialSubtotal: decimal("41.25"),
      totalVat: decimal("4.46"),
      total: decimal("45.71"),
    });
    const context = setup({ order });

    await context.repository.createCrV44SalesOrderDraft(command());

    const data = createdData(context);
    expect((data.netTaxTotal as Prisma.Decimal).toFixed()).toBe("4.4625");
    expect((data.total as Prisma.Decimal).toFixed()).toBe("45.7125");
    const lines = (data.lines as { create: Array<Record<string, unknown>> }).create;
    expect(firstTax(lines[0]).rateCode).toBe("08");
    expect(firstTax(lines[1]).rateCode).toBe("04");
    expect((firstTax(lines[1]).taxAmount as Prisma.Decimal).toFixed()).toBe("0.4");
  });

  it("persists a USD draft without resolving or writing an exchange rate", async () => {
    const order = salesOrder();
    order.currency = "USD";
    const context = setup({ order });

    await context.repository.createCrV44SalesOrderDraft(command());

    const data = createdData(context);
    expect(data.currencyCode).toBe("USD");
    expect(data.exchangeRate).toBeNull();
    expect(data).not.toHaveProperty("officialExchangeRateObservationId");
    expect(data).not.toHaveProperty("fiscalExchangeRateEffectiveDate");
  });

  it.each([null, "INVALID"])(
    "rejects legacy or malformed category %s before nested create",
    async (fiscalItemCategory) => {
      const context = setup({
        order: salesOrder({ fiscalItemCategory: fiscalItemCategory as never }),
      });

      await expectCode(
        context.repository.createCrV44SalesOrderDraft(command()),
        fiscalItemCategory === null
          ? "SALES_ORDER_LINE_FISCAL_CATEGORY_UNCLASSIFIED"
          : "BILLING_DRAFT_FISCAL_SOURCE_UNSUPPORTED",
      );
      expect(context.tx.billingDocument.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    "fiscalCabysEntry",
    "fiscalUnitOfMeasureEntry",
    "fiscalTaxEntry",
    "fiscalTaxRateEntry",
  ] as const)("rejects a missing or inactive %s catalog entry", async (model) => {
    const context = setup();
    context.tx[model].findMany.mockResolvedValueOnce([]);

    await expectCode(
      context.repository.createCrV44SalesOrderDraft(command()),
      "SALES_ORDER_LINE_FISCAL_PROFILE_INVALID",
    );
    expect(context.tx.billingDocument.create).not.toHaveBeenCalled();
  });

  it("rejects foreign or contradictory nested profile ownership", async () => {
    for (const profileOverride of [
      { tenantId: "tenant-b" },
      { additionalServiceCatalogId: "catalog-other" },
    ]) {
      const context = setup({
        order: salesOrder({ profile: profileOverride }),
      });
      await expectCode(
        context.repository.createCrV44SalesOrderDraft(command()),
        "BILLING_DRAFT_FISCAL_SOURCE_UNSUPPORTED",
      );
      expect(context.tx.billingDocument.create).not.toHaveBeenCalled();
    }
  });

  it("rejects inactive issuer and invalid primary-activity cardinality", async () => {
    let context = setup();
    context.tx.fiscalIssuer.findFirst.mockResolvedValueOnce(
      issuer({ isActive: false }),
    );
    await expectCode(
      context.repository.createCrV44SalesOrderDraft(command()),
      "FISCAL_ISSUER_NOT_ACTIVE",
    );

    context = setup();
    context.tx.fiscalIssuer.findFirst.mockResolvedValueOnce(
      issuer({ economicActivities: [] }),
    );
    await expectCode(
      context.repository.createCrV44SalesOrderDraft(command()),
      "FISCAL_ISSUER_ECONOMIC_ACTIVITY_NOT_CONFIGURED",
    );
  });

  it.each([
    [
      "document type",
      command({ documentTypeCode: "99" }),
      "BILLING_DOCUMENT_TYPE_INVALID",
    ],
    [
      "receiver pair",
      command({ receiverIdentification: null }),
      "BILLING_RECEIVER_IDENTIFICATION_INVALID",
    ],
    [
      "duplicate payment method",
      command({
        paymentMethods: [paymentMethod(1, "01"), paymentMethod(2, "01")],
      }),
      "BILLING_PAYMENT_METHOD_INVALID",
    ],
    [
      "unsupported payment method",
      command({ paymentMethods: [paymentMethod(1, "08")] }),
      "BILLING_PAYMENT_METHOD_INVALID",
    ],
  ])("rejects invalid transactional %s selection", async (_label, request, code) => {
    const context = setup();
    await expectCode(
      context.repository.createCrV44SalesOrderDraft(request),
      code,
    );
    expect(context.tx.salesOrder.findFirst).not.toHaveBeenCalled();
    expect(context.tx.billingDocument.create).not.toHaveBeenCalled();
  });

  it("rejects an active tariff whose authoritative percentage contradicts the profile", async () => {
    const context = setup();
    context.tx.fiscalTaxRateEntry.findMany.mockResolvedValueOnce([
      {
        taxEntryId: "tax-01",
        code: "08",
        percentage: decimal("4"),
      },
    ]);
    await expectCode(
      context.repository.createCrV44SalesOrderDraft(command()),
      "SALES_ORDER_LINE_FISCAL_PROFILE_INVALID",
    );
    expect(context.tx.billingDocument.create).not.toHaveBeenCalled();
  });

  it("rejects non-ordinary tax and lets the calculator reject unsupported tariffs", async () => {
    let context = setup({
      order: salesOrder({ profile: { taxCode: "02" } }),
    });
    await expectCode(
      context.repository.createCrV44SalesOrderDraft(command()),
      "BILLING_DRAFT_FISCAL_SOURCE_UNSUPPORTED",
    );
    expect(context.tx.billingDocument.create).not.toHaveBeenCalled();

    context = setup({
      order: salesOrder({ profile: { taxRateCode: "99" } }),
    });
    await expectCode(
      context.repository.createCrV44SalesOrderDraft(command()),
      "BILLING_DRAFT_FISCAL_CALCULATION_FAILED",
    );
    expect(context.tx.billingDocument.create).not.toHaveBeenCalled();
  });

  it("rejects Hacienda DECIMAL(18,5) overflow before persistence", async () => {
    const amount = decimal("99999999999999");
    const context = setup({
      order: salesOrder({
        subtotal: amount,
        vatPercentage: decimal("0"),
        vatAmount: decimal("0"),
        total: amount,
        profile: { taxRateCode: "10", taxPercentage: decimal("0") },
      }),
    });

    await expectCode(
      context.repository.createCrV44SalesOrderDraft(command()),
      "BILLING_DRAFT_HACIENDA_MONEY_CAPACITY_EXCEEDED",
    );
    expect(context.tx.billingDocument.create).not.toHaveBeenCalled();
  });

  it("returns an existing null-policy draft without source reads or calculation", async () => {
    const calculate = jest.spyOn(fiscalPolicy, "calculateCrV44FiscalDocument");
    const existing = {
      id: "existing-a",
      internalNumber: "legacy",
      lifecycleStatus: "DRAFT",
      documentTypeCode: "01",
    };
    const context = setup({ existing });

    await expect(
      context.repository.createCrV44SalesOrderDraft(command()),
    ).resolves.toEqual(existing);

    expect(calculate).not.toHaveBeenCalled();
    expect(context.tx.salesOrder.findFirst).not.toHaveBeenCalled();
    expect(context.tx.billingDocument.create).not.toHaveBeenCalled();
  });

  it("sanitizes a calculated nested-create failure and leaves the transaction to roll back", async () => {
    const context = setup({ createError: new Error("raw database URL and customer") });

    await expectCode(
      context.repository.createCrV44SalesOrderDraft(command()),
      "BILLING_DRAFT_ATOMIC_PERSISTENCE_FAILED",
    );
    expect(context.tx.billingDocument.create).toHaveBeenCalledTimes(1);
  });

  it("accepts one exact pristine concurrent CR v4.4 winner", async () => {
    const calculate = jest.spyOn(fiscalPolicy, "calculateCrV44FiscalDocument");
    const context = setup({
      createError: { code: "P2002" },
      winner: concurrentWinner(),
    });

    await expect(
      context.repository.createCrV44SalesOrderDraft(command()),
    ).resolves.toEqual({
      id: "winner-a",
      internalNumber: "BD-SO-sales-a",
      lifecycleStatus: "DRAFT",
      documentTypeCode: "01",
    });
    expect(calculate).toHaveBeenCalledTimes(1);
    expect(context.rootBillingDocument.findFirst).toHaveBeenCalledTimes(1);
    expect(context.rootBillingDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "tenant-a",
          sourceType: "SALES_ORDER",
          sourceId: "sales-a",
          sourceRole: "PRIMARY",
        },
      }),
    );
  });

  it("accepts exact null receiver and ordered multi-payment concurrent winners", async () => {
    const context = setup({
      createError: { code: "P2002" },
      winner: concurrentWinner({
        documentTypeCode: "04",
        receiverIdentificationType: null,
        receiverIdentification: null,
        paymentMethods: [
          { paymentMethodOrder: 1, paymentMethodCode: "01" },
          { paymentMethodOrder: 2, paymentMethodCode: "04" },
        ],
      }),
    });
    await expect(
      context.repository.createCrV44SalesOrderDraft(
        command({
          documentTypeCode: "04",
          receiverIdentificationType: null,
          receiverIdentification: null,
          paymentMethods: [paymentMethod(1, "01"), paymentMethod(2, "04")],
        }),
      ),
    ).resolves.toMatchObject({ id: "winner-a" });
    expect(context.rootBillingDocument.findFirst).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["foreign tenant", { tenantId: "tenant-b" }],
    ["issuer", { fiscalIssuerId: "issuer-b" }],
    ["establishment", { issuerEstablishmentCode: "002" }],
    ["terminal", { issuerTerminalCode: "00002" }],
    ["receiver type", { receiverIdentificationType: "02" }],
    ["receiver number", { receiverIdentification: "987654321" }],
    ["one-sided receiver", { receiverIdentification: null }],
    ["payment count", { paymentMethods: [] }],
    [
      "payment order",
      {
        paymentMethods: [
          { paymentMethodOrder: 2, paymentMethodCode: "01" },
        ],
      },
    ],
    [
      "payment code",
      {
        paymentMethods: [
          { paymentMethodOrder: 1, paymentMethodCode: "04" },
        ],
      },
    ],
    ["billing mode", { billingMode: "MANUAL" }],
    ["deduplication key", { creationDeduplicationKey: "other" }],
    ["null policy", { fiscalCalculationPolicyVersion: null }],
    ["legacy policy", { fiscalCalculationPolicyVersion: "LEGACY" }],
    ["lifecycle", { lifecycleStatus: "CONFIRMED" }],
    ["provider status", { providerStatus: "PENDING" }],
    ["Hacienda status", { taxAuthorityStatus: "PROCESSING" }],
    ["artifact status", { artifactStatus: "PENDING" }],
    ["allocation", { allocatedSequenceNumber: 1n }],
    ["fiscal number", { fiscalNumber: "00100001010000000001" }],
    ["fiscal emission", { fiscalEmissionAt: new Date("2026-08-26T00:00:00Z") }],
    ["issuance identity", { issuanceIdempotencyKey: "issuance-a" }],
    ["provider attempt", { providerLastAttemptAt: new Date("2026-08-26T00:00:00Z") }],
    ["provider acknowledgement", { providerDocumentId: "provider-a" }],
    ["Hacienda identity", { haciendaKey: "1".repeat(50) }],
    ["submission timestamp", { submittedAt: new Date("2026-08-26T00:00:00Z") }],
    ["reconciliation state", { providerReconciliationRequired: true }],
    ["provider error", { providerLastErrorCode: "UNSAFE" }],
    ["status schedule", { providerNextStatusCheckAt: new Date("2026-08-26T00:00:00Z") }],
  ] as const)("rejects a concurrent winner with a different %s", async (_label, override) => {
    const calculate = jest.spyOn(fiscalPolicy, "calculateCrV44FiscalDocument");
    const context = setup({
      createError: { code: "P2002" },
      winner: concurrentWinner(override),
    });

    await expectCode(
      context.repository.createCrV44SalesOrderDraft(command()),
      "BILLING_DRAFT_CONFLICT",
    );
    expect(calculate).toHaveBeenCalledTimes(1);
    expect(context.tx.billingDocument.create).toHaveBeenCalledTimes(1);
    expect(context.rootBillingDocument.findFirst).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing concurrent winner after exactly one reread", async () => {
    const context = setup({ createError: { code: "P2002" }, winner: null });
    await expectCode(
      context.repository.createCrV44SalesOrderDraft(command()),
      "BILLING_DRAFT_CONFLICT",
    );
    expect(context.rootBillingDocument.findFirst).toHaveBeenCalledTimes(1);
  });
});

function setup(options: {
  order?: ReturnType<typeof salesOrder>;
  existing?: Record<string, unknown> | null;
  createError?: unknown;
  winner?: Record<string, unknown> | null;
} = {}) {
  const order = options.order ?? salesOrder();
  const create = options.createError
    ? jest.fn().mockRejectedValue(options.createError)
    : jest.fn().mockResolvedValue({
        id: "document-a",
        internalNumber: "BD-SO-sales-a",
        lifecycleStatus: "DRAFT",
        documentTypeCode: "01",
      });
  const tx = {
    billingDocument: {
      findFirst: jest.fn().mockResolvedValue(options.existing ?? null),
      create,
    },
    salesOrder: {
      findFirst: jest.fn().mockResolvedValue(order),
    },
    tenantBillingConfiguration: {
      findUnique: jest.fn().mockResolvedValue({
        billingEnabled: true,
        electronicIssuanceEnabled: true,
        countryCode: "CR",
        fiscalSchemaVersion: "4.4",
      }),
    },
    fiscalIssuer: {
      findFirst: jest.fn().mockResolvedValue(issuer()),
    },
    fiscalCatalogRelease: {
      findMany: jest.fn().mockResolvedValue([
        { id: "cabys-release", catalogType: "CABYS" },
        { id: "coding-release", catalogType: "ELECTRONIC_INVOICE_CODING" },
      ]),
    },
    fiscalCabysEntry: {
      findMany: jest.fn().mockResolvedValue(
        uniqueProfiles(order).map((profile) => ({ code: profile.cabysCode })),
      ),
    },
    fiscalUnitOfMeasureEntry: {
      findMany: jest.fn().mockResolvedValue(
        uniqueProfiles(order).map((profile) => ({
          code: profile.unitOfMeasureCode,
        })),
      ),
    },
    fiscalTaxEntry: {
      findMany: jest.fn().mockResolvedValue([{ id: "tax-01", code: "01" }]),
    },
    fiscalTaxRateEntry: {
      findMany: jest.fn().mockResolvedValue(
        uniqueProfiles(order).map((profile) => ({
          taxEntryId: "tax-01",
          code: profile.taxRateCode,
          percentage: profile.taxPercentage,
        })),
      ),
    },
  };
  const prisma = {
    $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    billingDocument: {
      findFirst: jest.fn().mockResolvedValue(options.winner ?? null),
    },
  };
  return {
    tx,
    rootBillingDocument: prisma.billingDocument,
    order,
    repository: new PrismaBillingDocumentRepository(prisma as never),
  };
}

function uniqueProfiles(order: ReturnType<typeof salesOrder>) {
  const profiles = order.lines.map(
    (line) => line.additionalServiceCatalog.fiscalProfile,
  );
  return profiles.filter(
    (profile, index) =>
      profiles.findIndex(
        (candidate) =>
          candidate.additionalServiceCatalogId ===
            profile.additionalServiceCatalogId &&
          candidate.taxRateCode === profile.taxRateCode,
      ) === index,
  );
}

function command(
  overrides: Partial<CrV44SalesOrderDraftCommand> = {},
): CrV44SalesOrderDraftCommand {
  return {
    tenantId: "tenant-a",
    salesOrderId: "sales-a",
    fiscalIssuerId: "issuer-a",
    internalNumber: "BD-SO-sales-a",
    documentTypeCode: "01",
    receiverIdentificationType: "01",
    receiverIdentification: "123456789",
    paymentMethods: [
      {
        paymentMethodOrder: 1,
        paymentMethodCode: "01",
        description: null,
        declaredAmount: null,
      },
    ],
    createdByUserId: "user-a",
    ...overrides,
  };
}

function paymentMethod(paymentMethodOrder: number, paymentMethodCode: string) {
  return {
    paymentMethodOrder,
    paymentMethodCode,
    description: null,
    declaredAmount: null,
  };
}

function concurrentWinner(overrides: Record<string, unknown> = {}) {
  return {
    id: "winner-a",
    tenantId: "tenant-a",
    sourceType: "SALES_ORDER",
    sourceId: "sales-a",
    sourceRole: "PRIMARY",
    internalNumber: "BD-SO-sales-a",
    documentTypeCode: "01",
    fiscalIssuerId: "issuer-a",
    issuerEstablishmentCode: "001",
    issuerTerminalCode: "00001",
    receiverIdentificationType: "01",
    receiverIdentification: "123456789",
    billingMode: "ELECTRONIC_PROVIDER",
    creationDeduplicationKey: "billing-document:primary:sales-order:sales-a",
    fiscalCalculationPolicyVersion: "CR_V44_DECIMAL_V1",
    lifecycleStatus: "DRAFT",
    providerStatus: "NOT_SUBMITTED",
    taxAuthorityStatus: "NOT_SUBMITTED",
    artifactStatus: "NOT_GENERATED",
    confirmedAt: null,
    submittedAt: null,
    issuedAt: null,
    providerReconciliationRequired: false,
    providerLastErrorCode: null,
    providerLastErrorAt: null,
    billingDocumentNumberSequenceId: null,
    allocatedSequenceNumber: null,
    fiscalNumber: null,
    fiscalEmissionAt: null,
    fiscalIssueDate: null,
    exchangeRate: null,
    officialExchangeRateObservationId: null,
    fiscalExchangeRateEffectiveDate: null,
    fiscalExchangeRateSourceAuthority: null,
    fiscalExchangeRateIndicatorCode: null,
    issuanceIdempotencyKey: null,
    providerRequestHash: null,
    providerLastAttemptAt: null,
    providerDocumentId: null,
    haciendaKey: null,
    providerEnvironment: null,
    haciendaRejectionDetail: null,
    providerStatusCheckAttempts: 0,
    providerLastStatusCheckAt: null,
    providerNextStatusCheckAt: null,
    providerStatusCheckLockOwner: null,
    providerStatusCheckLeaseUntil: null,
    providerRefreshAttempts: 0,
    providerLastRefreshAt: null,
    providerNextRefreshAt: null,
    providerRefreshLockOwner: null,
    providerRefreshLeaseUntil: null,
    paymentMethods: [{ paymentMethodOrder: 1, paymentMethodCode: "01" }],
    ...overrides,
  };
}

function salesOrder(options: {
  fiscalItemCategory?: "SERVICE" | "MERCHANDISE" | null;
  subtotal?: Prisma.Decimal;
  vatPercentage?: Prisma.Decimal;
  vatAmount?: Prisma.Decimal;
  total?: Prisma.Decimal;
  profile?: Record<string, unknown>;
  lines?: ReturnType<typeof sourceLine>[];
  commercialSubtotal?: Prisma.Decimal;
  totalVat?: Prisma.Decimal;
} = {}) {
  const line = sourceLine({
    fiscalItemCategory:
      "fiscalItemCategory" in options
        ? options.fiscalItemCategory
        : "SERVICE",
    subtotal: options.subtotal ?? decimal("31.25"),
    vatPercentage: options.vatPercentage ?? decimal("13"),
    vatAmount: options.vatAmount ?? decimal("4.06"),
    total: options.total ?? decimal("35.31"),
    additionalServiceCatalog: catalog("catalog-a", options.profile),
  });
  const lines = options.lines ?? [line];
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
    commercialSubtotal: options.commercialSubtotal ?? line.subtotal,
    totalVat: options.totalVat ?? line.vatAmount,
    total: options.total ?? line.total,
    paymentConditionType: "CASH",
    paymentTermValue: null,
    paymentTermUnit: null,
    commercialObservations: "Unchanged",
    createdByUserId: "user-a",
    createdByName: "User A",
    createdAt: new Date("2026-08-25T00:00:00Z"),
    updatedAt: new Date("2026-08-25T00:00:00Z"),
    lines,
  };
}

function sourceLine(overrides: Record<string, unknown> = {}) {
  return {
    id: "line-a",
    tenantId: "tenant-a",
    salesOrderId: "sales-a",
    additionalServiceCatalogId: "catalog-a",
    fiscalItemCategory: "SERVICE",
    serviceCode: "TOUR",
    serviceName: "Tour",
    serviceDetailsVersion: 1,
    serviceDetails: null,
    commercialNotes: null,
    subtotal: decimal("31.25"),
    vatPercentage: decimal("13"),
    vatAmount: decimal("4.06"),
    total: decimal("35.31"),
    participants: [],
    createdAt: new Date("2026-08-25T00:00:00Z"),
    updatedAt: new Date("2026-08-25T00:00:00Z"),
    additionalServiceCatalog: catalog("catalog-a"),
    ...overrides,
  };
}

function catalog(id: string, profileOverrides: Record<string, unknown> = {}) {
  return {
    id,
    tenantId: "tenant-a",
    code: id,
    name: id,
    description: null,
    icon: null,
    color: null,
    displayOrder: 0,
    fiscalItemCategory: "SERVICE",
    isActive: true,
    createdAt: new Date("2026-08-25T00:00:00Z"),
    updatedAt: new Date("2026-08-25T00:00:00Z"),
    fiscalProfile: {
      id: `profile-${id}`,
      tenantId: "tenant-a",
      additionalServiceCatalogId: id,
      cabysCode: "1234567890123",
      unitOfMeasureCode: "Sp",
      taxCode: "01",
      taxRateCode: "08",
      taxPercentage: decimal("13"),
      isActive: true,
      createdAt: new Date("2026-08-25T00:00:00Z"),
      updatedAt: new Date("2026-08-25T00:00:00Z"),
      ...profileOverrides,
    },
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
    commercialName: null,
    countryCode: "CR",
    email: "issuer@example.test",
    phoneCountryCode: "506",
    phoneNumber: "22220000",
    provinceCode: "1",
    cantonCode: "01",
    districtCode: "01",
    neighborhoodCode: null,
    otherAddressDetails: "San José",
    defaultCurrencyCode: "CRC",
    establishmentCode: "001",
    terminalCode: "00001",
    createdAt: new Date("2026-08-25T00:00:00Z"),
    updatedAt: new Date("2026-08-25T00:00:00Z"),
    economicActivities: [
      {
        id: "activity-a",
        tenantId: "tenant-a",
        fiscalIssuerId: "issuer-a",
        economicActivityCode: "791100",
        description: null,
        isPrimary: true,
        displayOrder: 0,
        createdAt: new Date("2026-08-25T00:00:00Z"),
        updatedAt: new Date("2026-08-25T00:00:00Z"),
      },
    ],
    ...overrides,
  };
}

function createdData(context: ReturnType<typeof setup>) {
  return context.tx.billingDocument.create.mock.calls[0][0].data as Record<
    string,
    unknown
  >;
}

function firstLine(data: Record<string, unknown>) {
  return (data.lines as { create: Array<Record<string, unknown>> }).create[0];
}

function firstTax(line: Record<string, unknown>) {
  return (line.taxes as { create: Array<Record<string, unknown>> }).create[0];
}

function decimals(value: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(
    keys.map((key) => [key, (value[key] as Prisma.Decimal).toFixed()]),
  );
}

function decimal(value: string) {
  return new Prisma.Decimal(value);
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({
    response: expect.objectContaining({ code }),
  });
  try {
    await promise;
  } catch (error) {
    expect(JSON.stringify((error as { response: unknown }).response)).not.toMatch(
      /database|customer|prisma|url/i,
    );
  }
}
