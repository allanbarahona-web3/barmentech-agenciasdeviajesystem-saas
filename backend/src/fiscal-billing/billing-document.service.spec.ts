import { BillingMode } from "@prisma/client";
import { BillingDocumentService } from "./billing-document.service";
import type { BillingDocumentDraftCommand } from "./billing-document.types";

describe("BillingDocumentService generic core", () => {
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
    const service = new BillingDocumentService(repository as never);

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

  it("delegates the internal issuance request without accepting fiscal identity", async () => {
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
      requestElectronicIssuance: jest.fn().mockResolvedValue(allocation),
    };
    const service = new BillingDocumentService(repository as never);

    await expect(
      service.requestElectronicIssuance("tenant-a", "document-a", "user-a"),
    ).resolves.toEqual(allocation);
    expect(repository.requestElectronicIssuance).toHaveBeenCalledWith(
      "tenant-a",
      "document-a",
      "user-a",
    );
  });
});

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
    exchangeRate: null,
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
