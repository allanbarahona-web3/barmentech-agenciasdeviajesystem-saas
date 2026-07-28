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
});
