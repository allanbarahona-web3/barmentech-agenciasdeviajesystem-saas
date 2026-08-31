import {
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  PricingBreakdown,
  PricingEngineService,
} from "../pricing-engine";
import { CalculateAdditionalServicePriceDto } from "./dto";
import { CalculateAdditionalServicePriceBatchLineDto } from "./dto";
import {
  ADDITIONAL_SERVICES_REPOSITORY,
  AdditionalServicesRepository,
} from "./repositories";

@Injectable()
export class AdditionalServicesPricingService {
  constructor(
    @Inject(ADDITIONAL_SERVICES_REPOSITORY)
    private readonly repository: AdditionalServicesRepository,
    private readonly pricingEngine: PricingEngineService,
  ) {}

  async calculate(
    tenantId: string,
    input: CalculateAdditionalServicePriceDto,
  ): Promise<PricingBreakdown> {
    const serviceCode = input.serviceCode.trim().toUpperCase();
    const catalog =
      await this.repository.findAdditionalServiceCatalogByCode(
        tenantId,
        serviceCode,
      );

    if (!catalog?.isActive) {
      throw new NotFoundException(
        `Additional service code ${serviceCode} could not be resolved.`,
      );
    }

    return this.pricingEngine.calculate({
      tenantId,
      additionalServiceId: catalog.id,
      supplierCost: input.supplierCost,
      costCurrency: input.costCurrency,
      quotationCurrency: input.quotationCurrency,
    });
  }

  async calculateMany(
    tenantId: string,
    inputs: CalculateAdditionalServicePriceBatchLineDto[],
  ): Promise<Array<{ lineId: string; breakdown: PricingBreakdown }>> {
    const serviceCodes = inputs.map((input) =>
      input.serviceCode.trim().toUpperCase(),
    );
    const catalogs =
      await this.repository.findAdditionalServiceCatalogsByCodes(
        tenantId,
        [...new Set(serviceCodes)],
      );
    const catalogByCode = new Map(
      catalogs.map((catalog) => [catalog.code, catalog]),
    );

    const resolved = inputs.map((input, index) => {
      const serviceCode = serviceCodes[index];
      const catalog = catalogByCode.get(serviceCode);
      if (!catalog?.isActive) {
        throw new NotFoundException(
          `Additional service code ${serviceCode} could not be resolved.`,
        );
      }
      return { input, catalog };
    });

    const breakdowns = await this.pricingEngine.calculateMany(
      resolved.map(({ input, catalog }) => ({
        tenantId,
        additionalServiceId: catalog.id,
        supplierCost: input.supplierCost,
        costCurrency: input.costCurrency,
        quotationCurrency: input.quotationCurrency,
      })),
    );
    return inputs.map((input, index) => ({
      lineId: input.lineId,
      breakdown: breakdowns[index],
    }));
  }
}
