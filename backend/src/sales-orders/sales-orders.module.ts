import { Module } from "@nestjs/common";
import { SalesOrderConversionService } from "./sales-order-conversion.service";
import { SalesOrdersController } from "./sales-orders.controller";
import { SalesOrdersReadService } from "./sales-orders-read.service";
import {
  SALES_ORDERS_REPOSITORY,
} from "./sales-orders.repository.interface";
import { PrismaSalesOrdersRepository } from "./prisma-sales-orders.repository";
import { FiscalCatalogModule } from "../fiscal-catalogs/fiscal-catalog.module";
import { SalesOrderFiscalSnapshotMaterializationService } from "./sales-order-fiscal-snapshot-materialization.service";
import { SalesOrderSourceMaterializationService } from "./sales-order-source-materialization.service";

@Module({
  imports: [FiscalCatalogModule],
  controllers: [SalesOrdersController],
  providers: [
    SalesOrderConversionService,
    SalesOrderFiscalSnapshotMaterializationService,
    SalesOrderSourceMaterializationService,
    SalesOrdersReadService,
    PrismaSalesOrdersRepository,
    {
      provide: SALES_ORDERS_REPOSITORY,
      useExisting: PrismaSalesOrdersRepository,
    },
  ],
  exports: [
    SalesOrderConversionService,
    SalesOrderFiscalSnapshotMaterializationService,
    SalesOrderSourceMaterializationService,
  ],
})
export class SalesOrdersModule {}
