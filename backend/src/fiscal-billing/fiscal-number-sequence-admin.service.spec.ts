import type { FiscalIssuerAdminRepository } from "./fiscal-issuer-admin.repository";
import type {
  FiscalNumberSequenceAdminRepository,
  FiscalNumberSequenceRecord,
} from "./fiscal-number-sequence-admin.repository";
import { FiscalNumberSequenceAdminService } from "./fiscal-number-sequence-admin.service";
import type { ProviderNumberingAdminService } from "./provider-numbering-admin.service";

const issuer = {
  id: "issuer-a",
  tenantId: "tenant-a",
  displayName: "Issuer",
  isActive: true,
  legalName: "Issuer",
  identificationTypeCode: "02",
  identificationNumber: "3101678166",
  commercialName: null,
  countryCode: "CR",
  email: "issuer@example.test",
  phoneCountryCode: null,
  phoneNumber: null,
  provinceCode: "1",
  cantonCode: "01",
  districtCode: "01",
  neighborhoodCode: null,
  otherAddressDetails: "Address",
  defaultCurrencyCode: "CRC",
  establishmentCode: "001",
  terminalCode: "00001",
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

function sequence(overrides: Partial<FiscalNumberSequenceRecord> = {}) {
  return {
    id: "sequence-a",
    tenantId: "tenant-a",
    fiscalIssuerId: "issuer-a",
    establishmentCode: "001",
    terminalCode: "00001",
    documentTypeCode: "01",
    startingSequenceNumber: 1093n,
    nextSequenceNumber: 1093n,
    ...overrides,
  };
}

function setup() {
  const issuerRepository = {
    find: jest.fn().mockResolvedValue(issuer),
  } as unknown as jest.Mocked<FiscalIssuerAdminRepository>;
  const sequenceRepository = {
    list: jest.fn().mockResolvedValue([]),
    find: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((scope, value) =>
      Promise.resolve(
        sequence({
          ...scope,
          startingSequenceNumber: value,
          nextSequenceNumber: value,
        }),
      ),
    ),
    advance: jest.fn(),
  } as jest.Mocked<FiscalNumberSequenceAdminRepository>;
  const provider = {
    verifyIssuerIntegratorMode: jest.fn().mockResolvedValue({ mode: "integrator" }),
  } as unknown as jest.Mocked<ProviderNumberingAdminService>;
  return {
    issuerRepository,
    sequenceRepository,
    provider,
    service: new FiscalNumberSequenceAdminService(
      issuerRepository,
      sequenceRepository,
      provider,
    ),
  };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({
    response: expect.objectContaining({ code }),
  });
}

describe("FiscalNumberSequenceAdminService", () => {
  it("lists all supported types with configured and unconfigured states", async () => {
    const context = setup();
    context.sequenceRepository.list.mockResolvedValue([sequence()]);
    const result = await context.service.list("tenant-a", "issuer-a");
    expect(result).toEqual({
      issuerId: "issuer-a",
      establishmentCode: "001",
      terminalCode: "00001",
      sequences: [
        {
          documentTypeCode: "01",
          documentTypeName: "Factura electrónica",
          configured: true,
          startingSequenceNumber: "1093",
          nextSequenceNumber: "1093",
          providerBasePreview: "0000001093",
          fullConsecutivePreview: "00100001010000001093",
        },
        ...[
          ["02", "Nota de débito"],
          ["03", "Nota de crédito"],
          ["04", "Tiquete electrónico"],
          ["08", "Factura electrónica de compra"],
          ["09", "Factura electrónica de exportación"],
          ["10", "Recibo electrónico de pago"],
        ].map(([documentTypeCode, documentTypeName]) => ({
          documentTypeCode,
          documentTypeName,
          configured: false,
          startingSequenceNumber: null,
          nextSequenceNumber: null,
          providerBasePreview: null,
          fullConsecutivePreview: null,
        })),
      ],
    });
    expect(context.sequenceRepository.list).toHaveBeenCalledWith(
      "tenant-a",
      "issuer-a",
      "001",
      "00001",
    );
    expect(context.provider.verifyIssuerIntegratorMode).not.toHaveBeenCalled();
    expect(context.sequenceRepository.create).not.toHaveBeenCalled();
    expect(context.sequenceRepository.advance).not.toHaveBeenCalled();
  });

  it.each([
    ["08", "Factura electrónica de compra", "00100001080000000001"],
    ["09", "Factura electrónica de exportación", "00100001090000000001"],
    ["10", "Recibo electrónico de pago", "00100001100000000001"],
  ])(
    "initializes %s independently with its document-type preview",
    async (documentTypeCode, documentTypeName, fullConsecutivePreview) => {
      const context = setup();
      const result = await context.service.set(
        "tenant-a",
        "issuer-a",
        documentTypeCode,
        "1",
      );
      expect(context.sequenceRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ documentTypeCode }),
        1n,
      );
      expect(context.provider.verifyIssuerIntegratorMode).toHaveBeenCalledWith(
        issuer,
        "01",
      );
      expect(result).toMatchObject({
        documentTypeCode,
        documentTypeName,
        providerBasePreview: "0000000001",
        fullConsecutivePreview,
      });
    },
  );

  it("creates starting and next as the same BigInt after provider verification", async () => {
    const context = setup();
    const result = await context.service.set(
      "tenant-a",
      "issuer-a",
      "01",
      "1093",
    );
    expect(context.provider.verifyIssuerIntegratorMode).toHaveBeenCalledWith(
      issuer,
      "01",
    );
    expect(context.sequenceRepository.create).toHaveBeenCalledWith(
      {
        tenantId: "tenant-a",
        fiscalIssuerId: "issuer-a",
        establishmentCode: "001",
        terminalCode: "00001",
        documentTypeCode: "01",
      },
      1093n,
    );
    expect(result).toMatchObject({
      startingSequenceNumber: "1093",
      nextSequenceNumber: "1093",
      providerBasePreview: "0000001093",
    });
  });

  it.each([
    undefined,
    null,
    1,
    "",
    "0",
    "-1",
    "+1",
    "1.0",
    "1e3",
    " 1",
    "1 ",
    "01",
    "1A",
    "10000000000",
  ])("rejects invalid sequence value %p before provider access", async (value) => {
    const context = setup();
    await expectCode(
      context.service.set("tenant-a", "issuer-a", "01", value),
      "FISCAL_NUMBER_SEQUENCE_INVALID",
    );
    expect(context.provider.verifyIssuerIntegratorMode).not.toHaveBeenCalled();
    expect(context.sequenceRepository.create).not.toHaveBeenCalled();
  });

  it.each(["05", "06", "07", "11", "99"])(
    "rejects unsupported document type %s",
    async (documentTypeCode) => {
    const context = setup();
    await expectCode(
      context.service.set("tenant-a", "issuer-a", documentTypeCode, "1"),
      "FISCAL_NUMBER_SEQUENCE_DOCUMENT_TYPE_INVALID",
    );
    expect(context.provider.verifyIssuerIntegratorMode).not.toHaveBeenCalled();
    expect(context.sequenceRepository.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    { isActive: false },
    { countryCode: "PA" },
    { identificationNumber: "3-101-678166" },
    { establishmentCode: null },
    { establishmentCode: "01" },
    { terminalCode: null },
    { terminalCode: "0001" },
  ])("rejects an issuer that is not ready: %p", async (change) => {
    const context = setup();
    context.issuerRepository.find.mockResolvedValue({ ...issuer, ...change });
    await expectCode(
      context.service.set("tenant-a", "issuer-a", "01", "1"),
      "FISCAL_NUMBER_SEQUENCE_ISSUER_NOT_READY",
    );
    expect(context.provider.verifyIssuerIntegratorMode).not.toHaveBeenCalled();
  });

  it("makes foreign and missing issuers indistinguishable", async () => {
    const context = setup();
    context.issuerRepository.find.mockResolvedValue(null);
    await expectCode(
      context.service.list("tenant-a", "foreign-id"),
      "FISCAL_ISSUER_NOT_FOUND",
    );
    expect(context.issuerRepository.find).toHaveBeenCalledWith(
      "tenant-a",
      "foreign-id",
    );
  });

  it("does not write when provider verification fails", async () => {
    const context = setup();
    context.provider.verifyIssuerIntegratorMode.mockRejectedValue({
      response: { code: "PROVIDER_NUMBERING_VERIFICATION_MISMATCH" },
    });
    await expectCode(
      context.service.set("tenant-a", "issuer-a", "01", "1093"),
      "FISCAL_NUMBER_SEQUENCE_PROVIDER_NOT_VERIFIED",
    );
    expect(context.sequenceRepository.create).not.toHaveBeenCalled();
  });

  it("returns exact repeated PUT without provider access or write", async () => {
    const context = setup();
    context.sequenceRepository.find.mockResolvedValue(sequence());
    await expect(
      context.service.set("tenant-a", "issuer-a", "01", "1093"),
    ).resolves.toMatchObject({ nextSequenceNumber: "1093" });
    expect(context.provider.verifyIssuerIntegratorMode).not.toHaveBeenCalled();
    expect(context.sequenceRepository.advance).not.toHaveBeenCalled();
  });

  it("rejects decreases before provider access", async () => {
    const context = setup();
    context.sequenceRepository.find.mockResolvedValue(sequence());
    await expectCode(
      context.service.set("tenant-a", "issuer-a", "01", "1092"),
      "FISCAL_NUMBER_SEQUENCE_DECREASE",
    );
    expect(context.provider.verifyIssuerIntegratorMode).not.toHaveBeenCalled();
  });

  it("advances conditionally while preserving the original start", async () => {
    const context = setup();
    context.sequenceRepository.find.mockResolvedValue(sequence());
    context.sequenceRepository.advance.mockResolvedValue({
      kind: "UPDATED",
      sequence: sequence({ nextSequenceNumber: 1200n }),
    });
    const result = await context.service.set(
      "tenant-a",
      "issuer-a",
      "01",
      "1200",
    );
    expect(context.sequenceRepository.advance).toHaveBeenCalledWith(
      expect.any(Object),
      1093n,
      1200n,
    );
    expect(result).toMatchObject({
      startingSequenceNumber: "1093",
      nextSequenceNumber: "1200",
    });
  });

  it("returns an exact concurrent P2002 creation winner", async () => {
    const context = setup();
    context.sequenceRepository.create.mockRejectedValue({ code: "P2002" });
    context.sequenceRepository.find
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(sequence());
    await expect(
      context.service.set("tenant-a", "issuer-a", "01", "1093"),
    ).resolves.toMatchObject({ nextSequenceNumber: "1093" });
  });

  it("rejects a differing concurrent P2002 creation winner", async () => {
    const context = setup();
    context.sequenceRepository.create.mockRejectedValue({ code: "P2002" });
    context.sequenceRepository.find
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(sequence({ nextSequenceNumber: 1094n }));
    await expectCode(
      context.service.set("tenant-a", "issuer-a", "01", "1093"),
      "FISCAL_NUMBER_SEQUENCE_CONFLICT",
    );
  });

  it("does not overwrite a stale concurrent advancement", async () => {
    const context = setup();
    context.sequenceRepository.find.mockResolvedValue(sequence());
    context.sequenceRepository.advance.mockResolvedValue({
      kind: "CHANGED",
      sequence: sequence({ nextSequenceNumber: 1300n }),
    });
    await expectCode(
      context.service.set("tenant-a", "issuer-a", "01", "1200"),
      "FISCAL_NUMBER_SEQUENCE_CONFLICT",
    );
  });
});
