import { Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { FiscalCreditNoteDraftService } from "./fiscal-credit-note-draft.service";

const d = (value: string) => new Prisma.Decimal(value);

describe("FiscalCreditNoteDraftService", () => {
  it.each(["01", "04"])("creates a type-03 draft from an accepted type %s original", async (documentTypeCode) => {
    const context = fixture(original({ documentTypeCode }));

    await expect(context.service.createDraft("tenant-a", "user-a", fullInput())).resolves.toMatchObject({
      billingDocumentId: "credit-a",
      documentTypeCode: "03",
      originalBillingDocumentId: "original-a",
    });

    const data = context.create.mock.calls[0][0].data;
    expect(data.documentTypeCode).toBe("03");
    expect(data.customerId).toBe("customer-a");
    expect(data.currencyCode).toBe("USD");
    expect(data.receiverName).toBe("Customer A");
  });

  it("copies the accepted USD original's frozen fiscal FX snapshot exactly", async () => {
    const source = original({
      exchangeRate: d("526.340000000001"),
      officialExchangeRateObservationId: "observation-original",
      fiscalExchangeRateEffectiveDate: new Date("2026-09-15T00:00:00.000Z"),
      fiscalExchangeRateSourceAuthority: "BCCR",
      fiscalExchangeRateIndicatorCode: "318",
    });
    const context = fixture(source);

    await context.service.createDraft("tenant-a", "user-a", fullInput());

    expect(context.create.mock.calls[0][0].data).toMatchObject({
      currencyCode: "USD",
      exchangeRate: d("526.340000000001"),
      officialExchangeRateObservationId: "observation-original",
      fiscalExchangeRateEffectiveDate: new Date("2026-09-15T00:00:00.000Z"),
      fiscalExchangeRateSourceAuthority: "BCCR",
      fiscalExchangeRateIndicatorCode: "318",
    });
  });

  it("keeps CRC credit-note drafts without an FX snapshot", async () => {
    const context = fixture(original({ currencyCode: "CRC" }));

    await context.service.createDraft("tenant-a", "user-a", fullInput());

    expect(context.create.mock.calls[0][0].data).toMatchObject({
      currencyCode: "CRC",
      exchangeRate: null,
      officialExchangeRateObservationId: null,
      fiscalExchangeRateEffectiveDate: null,
      fiscalExchangeRateSourceAuthority: null,
      fiscalExchangeRateIndicatorCode: null,
    });
  });

  it("uses the unchecked parent create shape and relation-scoped nested creates", async () => {
    const context = fixture(original());

    await context.service.createDraft("tenant-a", "user-a", fullInput());

    const data = context.create.mock.calls[0][0].data;
    expect(data.tenantId).toBe("tenant-a");
    expect(data.references.create).not.toHaveProperty("tenantId");
    expect(data.paymentMethods.create[0]).not.toHaveProperty("tenantId");
    expect(data.lines.create[0]).not.toHaveProperty("tenantId");
    expect(data.lines.create[0].taxes.create[0]).not.toHaveProperty("tenantId");
  });

  it.each([
    ["non-accepted", original({ taxAuthorityStatus: "PROCESSING" }), "BILLING_CREDIT_NOTE_ORIGINAL_NOT_ACCEPTED"],
    ["rejected", original({ taxAuthorityStatus: "REJECTED" }), "BILLING_CREDIT_NOTE_ORIGINAL_NOT_ACCEPTED"],
    ["unsupported type", original({ documentTypeCode: "03" }), "BILLING_CREDIT_NOTE_ORIGINAL_TYPE_UNSUPPORTED"],
    ["missing original / cross tenant", null, "BILLING_CREDIT_NOTE_ORIGINAL_NOT_FOUND"],
  ])("rejects %s originals", async (_label, source, code) => {
    const context = fixture(source);
    await expect(context.service.createDraft("tenant-a", "user-a", fullInput())).rejects.toMatchObject({
      response: expect.objectContaining({ code }),
    });
    expect(context.create).not.toHaveBeenCalled();
  });

  it("persists an exact original-document reference snapshot and full positive fiscal lines", async () => {
    const source = original();
    const context = fixture(source);

    await context.service.createDraft("tenant-a", "user-a", fullInput());

    const data = context.create.mock.calls[0][0].data;
    expect(data.references.create).toEqual({
      referenceOrder: 1,
      referencedBillingDocumentId: "original-a",
      externalDocumentKey: source.haciendaKey,
      externalDocumentNumber: source.fiscalNumber,
      referencedDocumentTypeCode: "01",
      reasonCode: "01",
      reasonDescription: "Devolución parcial",
      referenceDate: source.fiscalIssueDate,
    });
    expect(data.lines.create).toEqual(expect.arrayContaining([
      expect.objectContaining({
        lineNumber: 1,
        description: "Servicio original",
        cabysCode: "78111800",
        quantity: d("2"),
        grossAmount: d("100"),
        lineTotal: d("113"),
      }),
    ]));
    for (const line of data.lines.create) {
      expect(line.quantity.greaterThan(0)).toBe(true);
      expect(line.grossAmount.greaterThan(0)).toBe(true);
      expect(line.lineTotal.greaterThan(0)).toBe(true);
    }
    expect(context.executeRaw).toHaveBeenCalledWith(expect.anything(), "line-a", expect.anything(), "tenant-a", "credit-a");
  });

  it("builds a partial line from the original quantity and preserves its fiscal tuple", async () => {
    const context = fixture(original());

    await context.service.createDraft("tenant-a", "user-a", partialInput({ creditedQuantity: "1" }));

    const line = context.create.mock.calls[0][0].data.lines.create[0];
    expect(line).toMatchObject({
      lineNumber: 1,
      cabysCode: "78111800",
      itemCode: "SERVICE-1",
      description: "Servicio original",
      quantity: d("1"),
      unitPrice: d("50"),
      grossAmount: d("50"),
      taxableBase: d("50"),
      taxAmount: d("6.5"),
      lineTotal: d("56.5"),
    });
    expect(line.taxes.create).toEqual([
      expect.objectContaining({ taxCode: "01", rateCode: "08", ratePercentage: d("13") }),
    ]);
  });

  it("creates a USD 25 monetary credit from a USD 500 source without deriving fractional quantity", async () => {
    const context = fixture(monetaryOriginal());

    await context.service.createDraft("tenant-a", "user-a", partialInput({ creditedGrossAmount: "25" }));

    const line = context.create.mock.calls[0][0].data.lines.create[0];
    expect(line).toMatchObject({
      lineNumber: 1,
      cabysCode: "78111800",
      itemCode: "SERVICE-1",
      description: "Servicio original",
      quantity: d("1"),
      unitPrice: d("25"),
      grossAmount: d("25"),
      taxableBase: d("25"),
      taxAmount: d("3.25"),
      lineTotal: d("28.25"),
    });
    expect(line.taxes.create).toEqual([
      expect.objectContaining({ taxCode: "01", rateCode: "08", ratePercentage: d("13") }),
    ]);
    expect(context.executeRaw).toHaveBeenCalledWith(expect.anything(), "line-a", expect.anything(), "tenant-a", "credit-a");
  });

  it("creates a tax-inclusive USD 50 credit with its base and IVA derived by the CR v4.4 calculator", async () => {
    const context = fixture(monetaryOriginal());

    await context.service.createDraft("tenant-a", "user-a", partialInput({ creditedTotalAmount: "50" }));

    const line = context.create.mock.calls[0][0].data.lines.create[0];
    expect(line).toMatchObject({
      quantity: d("1"),
      unitPrice: d("44.24779"),
      grossAmount: d("44.24779"),
      taxableBase: d("44.24779"),
      taxAmount: d("5.75221"),
      lineTotal: d("50"),
    });
    expect(line.lineTotal.equals(d("50"))).toBe(true);
    expect(line.lineTotal.equals(d("56.5"))).toBe(false);
    expect(line.taxes.create[0]).toMatchObject({
      taxCode: "01",
      rateCode: "08",
      ratePercentage: d("13"),
      taxableBase: d("44.24779"),
      taxAmount: d("5.75221"),
    });
  });

  it("keeps a zero-tax total credit as its fiscal base and final total", async () => {
    const context = fixture(exemptOriginal());

    await context.service.createDraft("tenant-a", "user-a", partialInput({ creditedTotalAmount: "50" }));

    const data = context.create.mock.calls[0][0].data;
    expect(data.lines.create[0]).toMatchObject({
      quantity: d("1"),
      unitPrice: d("50"),
      grossAmount: d("50"),
      taxableBase: d("50"),
      taxAmount: d("0"),
      lineTotal: d("50"),
    });
    expect(data.exemptTotal).toEqual(d("50"));
    expect(data.taxableTotal).toEqual(d("0"));
  });

  it("keeps quantity-based partial credit on the original unit price and quantity capacity", async () => {
    const context = fixture(original(), [creditUsage({ creditedQuantity: d("1"), creditedGrossAmount: d("50"), creditedLineTotal: d("56.5") })]);
    await context.service.createDraft("tenant-a", "user-a", partialInput({ creditedQuantity: "1" }));
    expect(context.create).toHaveBeenCalledTimes(1);
    expect(context.create.mock.calls[0][0].data.lines.create[0]).toMatchObject({ quantity: d("1"), unitPrice: d("50") });
    const usageSql = String(context.queryRaw.mock.calls.at(-1)?.[0]);
    expect(usageSql).toContain("credit.\"taxAuthorityStatus\" = 'ACCEPTED'");

    const over = fixture(original(), [creditUsage({ creditedQuantity: d("2"), creditedGrossAmount: d("100"), creditedLineTotal: d("113") })]);
    await expect(over.service.createDraft("tenant-a", "user-a", partialInput({ creditedQuantity: "1" }))).rejects.toMatchObject({
      response: expect.objectContaining({ code: "BILLING_CREDIT_NOTE_CREDIT_CAP_EXCEEDED" }),
    });
    expect(over.create).not.toHaveBeenCalled();
  });

  it("uses accepted monetary gross and final totals for remaining source-line capacity", async () => {
    const accepted = fixture(monetaryOriginal(), [creditUsage({
      creditedQuantity: d("1"),
      creditedGrossAmount: d("417.47788"),
      creditedLineTotal: d("471.75"),
    })]);
    await expect(accepted.service.createDraft("tenant-a", "user-a", partialInput({ creditedGrossAmount: "25" }))).resolves.toBeDefined();

    const over = fixture(monetaryOriginal(), [creditUsage({
      creditedQuantity: d("1"),
      creditedGrossAmount: d("417.47789"),
      creditedLineTotal: d("471.75001"),
    })]);
    await expect(over.service.createDraft("tenant-a", "user-a", partialInput({ creditedGrossAmount: "25" }))).rejects.toMatchObject({
      response: expect.objectContaining({ code: "BILLING_CREDIT_NOTE_CREDIT_CAP_EXCEEDED" }),
    });
    expect(over.create).not.toHaveBeenCalled();
  });

  it("uses accepted final totals for remaining tax-inclusive source-line capacity", async () => {
    const accepted = fixture(monetaryOriginal(), [creditUsage({
      creditedQuantity: d("1"),
      creditedGrossAmount: d("398.23008"),
      creditedLineTotal: d("450"),
    })]);
    await expect(accepted.service.createDraft("tenant-a", "user-a", partialInput({ creditedTotalAmount: "50" }))).resolves.toBeDefined();
    expect(String(accepted.queryRaw.mock.calls.at(-1)?.[0])).toContain("credit.\"taxAuthorityStatus\" = 'ACCEPTED'");

    const over = fixture(monetaryOriginal(), [creditUsage({
      creditedQuantity: d("1"),
      creditedGrossAmount: d("398.23009"),
      creditedLineTotal: d("450.00001"),
    })]);
    await expect(over.service.createDraft("tenant-a", "user-a", partialInput({ creditedTotalAmount: "50" }))).rejects.toMatchObject({
      response: expect.objectContaining({ code: "BILLING_CREDIT_NOTE_CREDIT_CAP_EXCEEDED" }),
    });
    expect(over.create).not.toHaveBeenCalled();
  });

  it("does not consume monetary capacity for draft or rejected notes", async () => {
    const context = fixture(monetaryOriginal());
    await expect(context.service.createDraft("tenant-a", "user-a", partialInput({ creditedGrossAmount: "25" }))).resolves.toBeDefined();
    const usageSql = String(context.queryRaw.mock.calls.at(-1)?.[0]);
    expect(usageSql).toContain("credit.\"taxAuthorityStatus\" = 'ACCEPTED'");
  });

  it("rejects monetary credits from discounted source lines without dropping their discount", async () => {
    const source = monetaryOriginal();
    const sourceLine = source.lines[0] as any;
    sourceLine.discountAmount = d("1");
    sourceLine.discountCode = "07";
    sourceLine.discountReason = "Promoción";
    const context = fixture(source);

    await expect(context.service.createDraft("tenant-a", "user-a", partialInput({ creditedGrossAmount: "25" }))).rejects.toMatchObject({
      response: expect.objectContaining({ code: "BILLING_CREDIT_NOTE_SOURCE_LINE_DISCOUNT_UNSUPPORTED" }),
    });
    expect(context.create).not.toHaveBeenCalled();
  });

  it("logs unexpected persistence failures without changing the public domain response", async () => {
    const persistenceError = Object.assign(new Error("Foreign key constraint failed"), {
      name: "PrismaClientKnownRequestError",
      code: "P2003",
      meta: {
        modelName: "BillingDocumentLine",
        field_name: "billing_document_lines_credit_source_tenant_fkey",
      },
    });
    const context = fixture(original());
    context.create.mockRejectedValue(persistenceError);
    const logger = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

    try {
      await expect(context.service.createDraft("tenant-a", "user-a", fullInput())).rejects.toMatchObject({
        response: expect.objectContaining({ code: "BILLING_CREDIT_NOTE_DRAFT_PERSISTENCE_FAILED" }),
      });
      expect(logger).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(logger.mock.calls[0][0]))).toEqual(expect.objectContaining({
        operation: "fiscal-credit-note-draft-persistence",
        tenantId: "tenant-a",
        originalBillingDocumentId: "original-a",
        errorName: "PrismaClientKnownRequestError",
        errorMessage: "Foreign key constraint failed",
        prismaCode: "P2003",
        prismaMeta: {
          modelName: "BillingDocumentLine",
          field_name: "billing_document_lines_credit_source_tenant_fkey",
        },
      }));
      expect(logger.mock.calls[0][1]).toBe(persistenceError.stack);
    } finally {
      logger.mockRestore();
    }
  });

  it("does not call Finance or AR infrastructure", async () => {
    const context = fixture(original());
    await context.service.createDraft("tenant-a", "user-a", fullInput());
    expect(context.prisma).not.toHaveProperty("payment");
    expect(context.prisma).not.toHaveProperty("accountReceivable");
  });
});

function fixture(source: any, usage: Array<{ sourceLineId: string; creditedQuantity: Prisma.Decimal; creditedGrossAmount: Prisma.Decimal; creditedLineTotal: Prisma.Decimal }> = []) {
  const queryRaw = jest.fn()
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce(usage);
  const executeRaw = jest.fn().mockResolvedValue(1);
  const create = jest.fn().mockResolvedValue({
    id: "credit-a",
    internalNumber: "BD-NC-original-a-test",
    documentTypeCode: "03",
    lifecycleStatus: "DRAFT",
    total: d("113"),
  });
  const prisma = {
    $transaction: jest.fn((callback) => callback(tx)),
  } as any;
  const tx = {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    billingDocument: { findUnique: jest.fn().mockResolvedValue(source), create },
    billingDocumentLine: { findMany: jest.fn().mockResolvedValue([{ id: "credit-line-a", lineNumber: 1 }]) },
  };
  return { prisma, service: new FiscalCreditNoteDraftService(prisma), create, queryRaw, executeRaw };
}

function creditUsage(overrides: Partial<{ sourceLineId: string; creditedQuantity: Prisma.Decimal; creditedGrossAmount: Prisma.Decimal; creditedLineTotal: Prisma.Decimal }> = {}) {
  return {
    sourceLineId: "line-a",
    creditedQuantity: d("0"),
    creditedGrossAmount: d("0"),
    creditedLineTotal: d("0"),
    ...overrides,
  };
}

function fullInput() {
  return {
    originalBillingDocumentId: "original-a",
    referenceReasonCode: "01",
    referenceReasonDescription: "Devolución parcial",
    fullDocument: true,
  };
}

function partialInput(value: { creditedQuantity?: string; creditedGrossAmount?: string; creditedTotalAmount?: string }) {
  return { ...fullInput(), fullDocument: false, lines: [{ sourceBillingDocumentLineId: "line-a", ...value }] };
}

function original(overrides: Record<string, unknown> = {}) {
  const fiscalIssueDate = new Date("2026-10-08T00:00:00.000Z");
  return {
    id: "original-a", tenantId: "tenant-a", documentTypeCode: "01", billingMode: "ELECTRONIC_PROVIDER",
    internalNumber: "BD-SO-a", fiscalNumber: "00100001010000000042", haciendaKey: "5".repeat(50),
    customerId: "customer-a", fiscalIssuerId: "issuer-a", schemaVersion: "4.4", fiscalCalculationPolicyVersion: "CR_V44_DECIMAL_V1", countryCode: "CR", currencyCode: "USD",
    paymentConditionCode: "01", creditTermDays: null, taxAuthorityStatus: "ACCEPTED", fiscalIssueDate, fiscalEmissionAt: new Date("2026-10-08T06:00:00.000Z"),
    exchangeRate: null, officialExchangeRateObservationId: null, fiscalExchangeRateEffectiveDate: null,
    fiscalExchangeRateSourceAuthority: null, fiscalExchangeRateIndicatorCode: null,
    grossSubtotal: d("100"), discountTotal: d("0"), taxableTotal: d("100"), exemptTotal: d("0"), exoneratedTotal: d("0"), grossTaxTotal: d("13"), exoneratedTaxTotal: d("0"), netTaxTotal: d("13"), total: d("113"),
    issuerName: "Issuer", issuerIdentificationType: "02", issuerIdentification: "3101000000", issuerEconomicActivityCode: "791100", issuerEstablishmentCode: "001", issuerTerminalCode: "00001", issuerEmail: "issuer@example.test", issuerPhone: null, issuerAddressSnapshot: null,
    receiverName: "Customer A", receiverIdentificationType: "01", receiverIdentification: "123456789", receiverEconomicActivityCode: null, receiverEmail: "customer@example.test", receiverPhone: null, receiverAddressSnapshot: null,
    paymentMethods: [{ id: "method-a", paymentMethodOrder: 1, paymentMethodCode: "01", description: null, declaredAmount: null }],
    lines: [{
      id: "line-a", lineNumber: 1, cabysCode: "78111800", itemCode: "SERVICE-1", description: "Servicio original", quantity: d("2"), unitOfMeasureCode: "Sp", unitPrice: d("50"), grossAmount: d("100"), discountAmount: d("0"), discountCode: null, discountReason: null,
      taxableBase: d("100"), taxAmount: d("13"), exoneratedTaxAmount: d("0"), netTaxAmount: d("13"), lineSubtotal: d("100"), lineTotal: d("113"),
      taxes: [{ id: "tax-a", taxOrder: 1, taxCode: "01", rateCode: "08", ratePercentage: d("13"), taxableBase: d("100"), taxAmount: d("13"), calculationFactor: null, netTaxAmount: d("13"), exemption: null }],
    }],
    ...overrides,
  };
}

function monetaryOriginal() {
  const source = original();
  return {
    ...source,
    grossSubtotal: d("442.47788"), discountTotal: d("0"), taxableTotal: d("442.47788"), exemptTotal: d("0"), exoneratedTotal: d("0"), grossTaxTotal: d("57.52212"), exoneratedTaxTotal: d("0"), netTaxTotal: d("57.52212"), total: d("500"),
    lines: [{
      ...source.lines[0],
      quantity: d("1"), unitPrice: d("442.47788"), grossAmount: d("442.47788"), discountAmount: d("0"), taxableBase: d("442.47788"), taxAmount: d("57.52212"), exoneratedTaxAmount: d("0"), netTaxAmount: d("57.52212"), lineSubtotal: d("442.47788"), lineTotal: d("500"),
      taxes: [{ ...source.lines[0].taxes[0], taxableBase: d("442.47788"), taxAmount: d("57.52212"), netTaxAmount: d("57.52212") }],
    }],
  };
}

function exemptOriginal() {
  const source = original();
  return {
    ...source,
    grossSubtotal: d("100"), taxableTotal: d("0"), exemptTotal: d("100"), grossTaxTotal: d("0"), netTaxTotal: d("0"), total: d("100"),
    lines: [{
      ...source.lines[0],
      quantity: d("1"), unitPrice: d("100"), grossAmount: d("100"), taxableBase: d("100"), taxAmount: d("0"), netTaxAmount: d("0"), lineSubtotal: d("100"), lineTotal: d("100"),
      taxes: [{ ...source.lines[0].taxes[0], rateCode: "10", ratePercentage: d("0"), taxableBase: d("100"), taxAmount: d("0"), netTaxAmount: d("0") }],
    }],
  };
}
