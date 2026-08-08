import { Module } from "@nestjs/common";
import { SalesOrderConversionService } from "./sales-order-conversion.service";

@Module({
  providers: [SalesOrderConversionService],
  exports: [SalesOrderConversionService],
})
export class SalesOrdersModule {}
