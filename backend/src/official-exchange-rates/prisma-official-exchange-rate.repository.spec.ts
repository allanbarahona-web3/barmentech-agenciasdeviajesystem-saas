import { Prisma } from "@prisma/client";
import { PrismaOfficialExchangeRateRepository } from "./prisma-official-exchange-rate.repository";

describe("PrismaOfficialExchangeRateRepository", () => {
  it("finds the complete global identity with a UTC date and maps exact values", async () => {
    const delegate = { findFirst: jest.fn().mockResolvedValue(row()), create: jest.fn() };
    const repository = new PrismaOfficialExchangeRateRepository({
      officialExchangeRateObservation: delegate,
    } as never);

    const result = await repository.findExact(identity());

    expect(delegate.findFirst).toHaveBeenCalledWith({
      where: {
        ...identity(),
        effectiveDate: new Date("2026-08-22T00:00:00.000Z"),
      },
      select: expect.any(Object),
    });
    expect(result).toMatchObject({ effectiveDate: "2026-08-22", value: "512.5" });
  });

  it("creates Decimal directly from a string and writes no tenant or commercial data", async () => {
    const delegate = { findFirst: jest.fn(), create: jest.fn().mockImplementation(({ data }) => row(data)) };
    const prisma = {
      officialExchangeRateObservation: delegate,
      exchangeRate: { create: jest.fn(), update: jest.fn() },
    };
    const repository = new PrismaOfficialExchangeRateRepository(prisma as never);

    await repository.create({
      ...identity(),
      value: "512.500000000001",
      retrievedAt: new Date("2026-08-22T18:00:00.000Z"),
      sourcePublishedAt: null,
      requestIdentity: "official-fx:v1:BCCR:CR:USD:CRC:REFERENCE_SELL:2026-08-22:318",
      responseHash: "a".repeat(64),
    });

    const data = delegate.create.mock.calls[0][0].data;
    expect(data.value).toBeInstanceOf(Prisma.Decimal);
    expect(data.value.toFixed()).toBe("512.500000000001");
    expect(data.effectiveDate.toISOString()).toBe("2026-08-22T00:00:00.000Z");
    expect(data).not.toHaveProperty("tenantId");
    expect(prisma.exchangeRate.create).not.toHaveBeenCalled();
    expect(prisma.exchangeRate.update).not.toHaveBeenCalled();
    expect(repository).not.toHaveProperty("update");
    expect(repository).not.toHaveProperty("delete");
  });
});

function identity() {
  return {
    countryCode: "CR",
    foreignCurrencyCode: "USD",
    localCurrencyCode: "CRC",
    rateType: "REFERENCE_SELL" as const,
    effectiveDate: "2026-08-22",
    sourceAuthority: "BCCR",
    sourceIndicatorCode: "318",
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "obs-1",
    ...identity(),
    effectiveDate: new Date("2026-08-22T00:00:00.000Z"),
    value: new Prisma.Decimal("512.5"),
    retrievedAt: new Date("2026-08-22T18:00:00.000Z"),
    sourcePublishedAt: null,
    requestIdentity: "official-fx:v1:BCCR:CR:USD:CRC:REFERENCE_SELL:2026-08-22:318",
    responseHash: "a".repeat(64),
    ...overrides,
  };
}
