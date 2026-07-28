import {
  DynamicModule,
  Module,
  ModuleMetadata,
  Provider,
} from "@nestjs/common";
import { PricingConfigurationReader } from "./pricing-configuration-reader.interface";
import { PricingEngineService } from "./pricing-engine.service";

export interface PricingEngineModuleOptions {
  imports?: ModuleMetadata["imports"];
  configurationReaderProvider: Provider<PricingConfigurationReader>;
}

@Module({})
export class PricingEngineModule {
  static register(options: PricingEngineModuleOptions): DynamicModule {
    return {
      module: PricingEngineModule,
      imports: options.imports ?? [],
      providers: [
        options.configurationReaderProvider,
        PricingEngineService,
      ],
      exports: [PricingEngineService],
    };
  }
}
