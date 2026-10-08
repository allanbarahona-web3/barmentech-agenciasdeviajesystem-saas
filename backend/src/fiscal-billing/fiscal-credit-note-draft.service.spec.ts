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

  it("accepts a source-constrained gross amount only when it maps exactly to a credited quantity", async () => {
    const context = fixture(original());
    await context.service.createDraft("tenant-a", "user-a", partialInput({ creditedGrossAmount: "50" }));
    expect(context.create.mock.calls[0][0].data.lines.create[0].quantity).toEqual(d("1"));

    const invalid = fixture(original());
    await expect(invalid.service.createDraft("tenant-a", "user-a", partialInput({ creditedGrossAmount: "50.00001" }))).rejects.toMatchObject({
      response: expect.objectContaining({ code: "BILLING_CREDIT_NOTE_INPUT_INVALID" }),
    });
  });

  it("counts only accepted historical type-03 lines against remaining capacity", async () => {
    const context = fixture(original(), [{ sourceLineId: "line-a", creditedQuantity: d("1"), creditedLineTotal: d("56.5") }]);
    await context.service.createDraft("tenant-a", "user-a", partialInput({ creditedQuantity: "1" }));
    expect(context.create).toHaveBeenCalledTimes(1);
    const usageSql = String(context.queryRaw.mock.calls.at(-1)?.[0]);
    expect(usageSql).toContain("credit.\"taxAuthorityStatus\" = 'ACCEPTED'");

    const over = fixture(original(), [{ sourceLineId: "line-a", creditedQuantity: d("2"), creditedLineTotal: d("113") }]);
    await expect(over.service.createDraft("tenant-a", "user-a", partialInput({ creditedQuantity: "1" }))).rejects.toMatchObject({
      response: expect.objectContaining({ code: "BILLING_CREDIT_NOTE_CREDIT_CAP_EXCEEDED" }),
    });
    expect(over.create).not.toHaveBeenCalled();
  });

  it("does not call Finance or AR infrastructure", async () => {
    const context = fixture(original());
    await context.service.createDraft("tenant-a", "user-a", fullInput());
    expect(context.prisma).not.toHaveProperty("payment");
    expect(context.prisma).not.toHaveProperty("accountReceivable");
  });
});

function fixture(source: any, usage: Array<{ sourceLineId: string; creditedQuantity: Prisma.Decimal; creditedLineTotal: Prisma.Decimal }> = []) {
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

function fullInput() {
  return {
    originalBillingDocumentId: "original-a",
    referenceReasonCode: "01",
    referenceReasonDescription: "Devolución parcial",
    fullDocument: true,
  };
}

function partialInput(value: { creditedQuantity?: string; creditedGrossAmount?: string }) {
  return { ...fullInput(), fullDocument: false, lines: [{ sourceBillingDocumentLineId: "line-a", ...value }] };
}

function original(overrides: Record<string, unknown> = {}) {
  const fiscalIssueDate = new Date("2026-10-08T00:00:00.000Z");
  return {
    id: "original-a", tenantId: "tenant-a", documentTypeCode: "01", billingMode: "ELECTRONIC_PROVIDER",
    internalNumber: "BD-SO-a", fiscalNumber: "00100001010000000042", haciendaKey: "5".repeat(50),
    customerId: "customer-a", fiscalIssuerId: "issuer-a", schemaVersion: "4.4", fiscalCalculationPolicyVersion: "CR_V44_DECIMAL_V1", countryCode: "CR", currencyCode: "USD",
    paymentConditionCode: "01", creditTermDays: null, taxAuthorityStatus: "ACCEPTED", fiscalIssueDate, fiscalEmissionAt: new Date("2026-10-08T06:00:00.000Z"),
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
