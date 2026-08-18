import { HttpException } from "@nestjs/common";
import { FiscalIssuerAdminService } from "./fiscal-issuer-admin.service";
import type { FiscalIssuerAdminRepository } from "./fiscal-issuer-admin.repository";
import { HaciendaActivityLookupError } from "./hacienda-economic-activity.provider";

describe("FiscalIssuerAdminService available economic activities", () => {
  it("loads tenant-safely and uses only the persisted identification", async () => {
    const repository = repositoryMock(issuer());
    const provider = {
      findByIdentification: jest.fn().mockResolvedValue({
        legalName: "Official name",
        activities: [{ code: "0012.0", description: "Activity" }],
      }),
    };
    const service = new FiscalIssuerAdminService(repository, provider);

    await expect(
      service.availableEconomicActivities("tenant-auth", "issuer-a"),
    ).resolves.toEqual({
      issuer: {
        id: "issuer-a",
        identificationTypeCode: "02",
        identificationNumber: "0012345678",
      },
      legalName: "Official name",
      activities: [{ code: "0012.0", description: "Activity" }],
    });
    expect(repository.find).toHaveBeenCalledWith("tenant-auth", "issuer-a");
    expect(provider.findByIdentification).toHaveBeenCalledWith("0012345678");
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.setStatus).not.toHaveBeenCalled();
  });

  it.each(["missing", "foreign"])(
    "returns the same non-disclosing error for a %s issuer",
    async () => {
      const service = new FiscalIssuerAdminService(repositoryMock(null), {
        findByIdentification: jest.fn(),
      });
      await expectCode(
        service.availableEconomicActivities("tenant-auth", "issuer-a"),
        "FISCAL_ISSUER_NOT_FOUND",
        404,
      );
    },
  );

  it.each([
    ["HACIENDA_ACTIVITY_LOOKUP_TIMEOUT", 504],
    ["HACIENDA_ACTIVITY_LOOKUP_RATE_LIMITED", 429],
    ["HACIENDA_ACTIVITY_LOOKUP_UNAVAILABLE", 503],
    ["HACIENDA_ACTIVITY_LOOKUP_INVALID_RESPONSE", 502],
    ["HACIENDA_TAXPAYER_NOT_FOUND", 404],
  ] as const)("maps %s to HTTP %s", async (code, status) => {
    const service = new FiscalIssuerAdminService(repositoryMock(issuer()), {
      findByIdentification: jest
        .fn()
        .mockRejectedValue(new HaciendaActivityLookupError(code)),
    });
    await expectCode(
      service.availableEconomicActivities("tenant-auth", "issuer-a"),
      code,
      status,
    );
  });
});

async function expectCode(
  promise: Promise<unknown>,
  code: string,
  status: number,
) {
  try {
    await promise;
    throw new Error("Expected lookup to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(status);
    expect((error as HttpException).getResponse()).toMatchObject({ code });
  }
}

function repositoryMock(found: ReturnType<typeof issuer> | null) {
  return {
    list: jest.fn(),
    find: jest.fn().mockResolvedValue(found),
    create: jest.fn(),
    update: jest.fn(),
    setStatus: jest.fn(),
  } as jest.Mocked<FiscalIssuerAdminRepository>;
}

function issuer() {
  return {
    id: "issuer-a",
    tenantId: "tenant-auth",
    displayName: "Issuer",
    isActive: true,
    legalName: "Stored name",
    identificationTypeCode: "02",
    identificationNumber: "0012345678",
    commercialName: null,
    countryCode: "CR",
    email: "issuer@example.com",
    phoneCountryCode: null,
    phoneNumber: null,
    provinceCode: "1",
    cantonCode: "01",
    districtCode: "01",
    neighborhoodCode: null,
    otherAddressDetails: "San José",
    defaultCurrencyCode: null,
    establishmentCode: "001",
    terminalCode: "00001",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}
