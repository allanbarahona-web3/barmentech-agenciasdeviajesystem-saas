import { HttpException } from "@nestjs/common";
import { FiscalIssuerAdminService } from "./fiscal-issuer-admin.service";
import type { FiscalIssuerAdminRepository } from "./fiscal-issuer-admin.repository";
import type { FiscalIssuerRecord } from "./fiscal-issuer-admin.types";

describe("FiscalIssuerAdminService", () => {
  it("accepts an otherwise complete CR issuer with province code 1", async () => {
    const repository = repositoryMock();
    repository.create.mockResolvedValue(issuer({ provinceCode: "1" }));
    const service = new FiscalIssuerAdminService(repository);

    await expect(
      service.create("tenant-a", createInput({ provinceCode: "1" })),
    ).resolves.toMatchObject({ provinceCode: "1" });
    expect(repository.create).toHaveBeenCalledWith(
      "tenant-a",
      expect.objectContaining({ provinceCode: "1" }),
    );
  });

  it("persists and returns only the canonical identification on create", async () => {
    const repository = repositoryMock();
    const provider = { findByIdentification: jest.fn() };
    repository.create.mockImplementation(async (_tenantId, input) =>
      issuer({ identificationNumber: input.identificationNumber }),
    );
    const service = new FiscalIssuerAdminService(repository, provider);

    await expect(
      service.create(
        "tenant-a",
        createInput({ identificationNumber: "3-102-884562" }),
      ),
    ).resolves.toMatchObject({ identificationNumber: "3102884562" });
    expect(repository.create).toHaveBeenCalledWith(
      "tenant-a",
      expect.objectContaining({ identificationNumber: "3102884562" }),
    );
    expect(provider.findByIdentification).not.toHaveBeenCalled();
  });

  it("validates PATCH against the effective persisted combination", async () => {
    const repository = repositoryMock();
    repository.find.mockResolvedValue(issuer());
    const provider = { findByIdentification: jest.fn() };
    const service = new FiscalIssuerAdminService(repository, provider);

    await expect(
      service.update("tenant-a", "issuer-a", { identificationTypeCode: "01" }),
    ).rejects.toMatchObject({ status: 422 });
    expect(repository.update).not.toHaveBeenCalled();

    repository.update.mockResolvedValue(issuer({ identificationNumber: "3102884562" }));
    await service.update("tenant-a", "issuer-a", {
      identificationNumber: "3 102 884562",
    });
    expect(repository.update).toHaveBeenCalledWith(
      "tenant-a",
      "issuer-a",
      expect.objectContaining({ identificationNumber: "3102884562" }),
    );
    expect(provider.findByIdentification).not.toHaveBeenCalled();
  });

  it("validates the effective identification when PATCH changes only country", async () => {
    const repository = repositoryMock();
    repository.find.mockResolvedValue(
      issuer({
        countryCode: "US",
        provinceCode: "1",
        identificationTypeCode: "01",
        identificationNumber: "1234567890",
      }),
    );
    const service = new FiscalIssuerAdminService(repository);

    await expect(
      service.update("tenant-a", "issuer-a", { countryCode: "CR" }),
    ).rejects.toMatchObject({ status: 422 });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it.each(["01", "0", "8", "A", ""])(
    "rejects invalid CR province code %p",
    async (provinceCode) => {
      const repository = repositoryMock();
      const service = new FiscalIssuerAdminService(repository);

      await expect(
        service.create("tenant-a", createInput({ provinceCode })),
      ).rejects.toMatchObject({ status: 400 });
      expect(repository.create).not.toHaveBeenCalled();
    },
  );

  it("preserves the existing two-digit validation behavior for non-CR countries", async () => {
    const repository = repositoryMock();
    repository.create.mockResolvedValue(
      issuer({ countryCode: "US", provinceCode: "01" }),
    );
    const service = new FiscalIssuerAdminService(repository);

    await expect(
      service.create(
        "tenant-a",
        createInput({ countryCode: "US", provinceCode: "01" }),
      ),
    ).resolves.toMatchObject({ countryCode: "US", provinceCode: "01" });
    await expect(
      service.create(
        "tenant-a",
        createInput({ countryCode: "US", provinceCode: "1" }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("returns only safe issuer fields", async () => {
    const repository = repositoryMock();
    repository.list.mockResolvedValue([issuer()]);
    const service = new FiscalIssuerAdminService(repository);

    const result = await service.list("tenant-a");

    expect(result).toEqual([expect.objectContaining({ id: "issuer-a", isActive: false })]);
    expect(result[0]).not.toHaveProperty("tenantId");
    expect(JSON.stringify(result)).not.toMatch(/credential|secret|economicActivit|sequence/i);
  });

  it("uses the same non-disclosing 404 for missing and foreign IDs", async () => {
    const repository = repositoryMock();
    repository.find.mockResolvedValue(null);
    const service = new FiscalIssuerAdminService(repository);

    await expectError(service.find("tenant-a", "missing"), "FISCAL_ISSUER_NOT_FOUND", 404);
    await expectError(service.find("tenant-a", "foreign"), "FISCAL_ISSUER_NOT_FOUND", 404);
  });

  it("rejects incomplete activation with missing field details", async () => {
    const repository = repositoryMock();
    repository.find.mockResolvedValue(issuer());
    repository.setStatus.mockResolvedValue({
      kind: "INCOMPLETE",
      missingFields: ["establishmentCode", "terminalCode"],
    });
    const service = new FiscalIssuerAdminService(repository);

    await expectError(
      service.setStatus("tenant-a", "issuer-a", true),
      "FISCAL_ISSUER_ACTIVATION_INCOMPLETE",
      422,
    );
  });

  it("maps an unexpected activation uniqueness collision to a stable conflict", async () => {
    const repository = repositoryMock();
    repository.find.mockResolvedValue(issuer());
    repository.setStatus.mockRejectedValue({ code: "P2002" });
    const service = new FiscalIssuerAdminService(repository);

    await expectError(
      service.setStatus("tenant-a", "issuer-a", true),
      "FISCAL_ISSUER_ACTIVATION_CONFLICT",
      409,
    );
  });

  it("returns deactivation and repeated activation results unchanged", async () => {
    const repository = repositoryMock();
    repository.find.mockResolvedValue(issuer());
    repository.setStatus
      .mockResolvedValueOnce({ kind: "UPDATED", issuer: issuer({ isActive: false }) })
      .mockResolvedValueOnce({ kind: "UPDATED", issuer: issuer({ isActive: true }) });
    const service = new FiscalIssuerAdminService(repository);

    await expect(service.setStatus("tenant-a", "issuer-a", false)).resolves.toMatchObject({ isActive: false });
    await expect(service.setStatus("tenant-a", "issuer-a", true)).resolves.toMatchObject({ isActive: true });
  });

  it("rejects legacy invalid CR identification before activation", async () => {
    const repository = repositoryMock();
    const provider = { findByIdentification: jest.fn() };
    repository.find.mockResolvedValue(
      issuer({ identificationTypeCode: "01", identificationNumber: "1234567890" }),
    );
    const service = new FiscalIssuerAdminService(repository, provider);

    await expectError(
      service.setStatus("tenant-a", "issuer-a", true),
      "FISCAL_ISSUER_IDENTIFICATION_INVALID",
      422,
    );
    expect(repository.setStatus).not.toHaveBeenCalled();
    expect(provider.findByIdentification).not.toHaveBeenCalled();
  });

  it("allows activation with a valid canonical CR identification", async () => {
    const repository = repositoryMock();
    const provider = { findByIdentification: jest.fn() };
    repository.find.mockResolvedValue(issuer());
    repository.setStatus.mockResolvedValue({
      kind: "UPDATED",
      issuer: issuer({ isActive: true }),
    });
    const service = new FiscalIssuerAdminService(repository, provider);

    await expect(
      service.setStatus("tenant-a", "issuer-a", true),
    ).resolves.toMatchObject({ isActive: true });
    expect(provider.findByIdentification).not.toHaveBeenCalled();
  });
});

function repositoryMock() {
  return {
    list: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    setStatus: jest.fn(),
    listEconomicActivities: jest.fn(),
    findEconomicActivity: jest.fn(),
    createEconomicActivity: jest.fn(),
    selectPrimaryEconomicActivity: jest.fn(),
    deleteEconomicActivity: jest.fn(),
  } as jest.Mocked<FiscalIssuerAdminRepository>;
}

function issuer(overrides: Partial<FiscalIssuerRecord> = {}): FiscalIssuerRecord {
  return {
    id: "issuer-a", tenantId: "tenant-a", displayName: "Issuer", isActive: false,
    legalName: "Issuer S.A.", identificationTypeCode: "02", identificationNumber: "0012345678",
    commercialName: null, countryCode: "CR", email: "fiscal@example.com",
    phoneCountryCode: null, phoneNumber: null, provinceCode: "1", cantonCode: "01",
    districtCode: "01", neighborhoodCode: null, otherAddressDetails: "San José",
    defaultCurrencyCode: null, establishmentCode: "001", terminalCode: "00001",
    createdAt: new Date("2026-08-17T10:00:00Z"), updatedAt: new Date("2026-08-17T11:00:00Z"),
    ...overrides,
  };
}

function createInput(overrides: Record<string, string> = {}) {
  return {
    displayName: "Issuer",
    legalName: "Issuer S.A.",
    identificationTypeCode: "02",
    identificationNumber: "0012345678",
    countryCode: "CR",
    email: "fiscal@example.com",
    provinceCode: "1",
    cantonCode: "01",
    districtCode: "01",
    otherAddressDetails: "San José",
    ...overrides,
  };
}

async function expectError(promise: Promise<unknown>, code: string, status: number) {
  try {
    await promise;
    throw new Error("Expected request to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(status);
    expect((error as HttpException).getResponse()).toEqual(expect.objectContaining({ code }));
  }
}
