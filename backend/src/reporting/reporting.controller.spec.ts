import { ValidationPipe } from "@nestjs/common";
import { PATH_METADATA } from "@nestjs/common/constants";
import { UserRole } from "@prisma/client";
import { ROLES_KEY } from "../auth/roles.decorator";
import { ReportingQueryDto } from "./dto/sales-report-query.dto";
import { ReceivablesReportQueryDto } from "./dto/receivables-report-query.dto";
import { ReportingController } from "./reporting.controller";

describe("ReportingController query validation", () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

  it("accepts Sales periodPreset, page, and pageSize through the shared reporting DTO", async () => {
    const query = await valid({ periodPreset: "CURRENT_MONTH", page: "1", pageSize: "25" });
    const sales = { execute: jest.fn().mockResolvedValue({ reportKey: "SALES" }) };
    const controller = new ReportingController(sales as never, {} as never);
    await expect(controller.salesReport(request(), query)).resolves.toEqual({ reportKey: "SALES" });
    expect(sales.execute).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-a", period: { kind: "CURRENT_MONTH" }, page: 1, pageSize: 25 }));
  });

  it("accepts Sales CUSTOM dateFrom and dateTo", async () => {
    const query = await valid({ periodPreset: "CUSTOM", dateFrom: "2026-02-02", dateTo: "2026-02-11" });
    const sales = { execute: jest.fn().mockResolvedValue({ reportKey: "SALES" }) };
    await new ReportingController(sales as never, {} as never).salesReport(request(), query);
    expect(sales.execute).toHaveBeenCalledWith(expect.objectContaining({ period: { kind: "CUSTOM", startOn: "2026-02-02", endOn: "2026-02-11" } }));
  });

  it("accepts Sales Tax periodPreset, page, and pageSize through the same DTO", async () => {
    const query = await valid({ periodPreset: "PREVIOUS_MONTH", page: "2", pageSize: "25" });
    const salesTax = { execute: jest.fn().mockResolvedValue({ reportKey: "SALES_TAX" }) };
    const controller = new ReportingController({} as never, salesTax as never);
    await expect(controller.salesTaxReport(request(), query)).resolves.toEqual({ reportKey: "SALES_TAX" });
    expect(salesTax.execute).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-a", period: { kind: "PREVIOUS_MONTH" }, page: 2, pageSize: 25 }));
  });

  it("accepts Sales Tax CUSTOM dateFrom and dateTo", async () => {
    const query = await valid({ periodPreset: "CUSTOM", dateFrom: "2026-03-01", dateTo: "2026-03-15" });
    const salesTax = { execute: jest.fn().mockResolvedValue({ reportKey: "SALES_TAX" }) };
    await new ReportingController({} as never, salesTax as never).salesTaxReport(request(), query);
    expect(salesTax.execute).toHaveBeenCalledWith(expect.objectContaining({ period: { kind: "CUSTOM", startOn: "2026-03-01", endOn: "2026-03-15" } }));
  });

  it("accepts and normalizes generic reporting filters without broadening unknown fields", async () => {
    const query = await valid({ periodPreset: "CURRENT_MONTH", saleCondition: "CREDIT", currencyCode: "usd", taxCode: "01", rateCode: "03", rate: "2" });
    const sales = { execute: jest.fn().mockResolvedValue({ reportKey: "SALES" }) };
    await new ReportingController(sales as never, {} as never).salesReport(request(), query);
    expect(sales.execute).toHaveBeenCalledWith(expect.objectContaining({ filter: { saleCondition: "CREDIT", currencyCode: "USD", taxCode: "01", rateCode: "03", rate: "2" } }));
  });

  it("accepts CRC projection and rejects unknown projection modes through the shared DTO", async () => {
    const query = await valid({ projectionMode: "CRC" });
    const sales = { execute: jest.fn().mockResolvedValue({ reportKey: "SALES" }) };
    await new ReportingController(sales as never, {} as never).salesReport(request(), query);
    expect(sales.execute).toHaveBeenCalledWith(expect.objectContaining({ projection: { mode: "TARGET_CURRENCY", targetCurrencyCode: "CRC" } }));
    await expect(valid({ projectionMode: "USD" })).rejects.toBeDefined();
  });

  it("keeps whitelist rejection for unknown query fields", async () => {
    await expect(valid({ periodPreset: "CURRENT_MONTH", page: "1", pageSize: "25", tenantId: "tenant-b" })).rejects.toMatchObject({
      response: expect.objectContaining({ message: expect.arrayContaining([expect.stringContaining("tenantId should not exist")]) }),
    });
  });

  it("accepts the strict Receivables due-date query contract and preserves its server-side filters", async () => {
    const query = await receivablesValid({ dueDatePreset: "CUSTOM", dateFrom: "2026-09-01", dateTo: "2026-09-30", customerSearch: "Ana", currencyCode: "usd", category: "PROJECTED_RECEIVABLE", timing: "FUTURE", page: "2", pageSize: "25" });
    const receivables = { execute: jest.fn().mockResolvedValue({ reportKey: "RECEIVABLES" }) };
    const controller = new ReportingController({} as never, {} as never, {} as never, receivables as never);
    await expect(controller.receivablesReport(request(), query)).resolves.toEqual({ reportKey: "RECEIVABLES" });
    expect(receivables.execute).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-a", dueDate: { preset: "CUSTOM", dateFrom: "2026-09-01", dateTo: "2026-09-30" }, page: 2, pageSize: 25, filter: { customerSearch: "Ana", currencyCode: "USD", category: "PROJECTED_RECEIVABLE", timing: "FUTURE" } }));
    await expect(receivablesValid({ tenantId: "tenant-b" })).rejects.toBeDefined();
    await expect(receivablesValid({ periodPreset: "TODAY" })).rejects.toBeDefined();
    await expect(receivablesValid({ projectionHorizonMonths: "12" })).rejects.toBeDefined();
  });

  it("defaults Receivables to the complete ALL portfolio", async () => {
    const receivables = { execute: jest.fn().mockResolvedValue({ reportKey: "RECEIVABLES" }) };
    const controller = new ReportingController({} as never, {} as never, {} as never, receivables as never);
    await controller.receivablesReport(request(), await receivablesValid({}));
    expect(receivables.execute).toHaveBeenCalledWith(expect.objectContaining({ dueDate: { preset: "ALL" } }));
  });

  it("keeps Receivables reads and exports restricted to ADMIN and CONTADOR", () => {
    for (const handler of [ReportingController.prototype.salesReport, ReportingController.prototype.salesTaxReport, ReportingController.prototype.receivablesReport, ReportingController.prototype.exportReceivables]) {
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([UserRole.ADMIN, UserRole.CONTADOR]);
    }
    expect(Reflect.getMetadata(PATH_METADATA, ReportingController.prototype.salesReport)).toBe("sales");
    expect(Reflect.getMetadata(PATH_METADATA, ReportingController.prototype.salesTaxReport)).toBe("sales-tax");
    expect(Reflect.getMetadata(PATH_METADATA, ReportingController.prototype.receivablesReport)).toBe("receivables");
    expect(Reflect.getMetadata(PATH_METADATA, ReportingController.prototype.exportReceivables)).toBe("receivables/export");
  });

  function valid(value: Record<string, string>) {
    return pipe.transform(value, { type: "query", metatype: ReportingQueryDto });
  }

  function receivablesValid(value: Record<string, string>) {
    return pipe.transform(value, { type: "query", metatype: ReceivablesReportQueryDto });
  }

  function request() {
    return { user: { id: "user-a", tenantId: "tenant-a", role: UserRole.ADMIN } };
  }
});
