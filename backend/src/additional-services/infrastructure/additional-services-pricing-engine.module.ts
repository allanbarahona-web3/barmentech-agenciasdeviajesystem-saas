import { Module } from "@nestjs/common";
import {
  EXCHANGE_RATE_READER,
  PRICING_CONFIGURATION_READER,
  PricingEngineModule,
} from "../../pricing-engine";
import { AdditionalServicePricingConfigurationReader } from "./additional-service-pricing-configuration.reader";
import { AdditionalServicesPersistenceModule } from "./additional-services-persistence.module";
import { ExchangeRateModule } from "../../exchange-rate/exchange-rate.module";
import { CurrentExchangeRateReader } from "./current-exchange-rate.reader";

@Module({
  imports: [
    PricingEngineModule.register({
      imports: [AdditionalServicesPersistenceModule, ExchangeRateModule],
      configurationReaderProvider: {
        provide: PRICING_CONFIGURATION_READER,
        useClass: AdditionalServicePricingConfigurationReader,
      },
      exchangeRateReaderProvider: {
        provide: EXCHANGE_RATE_READER,
        useClass: CurrentExchangeRateReader,
      },
    }),
  ],
  exports: [PricingEngineModule],
})
export class AdditionalServicesPricingEngineModule {}
