import { BusinessNumberingService } from "./business-numbering.service";

describe("BusinessNumberingService", () => {
  it("atomically creates or advances only the requested tenant/key/year scope", async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ currentValue: 11n }]);
    const service = new BusinessNumberingService();

    await expect(service.next({ $queryRaw: queryRaw } as never, {
      tenantId: "tenant-a", sequenceKey: "EXAMPLE", year: 2026,
    })).resolves.toBe(11n);

    const [sql, tenantId, sequenceKey, year] = queryRaw.mock.calls[0];
    expect((sql as TemplateStringsArray).join("?")).toContain('ON CONFLICT ("tenantId", "sequenceKey", "year")');
    expect((sql as TemplateStringsArray).join("?")).toContain('"currentValue" = "business_number_sequences"."currentValue" + 1');
    expect([tenantId, sequenceKey, year]).toEqual(["tenant-a", "EXAMPLE", 2026]);
  });

  it("keeps tenant and year scopes independent in the atomic statement", async () => {
    const queryRaw = jest.fn()
      .mockResolvedValueOnce([{ currentValue: 1n }])
      .mockResolvedValueOnce([{ currentValue: 1n }]);
    const service = new BusinessNumberingService();

    await service.next({ $queryRaw: queryRaw } as never, { tenantId: "tenant-a", sequenceKey: "EXAMPLE", year: 2026 });
    await service.next({ $queryRaw: queryRaw } as never, { tenantId: "tenant-b", sequenceKey: "EXAMPLE", year: 2027 });

    expect(queryRaw.mock.calls.map(([, tenantId, sequenceKey, year]) => ({ tenantId, sequenceKey, year }))).toEqual([
      { tenantId: "tenant-a", sequenceKey: "EXAMPLE", year: 2026 },
      { tenantId: "tenant-b", sequenceKey: "EXAMPLE", year: 2027 },
    ]);
  });
});
