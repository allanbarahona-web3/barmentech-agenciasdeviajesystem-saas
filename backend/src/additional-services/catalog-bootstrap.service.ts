import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from "@nestjs/common";
import { TECHNICAL_ADDITIONAL_SERVICE_CATALOG } from "./constants/technical-additional-service-catalog.constant";
import {
  ADDITIONAL_SERVICES_REPOSITORY,
  AdditionalServicesRepository,
} from "./repositories";

@Injectable()
export class CatalogBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CatalogBootstrapService.name);

  constructor(
    @Inject(ADDITIONAL_SERVICES_REPOSITORY)
    private readonly repository: AdditionalServicesRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.bootstrapExistingTenants();
  }

  async bootstrapExistingTenants(): Promise<number> {
    const tenantIds = await this.repository.findAllTenantIds();
    const insertedCounts = await Promise.all(
      tenantIds.map((tenantId) => this.bootstrapTenant(tenantId)),
    );

    const totalInserted = insertedCounts.reduce(
      (total, count) => total + count,
      0,
    );

    this.logger.log(
      `Technical additional-service catalog bootstrap complete: ${totalInserted} item(s) inserted across ${tenantIds.length} tenant(s).`,
    );

    return totalInserted;
  }

  async bootstrapTenant(tenantId: string): Promise<number> {
    const existingCodes = new Set(
      await this.repository.findAdditionalServiceCatalogCodes(tenantId),
    );
    const missingItems = TECHNICAL_ADDITIONAL_SERVICE_CATALOG.filter(
      (item) => !existingCodes.has(item.code),
    );

    if (missingItems.length === 0) {
      return 0;
    }

    return this.repository.createAdditionalServiceCatalogItems(
      tenantId,
      missingItems,
    );
  }
}
