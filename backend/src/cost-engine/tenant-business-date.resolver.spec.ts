import { Test } from "@nestjs/testing";
import { TenantBusinessDateResolver } from "./tenant-business-date.resolver";

describe("TenantBusinessDateResolver", () => {
  it("is created by Nest without a Function provider", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TenantBusinessDateResolver],
    }).compile();

    expect(moduleRef.get(TenantBusinessDateResolver)).toBeInstanceOf(TenantBusinessDateResolver);
    await moduleRef.close();
  });

  it("uses the configured fiscal timezone with a supplied deterministic instant", async () => {
    const resolver = new TenantBusinessDateResolver();
    const tx = timezoneTransaction("America/Los_Angeles");

    const result = await resolver.resolve(tx, "tenant-a", new Date("2026-01-02T02:00:00.000Z"));

    expect(result.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(tx.tenantBillingConfiguration.findUnique).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a" },
      select: { fiscalTimezone: true },
    });
  });

  it("uses the Costa Rica fallback instead of the UTC calendar date when timezone configuration is absent", async () => {
    const resolver = new TenantBusinessDateResolver();

    const result = await resolver.resolve(timezoneTransaction(null), "tenant-a", new Date("2026-01-02T03:00:00.000Z"));

    expect(result.toISOString().slice(0, 10)).toBe("2026-01-01");
  });
});

function timezoneTransaction(fiscalTimezone: string | null) {
  return {
    tenantBillingConfiguration: {
      findUnique: jest.fn().mockResolvedValue(fiscalTimezone ? { fiscalTimezone } : null),
    },
  };
}
