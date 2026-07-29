import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { PricingEngineService } from "../../pricing-engine";
import { PrismaModule } from "../../prisma/prisma.module";
import { AdditionalServicesPricingEngineModule } from "./additional-services-pricing-engine.module";

describe("AdditionalServicesPricingEngineModule", () => {
  it("exports the configured pricing engine to the workflow", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AdditionalServicesPricingEngineModule,
      ],
    }).compile();

    expect(moduleRef.get(PricingEngineService)).toBeInstanceOf(
      PricingEngineService,
    );

    await moduleRef.close();
  });
});
