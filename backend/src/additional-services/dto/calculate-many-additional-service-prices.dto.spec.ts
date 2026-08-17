import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  CalculateManyAdditionalServicePricesDto,
  MAX_ADDITIONAL_SERVICE_PRICING_BATCH_LINES,
} from "./calculate-many-additional-service-prices.dto";

const line = {
  lineId: "line-1",
  serviceCode: "TOUR",
  supplierCost: 10,
  costCurrency: "USD",
  quotationCurrency: "USD",
};

describe("CalculateManyAdditionalServicePricesDto", () => {
  it("rejects an empty batch", async () => {
    const errors = await validate(
      plainToInstance(CalculateManyAdditionalServicePricesDto, { lines: [] }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it("rejects a batch above the bounded maximum", async () => {
    const errors = await validate(
      plainToInstance(CalculateManyAdditionalServicePricesDto, {
        lines: Array.from(
          { length: MAX_ADDITIONAL_SERVICE_PRICING_BATCH_LINES + 1 },
          (_, index) => ({ ...line, lineId: `line-${index}` }),
        ),
      }),
    );
    expect(errors).not.toHaveLength(0);
  });
});
