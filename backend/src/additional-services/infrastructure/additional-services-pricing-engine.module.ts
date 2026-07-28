import { Module } from "@nestjs/common";
import {
  PRICING_CONFIGURATION_READER,
  PricingEngineModule,
} from "../../pricing-engine";
import { AdditionalServicePricingConfigurationReader } from "./additional-service-pricing-configuration.reader";
import { AdditionalServicesPersistenceModule } from "./additional-services-persistence.module";

@Module({
  imports: [
    PricingEngineModule.register({
      imports: [AdditionalServicesPersistenceModule],
      configurationReaderProvider: {
        provide: PRICING_CONFIGURATION_READER,
        useClass: AdditionalServicePricingConfigurationReader,
      },
    }),
  ],
  exports: [PricingEngineModule],
})
export class AdditionalServicesPricingEngineModule {}
