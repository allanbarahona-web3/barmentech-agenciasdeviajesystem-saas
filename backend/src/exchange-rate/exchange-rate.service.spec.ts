import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ExchangeRateService } from "./exchange-rate.service";

describe("ExchangeRateService official observation history", () => {
  it("reads persisted BCCR USD/CRC observations without a tenant filter or provider call", async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: "official-a",
        effectiveDate: new Date("2026-09-12T00:00:00.000Z"),
        rateType: "REFERENCE_SELL",
        value: new Prisma.Decimal("503.123400"),
        sourceAuthority: "BCCR",
        sourceIndicatorCode: "318",
        retrievedAt: new Date("2026-09-12T12:00:00.000Z"),
        sourcePublishedAt: null,
      },
    ]);
    const service = new ExchangeRateService(
      { officialExchangeRateObservation: { findMany } } as unknown as PrismaService,
      {} as never,
      {} as never,
    );

    await expect(service.getOfficialExchangeRateHistoryRange("2026-09-01", "2026-09-12")).resolves.toEqual([
      {
        id: "official-a",
        effectiveDate: "2026-09-12",
        rateType: "REFERENCE_SELL",
        value: "503.1234",
        sourceAuthority: "BCCR",
        sourceIndicatorCode: "318",
        retrievedAt: new Date("2026-09-12T12:00:00.000Z"),
        sourcePublishedAt: null,
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        countryCode: "CR",
        foreignCurrencyCode: "USD",
        localCurrencyCode: "CRC",
        sourceAuthority: "BCCR",
        effectiveDate: {
          gte: new Date("2026-09-01T00:00:00.000Z"),
          lte: new Date("2026-09-12T00:00:00.000Z"),
        },
      }),
      orderBy: [{ effectiveDate: "desc" }, { rateType: "asc" }],
    }));
  });

  it("groups BCCR buy and sell observations by effective date without merging persistence", async () => {
    const findMany = jest.fn().mockResolvedValue([
      officialRow("REFERENCE_BUY", "317", "501.1000"),
      officialRow("REFERENCE_SELL", "318", "503.2000"),
    ]);
    const manualFindMany = jest.fn().mockResolvedValue([
      { id: "manual-a", date: new Date("2026-09-12T00:00:00.000Z"), buyRate: new Prisma.Decimal("499"), sellRate: new Prisma.Decimal("500"), source: "MANUAL", setByName: "Admin", notes: null, createdAt: new Date("2026-09-12T08:00:00.000Z"), updatedAt: new Date() },
    ]);
    const service = new ExchangeRateService(
      { officialExchangeRateObservation: { findMany }, exchangeRate: { findMany: manualFindMany } } as unknown as PrismaService,
      {} as never,
      {} as never,
    );

    await expect(service.getHistoryReportRange("tenant-a", "2026-09-01", "2026-09-12")).resolves.toEqual([
      expect.objectContaining({ date: "2026-09-12", source: "BCCR", buyRate: 501.1, sellRate: 503.2 }),
      expect.objectContaining({ date: "2026-09-12", source: "MANUAL", buyRate: 499, sellRate: 500 }),
    ]);
  });

  it("uses the shared report projection for PDF and email history", async () => {
    const emailService = { sendEmail: jest.fn().mockResolvedValue({ success: true, emailId: "email-a" }) };
    const service = new ExchangeRateService(
      {} as PrismaService,
      { getTenantConfig: jest.fn().mockResolvedValue({ name: "Agencia" }) } as never,
      emailService as never,
    );
    const report = jest.spyOn(service, "getHistoryReportRange").mockResolvedValue([
      { date: "2026-09-12", source: "MANUAL", buyRate: 500, sellRate: 503, registeredAt: new Date("2026-09-12T08:00:00.000Z") },
      { date: "2026-09-12", source: "BCCR", buyRate: 501, sellRate: 504, registeredAt: new Date("2026-09-12T09:00:00.000Z") },
    ]);

    await expect(service.generateHistoryPdf("tenant-a", "2026-09-01", "2026-09-12")).resolves.toBeInstanceOf(Buffer);
    expect(report).toHaveBeenCalledWith("tenant-a", "2026-09-01", "2026-09-12");

    report.mockClear();
    await service.sendHistoryEmail("tenant-a", "2026-09-01", "2026-09-12", "a@example.com", "Admin");
    expect(emailService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ templateData: expect.objectContaining({ totalRecords: 2 }) }));
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith("tenant-a", "2026-09-01", "2026-09-12");
  });
});

function officialRow(rateType: "REFERENCE_BUY" | "REFERENCE_SELL", sourceIndicatorCode: string, value: string) {
  return { id: rateType, effectiveDate: new Date("2026-09-12T00:00:00.000Z"), rateType, value: new Prisma.Decimal(value), sourceAuthority: "BCCR", sourceIndicatorCode, retrievedAt: new Date("2026-09-12T12:00:00.000Z"), sourcePublishedAt: null };
}
