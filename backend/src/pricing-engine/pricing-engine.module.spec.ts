import { Test } from "@nestjs/testing";
import { PRICING_CONFIGURATION_READER } from "./pricing-configuration-reader.interface";
import { EXCHANGE_RATE_READER } from "./exchange-rate-reader.interface";
import { PricingEngineModule } from "./pricing-engine.module";
import { PricingEngineService } from "./pricing-engine.service";

describe("PricingEngineModule", () => {
  it("registers independently with any reader-port implementation", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PricingEngineModule.register({
          configurationReaderProvider: {
            provide: PRICING_CONFIGURATION_READER,
            useValue: {
              findForAdditionalService: jest.fn(),
              findForAdditionalServices: jest.fn(),
            },
          },
          exchangeRateReaderProvider: {
            provide: EXCHANGE_RATE_READER,
            useValue: {
              findCurrent: jest.fn(),
            },
          },
        }),
      ],
    }).compile();

    expect(moduleRef.get(PricingEngineService)).toBeInstanceOf(
      PricingEngineService,
    );

    await moduleRef.close();
  });
});
