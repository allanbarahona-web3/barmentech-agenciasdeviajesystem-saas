import { BillingMode } from "@prisma/client";
import type { BillingDocumentDraftCommand } from "./billing-document.types";
import { PrismaBillingDocumentRepository } from "./prisma-billing-document.repository";

describe("PrismaBillingDocumentRepository generic draft persistence", () => {
  it("persists a ready command without a SalesOrder object or hardcoded source values", async () => {
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
      sourceType: "CUSTOM_INTAKE",
      sourceId: "custom-source-1",
      sourceNumber: "CUSTOM-0001",
      sourceRole: "PRIMARY",
      creationDeduplicationKey: "custom-deduplication-key",
      currencyCode: "USD",
      receiverName: "Generic Receiver",
      fiscalNumber: null,
      haciendaKey: null,
      issuedAt: null,
      lifecycleStatus: "DRAFT",
      providerStatus: "NOT_SUBMITTED",
      taxAuthorityStatus: "NOT_SUBMITTED",
    });
    expect(JSON.stringify(data)).not.toContain("SALES_ORDER");
    expect(JSON.stringify(data)).not.toContain("BD-SO-");
    expect(JSON.stringify(data)).not.toContain("billingDocumentNumberSequence");
    expect(data.lines.create[0].taxes.create).toHaveLength(1);
    expect("paymentMethods" in data).toBe(false);
    expect("references" in data).toBe(false);
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
    exchangeRate: null,
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
