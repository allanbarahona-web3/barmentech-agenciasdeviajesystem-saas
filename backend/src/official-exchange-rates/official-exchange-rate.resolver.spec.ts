import type { OfficialExchangeRateProvider } from "./official-exchange-rate.provider";
import type {
  CreateOfficialExchangeRateObservation,
  OfficialExchangeRateRepository,
  PersistedOfficialExchangeRateObservation,
} from "./official-exchange-rate.repository";
import {
  buildRequestIdentity,
  buildResponseHash,
  OfficialExchangeRateResolver,
  type ResolveExactOfficialExchangeRateRequest,
} from "./official-exchange-rate.resolver";
import { OfficialExchangeRateResolverError } from "./official-exchange-rate.resolver.errors";

describe("OfficialExchangeRateResolver", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("returns an exact persisted observation without provider call or mutation", async () => {
    const context = setup({ existing: persisted() });

    await expect(context.resolver.resolveExactObservation(request())).resolves.toEqual({
      ...persisted(),
      newlyPersisted: false,
    });
    expect(context.provider.getObservations).not.toHaveBeenCalled();
    expect(context.repository.create).not.toHaveBeenCalled();
    expect(context.repository).not.toHaveProperty("update");
    expect(context.repository).not.toHaveProperty("delete");
  });

  it.each([
    ["REFERENCE_BUY", "317"],
    ["REFERENCE_SELL", "318"],
  ] as const)("requests one exact date and maps %s to %s", async (rateType, indicator) => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-22T18:00:00.000Z"));
    const context = setup({ rateType, indicator });

    const result = await context.resolver.resolveExactObservation(request({ rateType }));

    expect(context.provider.getObservations).toHaveBeenCalledWith({
      countryCode: "CR",
      foreignCurrencyCode: "USD",
      localCurrencyCode: "CRC",
      rateType,
      startDate: "2026-08-22",
      endDate: "2026-08-22",
    });
    expect(context.repository.create).toHaveBeenCalledWith(expect.objectContaining({
      countryCode: "CR",
      foreignCurrencyCode: "USD",
      localCurrencyCode: "CRC",
      rateType,
      effectiveDate: "2026-08-22",
      sourceAuthority: "BCCR",
      sourceIndicatorCode: indicator,
      value: "512.5",
      retrievedAt: new Date("2026-08-22T18:00:00.000Z"),
      sourcePublishedAt: null,
    }));
    expect(result.newlyPersisted).toBe(true);
  });

  it("builds stable separated identities and deterministic value-sensitive hashes", () => {
    const sell = identity();
    const buy = identity({ rateType: "REFERENCE_BUY", sourceIndicatorCode: "317" });
    const nextDate = identity({ effectiveDate: "2026-08-23" });
    expect(buildRequestIdentity(sell)).toBe(
      "official-fx:v1:BCCR:CR:USD:CRC:REFERENCE_SELL:2026-08-22:318",
    );
    expect(buildRequestIdentity(sell)).not.toBe(buildRequestIdentity(buy));
    expect(buildRequestIdentity(sell)).not.toBe(buildRequestIdentity(nextDate));
    expect(buildResponseHash(sell, "512.5")).toMatch(/^[0-9a-f]{64}$/);
    expect(buildResponseHash(sell, "512.5")).toBe(buildResponseHash(sell, "512.5"));
    expect(buildResponseHash(sell, "512.5")).not.toBe(buildResponseHash(sell, "512.6"));
  });

  it("accepts exactly 18 integer and 12 fractional digits without numeric conversion", async () => {
    const value = "123456789012345678.123456789012";
    const context = setup();
    context.provider.getObservations.mockResolvedValueOnce(
      providerResult({ observations: [providerObservation({ value })] }),
    );

    await context.resolver.resolveExactObservation(request());

    expect(context.repository.create).toHaveBeenCalledWith(expect.objectContaining({
      value,
      responseHash: buildResponseHash(identity(), value),
    }));
  });

  it.each([
    ["more than 18 integer digits", "1234567890123456789"],
    ["more than 12 significant fractional digits", "505.1234567890123"],
  ])("rejects %s before persistence", async (_case, value) => {
    const context = setup();
    context.provider.getObservations.mockResolvedValueOnce(
      providerResult({ observations: [providerObservation({ value })] }),
    );

    await expectCode(
      context.resolver.resolveExactObservation(request()),
      "OFFICIAL_EXCHANGE_RATE_PROVIDER_MISMATCH",
    );
    expect(context.repository.create).not.toHaveBeenCalled();
  });

  it.each([
    ["505.810000000000000", "505.81"],
    ["505.000000000000", "505"],
  ])("canonicalizes %s to %s before hashing and persistence", async (source, canonical) => {
    const context = setup();
    context.provider.getObservations.mockResolvedValueOnce(
      providerResult({ observations: [providerObservation({ value: source })] }),
    );

    await context.resolver.resolveExactObservation(request());

    expect(context.repository.create).toHaveBeenCalledWith(expect.objectContaining({
      value: canonical,
      responseHash: buildResponseHash(identity(), canonical),
    }));
  });

  it("returns not available for an empty exact-date result without writing", async () => {
    const context = setup();
    context.provider.getObservations.mockResolvedValueOnce(providerResult({ observations: [] }));
    await expectCode(
      context.resolver.resolveExactObservation(request()),
      "OFFICIAL_EXCHANGE_RATE_NOT_AVAILABLE",
    );
    expect(context.repository.create).not.toHaveBeenCalled();
  });

  it.each([
    ["multiple observations", { observations: [providerObservation(), providerObservation()] }],
    ["wrong authority", { sourceAuthority: "OTHER" }],
    ["wrong country", { countryCode: "PA" }],
    ["wrong foreign currency", { foreignCurrencyCode: "EUR" }],
    ["wrong local currency", { localCurrencyCode: "USD" }],
    ["wrong rate type", { rateType: "REFERENCE_BUY" }],
    ["wrong result indicator", { sourceIndicatorCode: "317" }],
    ["wrong observation indicator", { observations: [providerObservation({ sourceIndicatorCode: "317" })] }],
    ["wrong observation date", { observations: [providerObservation({ effectiveDate: "2026-08-21" })] }],
  ])("rejects provider mismatch: %s", async (_case, override) => {
    const context = setup();
    context.provider.getObservations.mockResolvedValueOnce(providerResult(override as never));
    await expectCode(
      context.resolver.resolveExactObservation(request()),
      "OFFICIAL_EXCHANGE_RATE_PROVIDER_MISMATCH",
    );
    expect(context.repository.create).not.toHaveBeenCalled();
  });

  it.each([
    { countryCode: "cr" },
    { countryCode: "CRI" },
    { foreignCurrencyCode: "usd" },
    { localCurrencyCode: "US1" },
    { foreignCurrencyCode: "CRC" },
    { rateType: "toString" },
    { effectiveDate: "2026-02-30" },
    { effectiveDate: "2026-8-22" },
  ])("rejects invalid runtime request before repository and provider", async (override) => {
    const context = setup();
    await expectCode(
      context.resolver.resolveExactObservation(request(override as never)),
      "OFFICIAL_EXCHANGE_RATE_REQUEST_INVALID",
    );
    expect(context.repository.findExact).not.toHaveBeenCalled();
    expect(context.provider.getObservations).not.toHaveBeenCalled();
  });

  it("recovers an exact P2002 winner without replacing its timestamps", async () => {
    const winner = persisted();
    const context = setup();
    context.repository.create.mockRejectedValueOnce({ code: "P2002" });
    context.repository.findExact.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);

    await expect(context.resolver.resolveExactObservation(request())).resolves.toEqual({
      ...winner,
      newlyPersisted: false,
    });
  });

  it("uses the same canonical value when comparing an exact P2002 winner", async () => {
    const winner = persisted({ value: "505.81" });
    const context = setup();
    context.provider.getObservations.mockResolvedValueOnce(
      providerResult({
        observations: [providerObservation({ value: "505.810000000000000" })],
      }),
    );
    context.repository.create.mockRejectedValueOnce({ code: "P2002" });
    context.repository.findExact.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);

    await expect(context.resolver.resolveExactObservation(request())).resolves.toEqual({
      ...winner,
      newlyPersisted: false,
    });
  });

  it("classifies a request-identity-only P2002 with no exact winner as conflict", async () => {
    const context = setup();
    context.repository.create.mockRejectedValueOnce({ code: "P2002" });
    context.repository.findExact.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await expectCode(
      context.resolver.resolveExactObservation(request()),
      "OFFICIAL_EXCHANGE_RATE_CONFLICT",
    );
  });

  it.each([
    ["different winner", persisted({ value: "513" })],
    ["missing winner", null],
  ])("maps a P2002 %s to conflict", async (_case, winner) => {
    const context = setup();
    context.repository.create.mockRejectedValueOnce({ code: "P2002" });
    context.repository.findExact.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    await expectCode(
      context.resolver.resolveExactObservation(request()),
      "OFFICIAL_EXCHANGE_RATE_CONFLICT",
    );
  });

  it.each(["initial read", "create", "winner read"])(
    "maps unexpected persistence failure safely during %s",
    async (phase) => {
      const context = setup();
      if (phase === "initial read") context.repository.findExact.mockRejectedValueOnce(new Error("database URL"));
      if (phase === "create") context.repository.create.mockRejectedValueOnce(new Error("raw Prisma SQL"));
      if (phase === "winner read") {
        context.repository.create.mockRejectedValueOnce({ code: "P2002" });
        context.repository.findExact.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("raw Prisma SQL"));
      }
      const error = await capture(context.resolver.resolveExactObservation(request()));
      expect(error.code).toBe("OFFICIAL_EXCHANGE_RATE_PERSISTENCE_FAILED");
      expect(error.message).not.toMatch(/database|Prisma|SQL|URL/i);
    },
  );
});

function setup(options: {
  existing?: PersistedOfficialExchangeRateObservation | null;
  rateType?: "REFERENCE_BUY" | "REFERENCE_SELL";
  indicator?: string;
} = {}) {
  const rateType = options.rateType ?? "REFERENCE_SELL";
  const indicator = options.indicator ?? "318";
  const created = persisted({ rateType, sourceIndicatorCode: indicator });
  const repository = {
    findExact: jest.fn().mockResolvedValue(options.existing ?? null),
    create: jest.fn().mockResolvedValue(created),
  } satisfies jest.Mocked<OfficialExchangeRateRepository>;
  const provider = {
    getObservations: jest.fn().mockResolvedValue(providerResult({ rateType, sourceIndicatorCode: indicator, observations: [providerObservation({ sourceIndicatorCode: indicator })] })),
  } satisfies jest.Mocked<OfficialExchangeRateProvider>;
  return {
    repository,
    provider,
    resolver: new OfficialExchangeRateResolver(repository, provider),
  };
}

function request(overrides: Record<string, unknown> = {}): ResolveExactOfficialExchangeRateRequest {
  return {
    countryCode: "CR",
    foreignCurrencyCode: "USD",
    localCurrencyCode: "CRC",
    rateType: "REFERENCE_SELL",
    effectiveDate: "2026-08-22",
    ...overrides,
  } as ResolveExactOfficialExchangeRateRequest;
}

function identity(overrides: Record<string, unknown> = {}) {
  return {
    ...request(),
    sourceAuthority: "BCCR",
    sourceIndicatorCode: "318",
    ...overrides,
  };
}

function providerObservation(overrides: Record<string, unknown> = {}) {
  return {
    effectiveDate: "2026-08-22",
    value: "512.50000",
    sourceIndicatorCode: "318",
    sourcePublishedAt: null,
    ...overrides,
  };
}

function providerResult(overrides: Record<string, unknown> = {}) {
  return {
    sourceAuthority: "BCCR",
    countryCode: "CR",
    foreignCurrencyCode: "USD",
    localCurrencyCode: "CRC",
    rateType: "REFERENCE_SELL" as const,
    sourceIndicatorCode: "318",
    observations: [providerObservation()],
    ...overrides,
  };
}

function persisted(overrides: Record<string, unknown> = {}): PersistedOfficialExchangeRateObservation {
  const baseIdentity = identity(overrides);
  const value = String(overrides.value ?? "512.5");
  return {
    id: "obs-1",
    ...baseIdentity,
    value,
    retrievedAt: new Date("2026-08-22T18:00:00.000Z"),
    sourcePublishedAt: null,
    requestIdentity: buildRequestIdentity(baseIdentity),
    responseHash: buildResponseHash(baseIdentity, value),
  };
}

async function capture(promise: Promise<unknown>) {
  try {
    await promise;
    throw new Error("Expected resolver error");
  } catch (error) {
    expect(error).toBeInstanceOf(OfficialExchangeRateResolverError);
    return error as OfficialExchangeRateResolverError;
  }
}

async function expectCode(promise: Promise<unknown>, code: string) {
  expect((await capture(promise)).code).toBe(code);
}
