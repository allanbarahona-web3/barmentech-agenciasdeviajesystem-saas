import { Inject, Injectable } from "@nestjs/common";
import {
  ADDITIONAL_SERVICES_REPOSITORY,
  AdditionalServicesRepository,
} from "../repositories";
import {
  PricingConfiguration,
  PricingConfigurationReader,
} from "../../pricing-engine";

@Injectable()
export class AdditionalServicePricingConfigurationReader
  implements PricingConfigurationReader
{
  constructor(
    @Inject(ADDITIONAL_SERVICES_REPOSITORY)
    private readonly additionalServicesRepository: AdditionalServicesRepository,
  ) {}

  async findForAdditionalService(
    tenantId: string,
    additionalServiceId: string,
  ): Promise<PricingConfiguration | null> {
    const configuration =
      await this.additionalServicesRepository.findPricingConfigurationByCatalogId(
        tenantId,
        additionalServiceId,
      );

    if (!configuration) {
      return null;
    }

    return {
      marginType: configuration.marginType,
      marginValue: Number(configuration.marginValue),
      vatPercentage: Number(configuration.taxPercentage),
      isActive: configuration.isActive,
    };
  }

  async findForAdditionalServices(
    tenantId: string,
    additionalServiceIds: string[],
  ): Promise<Map<string, PricingConfiguration>> {
    const configurations =
      await this.additionalServicesRepository.findPricingConfigurationsByCatalogIds(
        tenantId,
        additionalServiceIds,
      );

    return new Map(
      configurations.map((configuration) => [
        configuration.additionalServiceCatalogId,
        {
          marginType: configuration.marginType,
          marginValue: Number(configuration.marginValue),
          vatPercentage: Number(configuration.taxPercentage),
          isActive: configuration.isActive,
        },
      ]),
    );
  }
}
