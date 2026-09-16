import { ExchangeRateController } from "./exchange-rate.controller";
import { ExchangeRateService } from "./exchange-rate.service";
import { ROLES_KEY } from "../auth/roles.decorator";

describe("ExchangeRateController official history", () => {
  it("exposes only the existing persisted-observation history read", async () => {
    const service = {
      getOfficialExchangeRateHistoryRange: jest.fn().mockResolvedValue([{ id: "official-a" }]),
    };
    const controller = new ExchangeRateController(service as unknown as ExchangeRateService, {} as never);

    await expect(controller.getOfficialHistoryRange("2026-09-01", "2026-09-12")).resolves.toEqual({
      rates: [{ id: "official-a" }],
    });
    expect(service.getOfficialExchangeRateHistoryRange).toHaveBeenCalledWith("2026-09-01", "2026-09-12");
  });

  it("keeps the current route and delegates source selection to the shared resolver", async () => {
    const currentResolver = { resolveCurrentExchangeRate: jest.fn().mockResolvedValue({ rate: null, status: "MISSING" }) };
    const controller = new ExchangeRateController({} as ExchangeRateService, currentResolver as never);

    await expect(controller.getCurrentRate({ user: { tenantId: "tenant-a" } })).resolves.toEqual({ rate: null, status: "MISSING" });
    expect(currentResolver.resolveCurrentExchangeRate).toHaveBeenCalledWith("tenant-a");
  });

  it("exposes the shared history report projection", async () => {
    const service = { getHistoryReportRange: jest.fn().mockResolvedValue([{ source: "BCCR" }]) };
    const controller = new ExchangeRateController(service as unknown as ExchangeRateService, {} as never);

    await expect(controller.getHistoryReportRange("2026-09-01", "2026-09-12", { user: { tenantId: "tenant-a" } })).resolves.toEqual({ rates: [{ source: "BCCR" }] });
    expect(service.getHistoryReportRange).toHaveBeenCalledWith("tenant-a", "2026-09-01", "2026-09-12");
  });

  it("keeps current and history reads authenticated-only while reserving all exchange-rate mutations for ADMIN", async () => {
    const service = {
      getExchangeRateHistory: jest.fn().mockResolvedValue([{ id: "manual-a" }]),
    };
    const controller = new ExchangeRateController(service as unknown as ExchangeRateService, {} as never);

    await expect(controller.getHistory({ user: { tenantId: "tenant-a" } }, "30")).resolves.toEqual({ rates: [{ id: "manual-a" }] });
    expect(service.getExchangeRateHistory).toHaveBeenCalledWith("tenant-a", 30);
    expect(Reflect.getMetadata(ROLES_KEY, ExchangeRateController.prototype.getCurrentRate)).toBeUndefined();
    expect(Reflect.getMetadata(ROLES_KEY, ExchangeRateController.prototype.getHistory)).toBeUndefined();
    expect(Reflect.getMetadata(ROLES_KEY, ExchangeRateController.prototype.setRate)).toEqual(["ADMIN"]);
    expect(Reflect.getMetadata(ROLES_KEY, ExchangeRateController.prototype.emailHistory)).toEqual(["ADMIN", "FACTURACION_COBROS"]);
  });
});
