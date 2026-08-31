import { Module } from "@nestjs/common";
import { PrismaTerritorialCatalogRepository } from "./prisma-territorial-catalog.repository";
import { TerritorialCatalogController } from "./territorial-catalog.controller";
import { TERRITORIAL_CATALOG_REPOSITORY } from "./territorial-catalog.repository";
import { TerritorialCatalogService } from "./territorial-catalog.service";

@Module({
  controllers: [TerritorialCatalogController],
  providers: [
    TerritorialCatalogService,
    PrismaTerritorialCatalogRepository,
    { provide: TERRITORIAL_CATALOG_REPOSITORY, useExisting: PrismaTerritorialCatalogRepository },
  ],
})
export class TerritorialCatalogModule {}
