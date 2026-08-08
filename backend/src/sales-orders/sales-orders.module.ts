import { Module } from "@nestjs/common";
import { SalesOrderConversionService } from "./sales-order-conversion.service";
import { SalesOrdersController } from "./sales-orders.controller";
import { SalesOrdersReadService } from "./sales-orders-read.service";
import {
  SALES_ORDERS_REPOSITORY,
} from "./sales-orders.repository.interface";
import { PrismaSalesOrdersRepository } from "./prisma-sales-orders.repository";

@Module({
  controllers: [SalesOrdersController],
  providers: [
    SalesOrderConversionService,
    SalesOrdersReadService,
    PrismaSalesOrdersRepository,
    {
      provide: SALES_ORDERS_REPOSITORY,
      useExisting: PrismaSalesOrdersRepository,
    },
  ],
  exports: [SalesOrderConversionService],
})
export class SalesOrdersModule {}
