import "reflect-metadata";
import { ROLES_KEY } from "../auth/roles.decorator";
import { AdditionalServicesPricingController } from "./additional-services-pricing.controller";
import { AdditionalServicesPricingService } from "./additional-services-pricing.service";

describe("AdditionalServicesPricingController batch endpoint", () => {
  it("uses the authenticated tenant and the same roles as single pricing", async () => {
    const pricingService = {
      calculateMany: jest.fn().mockResolvedValue([]),
    } as unknown as AdditionalServicesPricingService;
    const controller = new AdditionalServicesPricingController(pricingService);
    const input = {
      lines: [{
        lineId: "line-1",
        serviceCode: "TOUR",
        supplierCost: 10,
        costCurrency: "USD" as const,
        quotationCurrency: "USD" as const,
      }],
    };

    await expect(
      controller.calculateMany({ user: { tenantId: "tenant-1" } }, input),
    ).resolves.toEqual([]);
    expect(pricingService.calculateMany).toHaveBeenCalledWith(
      "tenant-1",
      input.lines,
    );
    expect(
      Reflect.getMetadata(ROLES_KEY, AdditionalServicesPricingController),
    ).toEqual(["ADMIN", "AGENT", "OPERACIONES"]);
  });
});
