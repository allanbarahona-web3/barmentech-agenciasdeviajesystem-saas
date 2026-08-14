import {
  Inject,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import { FiscalCatalogService } from "../../fiscal-catalogs/fiscal-catalog.service";
import {
  PricingConfiguration,
  PricingConfigurationReader,
} from "../../pricing-engine";
import {
  ADDITIONAL_SERVICES_REPOSITORY,
  AdditionalServiceFiscalProfileRecord,
  AdditionalServicePricingConfigurationRecord,
  AdditionalServicesRepository,
} from "../repositories";

@Injectable()
export class AdditionalServicePricingConfigurationReader
  implements PricingConfigurationReader
{
  constructor(
    @Inject(ADDITIONAL_SERVICES_REPOSITORY)
    private readonly additionalServicesRepository: AdditionalServicesRepository,
    private readonly fiscalCatalogService: FiscalCatalogService,
  ) {}

  async findForAdditionalService(
    tenantId: string,
    additionalServiceId: string,
  ): Promise<PricingConfiguration | null> {
    const [configuration, profiles] = await Promise.all([
      this.additionalServicesRepository.findPricingConfigurationByCatalogId(
        tenantId,
        additionalServiceId,
      ),
      this.additionalServicesRepository.findFiscalProfilesByCatalogIds(
        tenantId,
        [additionalServiceId],
      ),
    ]);

    if (!configuration) return null;

    const readiness = await this.fiscalCatalogService.evaluateFiscalProfiles(
      tenantId,
      profiles,
    );
    const profile = profiles.find(
      (candidate) =>
        candidate.additionalServiceCatalogId === additionalServiceId,
    );
    this.requireReady(additionalServiceId, profile, readiness);
    return this.toPricingConfiguration(configuration, profile);
  }

  async findForAdditionalServices(
    tenantId: string,
    additionalServiceIds: string[],
  ): Promise<Map<string, PricingConfiguration>> {
    const uniqueIds = [...new Set(additionalServiceIds)];
    const [configurations, profiles] = await Promise.all([
      this.additionalServicesRepository.findPricingConfigurationsByCatalogIds(
        tenantId,
        uniqueIds,
      ),
      this.additionalServicesRepository.findFiscalProfilesByCatalogIds(
        tenantId,
        uniqueIds,
      ),
    ]);
    const readiness = await this.fiscalCatalogService.evaluateFiscalProfiles(
      tenantId,
      profiles,
    );
    const profileByCatalogId = new Map(
      profiles.map((profile) => [profile.additionalServiceCatalogId, profile]),
    );

    return new Map(
      configurations.map((configuration) => {
        const catalogId = configuration.additionalServiceCatalogId;
        const profile = profileByCatalogId.get(catalogId);
        this.requireReady(catalogId, profile, readiness);
        return [
          catalogId,
          this.toPricingConfiguration(configuration, profile),
        ];
      }),
    );
  }

  private requireReady(
    catalogId: string,
    profile: AdditionalServiceFiscalProfileRecord | undefined,
    readiness: Map<string, { isReady: boolean }>,
  ): asserts profile is AdditionalServiceFiscalProfileRecord {
    if (!profile || !readiness.get(catalogId)?.isReady) {
      throw new UnprocessableEntityException({
        code: "ADDITIONAL_SERVICE_NOT_FISCALLY_READY",
      });
    }
  }

  private toPricingConfiguration(
    configuration: AdditionalServicePricingConfigurationRecord,
    profile: AdditionalServiceFiscalProfileRecord,
  ): PricingConfiguration {
    return {
      marginType: configuration.marginType,
      marginValue: Number(configuration.marginValue),
      vatPercentage: Number(profile.taxPercentage),
      isActive: configuration.isActive,
    };
  }
}
