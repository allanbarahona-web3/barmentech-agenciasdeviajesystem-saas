import { Module } from "@nestjs/common";
import { CABYS_CATALOG_PROVIDER } from "./cabys-catalog.provider";
import { FacturaEnCrCabysProvider } from "./factura-en-cr-cabys.provider";
import { FiscalCatalogController } from "./fiscal-catalog.controller";
import { FiscalCatalogService } from "./fiscal-catalog.service";

@Module({
  controllers: [FiscalCatalogController],
  providers: [
    FiscalCatalogService,
    FacturaEnCrCabysProvider,
    { provide: CABYS_CATALOG_PROVIDER, useExisting: FacturaEnCrCabysProvider },
  ],
  exports: [FiscalCatalogService],
})
export class FiscalCatalogModule {}
