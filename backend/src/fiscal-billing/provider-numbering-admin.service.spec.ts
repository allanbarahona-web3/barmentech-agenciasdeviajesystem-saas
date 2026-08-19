import type { FiscalIssuerAdminRepository } from "./fiscal-issuer-admin.repository";
import type {
  FacturaEnCrNumberingProvider,
  ProviderNumberingVerification,
} from "./factura-en-cr-numbering.provider";
import { ProviderNumberingAdminService } from "./provider-numbering-admin.service";

function setup(overrides: Record<string, unknown> = {}) {
  const issuer = {
    id: "issuer-a",
    tenantId: "tenant-a",
    displayName: "Issuer",
    isActive: false,
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
    ...overrides,
  };
  const repository = {
    find: jest.fn().mockResolvedValue(issuer),
  } as unknown as jest.Mocked<FiscalIssuerAdminRepository>;
  const provider = {
    configureIntegratorMode: jest.fn().mockResolvedValue({
      legalId: "3101678166",
      mode: "integrator",
      branchCode: "001",
      terminalCode: "00001",
      appliedToCertificates: 1,
    }),
    verifyIntegratorMode: jest.fn().mockResolvedValue({
      legalId: "3101678166",
      documentTypeCode: "01",
      branchCode: "001",
      terminalCode: "00001",
      mode: "integrator",
      currentNumber: 866,
      nextNumber: 867,
      nextConsecutivo20: "00100001010000000867",
    }),
  } as jest.Mocked<FacturaEnCrNumberingProvider>;
  return {
    repository,
    provider,
    service: new ProviderNumberingAdminService(repository, provider),
  };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({
    response: expect.objectContaining({ code }),
  });
}

describe("ProviderNumberingAdminService", () => {
  it("uses tenant-safe persisted issuer values and returns only safe fields", async () => {
    const { repository, provider, service } = setup();
    await expect(
      service.configureAndVerify("tenant-a", "issuer-a"),
    ).resolves.toEqual({
      issuerId: "issuer-a",
      mode: "integrator",
      branchCode: "001",
      terminalCode: "00001",
      verificationDocumentTypeCode: "01",
      currentNumber: "866",
      nextNumber: "867",
      nextConsecutivo20: "00100001010000000867",
      verified: true,
    });
    expect(repository.find).toHaveBeenCalledWith("tenant-a", "issuer-a");
    expect(provider.configureIntegratorMode).toHaveBeenCalledWith({
      legalId: "3101678166",
      branchCode: "001",
      terminalCode: "00001",
    });
    expect(provider.verifyIntegratorMode).toHaveBeenCalledWith({
      legalId: "3101678166",
      branchCode: "001",
      terminalCode: "00001",
      documentTypeCode: "01",
    });
  });

  it("returns the same tenant-safe 404 for absent issuers", async () => {
    const context = setup();
    context.repository.find.mockResolvedValue(null);
    await expectCode(
      context.service.configureAndVerify("tenant-a", "foreign-issuer"),
      "FISCAL_ISSUER_NOT_FOUND",
    );
    expect(context.provider.configureIntegratorMode).not.toHaveBeenCalled();
  });

  it.each([
    [{ countryCode: "PA" }],
    [{ establishmentCode: null }],
    [{ establishmentCode: "01" }],
    [{ terminalCode: null }],
    [{ terminalCode: "0001" }],
  ])("rejects an issuer that is not ready: %p", async (overrides) => {
    const context = setup(overrides);
    await expectCode(
      context.service.configureAndVerify("tenant-a", "issuer-a"),
      "PROVIDER_NUMBERING_ISSUER_NOT_READY",
    );
    expect(context.provider.configureIntegratorMode).not.toHaveBeenCalled();
  });

  it.each([
    ["mode", { mode: "platform" }],
    ["legal ID", { legalId: "3101678167" }],
    ["branch", { branchCode: "002" }],
    ["terminal", { terminalCode: "00002" }],
    ["document type", { documentTypeCode: "04" }],
    ["consecutive prefix", { nextConsecutivo20: "00200001010000000867" }],
  ])("rejects a verification mismatch in %s", async (_label, mismatch) => {
    const context = setup();
    context.provider.verifyIntegratorMode.mockResolvedValue({
      legalId: "3101678166",
      documentTypeCode: "01",
      branchCode: "001",
      terminalCode: "00001",
      mode: "integrator",
      currentNumber: 866,
      nextNumber: 867,
      nextConsecutivo20: "00100001010000000867",
      ...mismatch,
    } as ProviderNumberingVerification);
    await expectCode(
      context.service.configureAndVerify("tenant-a", "issuer-a"),
      "PROVIDER_NUMBERING_VERIFICATION_MISMATCH",
    );
  });

  it("is repeatable and performs no repository write", async () => {
    const context = setup();
    await context.service.configureAndVerify("tenant-a", "issuer-a");
    await context.service.configureAndVerify("tenant-a", "issuer-a");
    expect(context.provider.configureIntegratorMode).toHaveBeenCalledTimes(2);
    expect(context.provider.verifyIntegratorMode).toHaveBeenCalledTimes(2);
    expect(Object.keys(context.repository)).toEqual(["find"]);
  });
});
