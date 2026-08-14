import { UnprocessableEntityException } from "@nestjs/common";
import { FiscalCatalogService } from "../../fiscal-catalogs/fiscal-catalog.service";
import { AdditionalServiceMarginType } from "../enums";
import {
  AdditionalServiceFiscalProfileRecord,
  AdditionalServicePricingConfigurationRecord,
  AdditionalServicesRepository,
} from "../repositories";
import { AdditionalServicePricingConfigurationReader } from "./additional-service-pricing-configuration.reader";

describe("AdditionalServicePricingConfigurationReader fiscal boundary", () => {
  const tenantId = "tenant-1";
  const configuration = (id: string): AdditionalServicePricingConfigurationRecord => ({
    id: `pricing-${id}`, tenantId, additionalServiceCatalogId: id,
    marginType: AdditionalServiceMarginType.PERCENTAGE, marginValue: "12.5000",
    taxPercentage: "13.0000", isActive: true, createdAt: new Date(), updatedAt: new Date(),
    additionalServiceCatalog: { id, tenantId, code: id.toUpperCase(), name: id, isActive: true },
  });
  const profile = (id: string, isActive = true): AdditionalServiceFiscalProfileRecord => ({
    id: `profile-${id}`, tenantId, additionalServiceCatalogId: id,
    cabysCode: "8554000000000", unitOfMeasureCode: "Sp", taxCode: "01",
    taxRateCode: "08", taxPercentage: "13.0000", isActive,
    createdAt: new Date(), updatedAt: new Date(),
  });

  function setup(profiles: AdditionalServiceFiscalProfileRecord[], statuses: Record<string, boolean>) {
    const repository = {
      findPricingConfigurationByCatalogId: jest.fn(async (_tenant: string, id: string) => configuration(id)),
      findPricingConfigurationsByCatalogIds: jest.fn(async (_tenant: string, ids: string[]) => ids.map(configuration)),
      findFiscalProfilesByCatalogIds: jest.fn().mockResolvedValue(profiles),
    } as unknown as jest.Mocked<AdditionalServicesRepository>;
    const fiscal = {
      evaluateFiscalProfiles: jest.fn(async () => new Map(Object.entries(statuses).map(([id, isReady]) => [id, { status: isReady ? "READY" : "INVALID", isReady, issues: [] }]))),
    };
    return { repository, fiscal, reader: new AdditionalServicePricingConfigurationReader(repository, fiscal as unknown as FiscalCatalogService) };
  }

  it("rejects active legacy pricing when its fiscal profile is absent", async () => {
    const { reader } = setup([], {});
    await expect(reader.findForAdditionalService(tenantId, "service-1")).rejects.toMatchObject({ response: { code: "ADDITIONAL_SERVICE_NOT_FISCALLY_READY" } });
  });

  it("rejects inactive and globally invalid fiscal profiles", async () => {
    for (const candidate of [profile("service-1", false), profile("service-1")]) {
      const { reader } = setup([candidate], { "service-1": false });
      await expect(reader.findForAdditionalService(tenantId, "service-1")).rejects.toBeInstanceOf(UnprocessableEntityException);
    }
  });

  it("uses the READY fiscal profile percentage instead of the legacy pricing percentage", async () => {
    const readyProfile = { ...profile("service-1"), taxPercentage: "4.0000" };
    const { reader } = setup([readyProfile], { "service-1": true });
    await expect(reader.findForAdditionalService(tenantId, "service-1")).resolves.toEqual({ marginType: "PERCENTAGE", marginValue: 12.5, vatPercentage: 4, isActive: true });
  });

  it("loads pricing, profiles, and readiness once each for multiple services", async () => {
    const profiles = [profile("service-1"), profile("service-2")];
    const { reader, repository, fiscal } = setup(profiles, { "service-1": true, "service-2": true });
    const result = await reader.findForAdditionalServices(tenantId, ["service-1", "service-2", "service-1"]);
    expect(result.size).toBe(2);
    expect(repository.findPricingConfigurationsByCatalogIds).toHaveBeenCalledWith(tenantId, ["service-1", "service-2"]);
    expect(repository.findPricingConfigurationsByCatalogIds).toHaveBeenCalledTimes(1);
    expect(repository.findFiscalProfilesByCatalogIds).toHaveBeenCalledTimes(1);
    expect(fiscal.evaluateFiscalProfiles).toHaveBeenCalledTimes(1);
  });
});
