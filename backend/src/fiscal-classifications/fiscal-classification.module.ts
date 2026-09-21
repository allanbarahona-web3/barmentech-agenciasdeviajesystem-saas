import { Module } from "@nestjs/common";
import { FiscalCatalogModule } from "../fiscal-catalogs/fiscal-catalog.module";
import { FiscalClassificationController } from "./fiscal-classification.controller";
import { FiscalClassificationService } from "./fiscal-classification.service";

@Module({
  imports: [FiscalCatalogModule],
  controllers: [FiscalClassificationController],
  providers: [FiscalClassificationService],
  exports: [FiscalClassificationService],
})
export class FiscalClassificationModule {}
