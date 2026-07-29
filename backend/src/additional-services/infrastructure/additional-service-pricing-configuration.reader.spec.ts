import {
  AdditionalServicePricingConfigurationRecord,
  AdditionalServicesRepository,
} from "../repositories";
import { AdditionalServicePricingConfigurationReader } from "./additional-service-pricing-configuration.reader";

describe("AdditionalServicePricingConfigurationReader", () => {
  it("maps the existing tenant-scoped pricing configuration", async () => {
    const configuration = {
      marginType: "PERCENTAGE",
      marginValue: "12.5000",
      taxPercentage: "13.0000",
      isActive: true,
    } as AdditionalServicePricingConfigurationRecord;
    const repository = {
      findPricingConfigurationByCatalogId: jest
        .fn()
        .mockResolvedValue(configuration),
    } as unknown as jest.Mocked<AdditionalServicesRepository>;
    const reader = new AdditionalServicePricingConfigurationReader(
      repository,
    );

    await expect(
      reader.findForAdditionalService("tenant-1", "service-1"),
    ).resolves.toEqual({
      marginType: "PERCENTAGE",
      marginValue: 12.5,
      vatPercentage: 13,
      isActive: true,
    });
    expect(
      repository.findPricingConfigurationByCatalogId,
    ).toHaveBeenCalledWith("tenant-1", "service-1");
  });

  it("returns null when the additional service has no configuration", async () => {
    const repository = {
      findPricingConfigurationByCatalogId: jest
        .fn()
        .mockResolvedValue(null),
    } as unknown as jest.Mocked<AdditionalServicesRepository>;
    const reader = new AdditionalServicePricingConfigurationReader(
      repository,
    );

    await expect(
      reader.findForAdditionalService("tenant-1", "service-1"),
    ).resolves.toBeNull();
  });

  it("maps multiple configurations with one batched repository read", async () => {
    const repository = {
      findPricingConfigurationsByCatalogIds: jest.fn().mockResolvedValue([
        {
          additionalServiceCatalogId: "service-1",
          marginType: "PERCENTAGE",
          marginValue: "10.0000",
          taxPercentage: "13.0000",
          isActive: true,
        },
        {
          additionalServiceCatalogId: "service-2",
          marginType: "FIXED",
          marginValue: "15.0000",
          taxPercentage: "13.0000",
          isActive: true,
        },
      ]),
    } as unknown as jest.Mocked<AdditionalServicesRepository>;
    const reader = new AdditionalServicePricingConfigurationReader(
      repository,
    );

    const configurations = await reader.findForAdditionalServices(
      "tenant-1",
      ["service-1", "service-2"],
    );

    expect(configurations.get("service-1")).toEqual({
      marginType: "PERCENTAGE",
      marginValue: 10,
      vatPercentage: 13,
      isActive: true,
    });
    expect(configurations.get("service-2")).toEqual({
      marginType: "FIXED",
      marginValue: 15,
      vatPercentage: 13,
      isActive: true,
    });
    expect(
      repository.findPricingConfigurationsByCatalogIds,
    ).toHaveBeenCalledTimes(1);
  });
});
