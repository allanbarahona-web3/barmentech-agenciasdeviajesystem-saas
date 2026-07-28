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
    });
  }
}
