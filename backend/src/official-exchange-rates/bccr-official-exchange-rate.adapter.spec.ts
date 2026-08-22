import { ConfigService } from "@nestjs/config";
import {
  BCCR_MAX_RESPONSE_BYTES,
  BccrOfficialExchangeRateAdapter,
} from "./bccr-official-exchange-rate.adapter";
import { OfficialExchangeRateProviderError } from "./official-exchange-rate.errors";
import type { OfficialExchangeRateRequest } from "./official-exchange-rate.provider";

describe("BccrOfficialExchangeRateAdapter", () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ["REFERENCE_BUY", "317"],
    ["REFERENCE_SELL", "318"],
  ] as const)("maps %s only to indicator %s and encodes the official request", async (rateType, indicator) => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(xmlResponse(dataset([])));
    const adapter = createAdapter().adapter;

    await adapter.getObservations(request({ rateType }));

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname.endsWith(
      "/wsindicadoreseconomicos.asmx/ObtenerIndicadoresEconomicosXML",
    )).toBe(true);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      Indicador: indicator,
      FechaInicio: "01/08/2026",
      FechaFinal: "02/08/2026",
      Nombre: "Servicio Fiscal & Seguro",
      SubNiveles: "N",
      CorreoElectronico: "server+bccr@example.test",
      Token: "secret/token?value",
    });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "GET",
      headers: { Accept: "application/xml, text/xml" },
    });
  });

  it.each(["toString", "constructor", "valueOf"])(
    "rejects inherited runtime rate type %s before configuration or fetch",
    async (rateType) => {
      const fetchMock = jest.spyOn(globalThis, "fetch");
      const { adapter, get } = createAdapter();

      await expectCode(
        adapter.getObservations(request({ rateType }) as OfficialExchangeRateRequest),
        "BCCR_EXCHANGE_RATE_REQUEST_INVALID",
      );

      expect(get).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    { countryCode: "PA" },
    { foreignCurrencyCode: "EUR" },
    { localCurrencyCode: "USD" },
    { rateType: "SPOT" },
    { startDate: "2026-02-30" },
    { startDate: "2026-08-03", endDate: "2026-08-02" },
    { endDate: "2026-09-01" },
  ])("rejects unsupported scope or invalid dates before fetch", async (override) => {
    const fetchMock = jest.spyOn(globalThis, "fetch");
    await expectCode(
      createAdapter().adapter.getObservations(request(override as never)),
      "BCCR_EXCHANGE_RATE_REQUEST_INVALID",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads credentials lazily and rejects missing or invalid configuration", async () => {
    const values = validConfig();
    const { adapter, get } = createAdapter(values);
    expect(get).not.toHaveBeenCalled();
    delete values.BCCR_SUBSCRIPTION_TOKEN;
    const fetchMock = jest.spyOn(globalThis, "fetch");
    await expectCode(
      adapter.getObservations(request()),
      "BCCR_EXCHANGE_RATE_CONFIGURATION_MISSING",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledWith("BCCR_SUBSCRIPTION_NAME", "");

    values.BCCR_SUBSCRIPTION_TOKEN = "private-token";
    values.BCCR_INDICATORS_TIMEOUT_MS = "99";
    await expectCode(
      adapter.getObservations(request()),
      "BCCR_EXCHANGE_RATE_CONFIGURATION_MISSING",
    );
  });

  it("normalizes namespaced purchase rows in source order with exact lexical decimals", async () => {
    const xml = dataset([
      row("317", "2026-08-01T00:00:00-06:00", " 501.230000000001 ", "x"),
      row("317", "2026-08-02T00:00:00", "502.40", "x"),
    ], "x");
    jest.spyOn(globalThis, "fetch").mockResolvedValue(xmlResponse(xml));

    await expect(createAdapter().adapter.getObservations(request({ rateType: "REFERENCE_BUY" }))).resolves.toEqual({
      sourceAuthority: "BCCR",
      countryCode: "CR",
      foreignCurrencyCode: "USD",
      localCurrencyCode: "CRC",
      rateType: "REFERENCE_BUY",
      sourceIndicatorCode: "317",
      observations: [
        { effectiveDate: "2026-08-01", value: "501.230000000001", sourceIndicatorCode: "317", sourcePublishedAt: null },
        { effectiveDate: "2026-08-02", value: "502.40", sourceIndicatorCode: "317", sourcePublishedAt: null },
      ],
    });
  });

  it("continues to normalize valid unprefixed XML", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      xmlResponse(dataset([row("318", "2026-08-01", "500.25")])),
    );

    await expect(createAdapter().adapter.getObservations(request())).resolves.toMatchObject({
      observations: [{ effectiveDate: "2026-08-01", value: "500.25" }],
    });
  });

  it.each([
    ["mismatched root prefix", '<string><x:Datos_de_INGC011_CAT_INDICADORECONOMIC xmlns:x="urn:bccr" xmlns:y="urn:bccr"></y:Datos_de_INGC011_CAT_INDICADORECONOMIC></string>'],
    ["mismatched row prefix", datasetRootEnvelope('<x:INGC011_CAT_INDICADORECONOMIC></y:INGC011_CAT_INDICADORECONOMIC>', ' xmlns:y="urn:bccr"')],
    ["mismatched indicator prefix", datasetRootEnvelope('<x:INGC011_CAT_INDICADORECONOMIC><x:COD_INDICADORINTERNO>318</y:COD_INDICADORINTERNO><x:DES_FECHA>2026-08-01</x:DES_FECHA><x:NUM_VALOR>500.1</x:NUM_VALOR></x:INGC011_CAT_INDICADORECONOMIC>', ' xmlns:y="urn:bccr"')],
    ["mismatched date prefix", datasetRootEnvelope('<x:INGC011_CAT_INDICADORECONOMIC><x:COD_INDICADORINTERNO>318</x:COD_INDICADORINTERNO><x:DES_FECHA>2026-08-01</y:DES_FECHA><x:NUM_VALOR>500.1</x:NUM_VALOR></x:INGC011_CAT_INDICADORECONOMIC>', ' xmlns:y="urn:bccr"')],
    ["mismatched value prefix", datasetRootEnvelope('<x:INGC011_CAT_INDICADORECONOMIC><x:COD_INDICADORINTERNO>318</x:COD_INDICADORINTERNO><x:DES_FECHA>2026-08-01</x:DES_FECHA><x:NUM_VALOR>500.1</y:NUM_VALOR></x:INGC011_CAT_INDICADORECONOMIC>', ' xmlns:y="urn:bccr"')],
    ["unbound root prefix", '<string><x:Datos_de_INGC011_CAT_INDICADORECONOMIC/></string>'],
    ["unbound row prefix", '<string><Datos_de_INGC011_CAT_INDICADORECONOMIC><x:INGC011_CAT_INDICADORECONOMIC></x:INGC011_CAT_INDICADORECONOMIC></Datos_de_INGC011_CAT_INDICADORECONOMIC></string>'],
    ["unbound field prefix", '<string><Datos_de_INGC011_CAT_INDICADORECONOMIC><INGC011_CAT_INDICADORECONOMIC><x:COD_INDICADORINTERNO>318</x:COD_INDICADORINTERNO><DES_FECHA>2026-08-01</DES_FECHA><NUM_VALOR>500.1</NUM_VALOR></INGC011_CAT_INDICADORECONOMIC></Datos_de_INGC011_CAT_INDICADORECONOMIC></string>'],
  ])("rejects XML with %s", async (_case, xml) => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(xmlResponse(xml));
    await expectCode(
      createAdapter().adapter.getObservations(request()),
      "BCCR_EXCHANGE_RATE_INVALID_RESPONSE",
    );
  });

  it("normalizes the escaped ASP.NET string envelope used by the selling operation", async () => {
    const inner = datasetRoot([row("318", "2026-08-01T00:00:00-06:00", "512.50000")]);
    const escaped = inner
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      xmlResponse(`<?xml version="1.0"?><string xmlns="http://ws.sdde.bccr.fi.cr">${escaped}</string>`),
    );
    const result = await createAdapter().adapter.getObservations(request());
    expect(result.observations).toEqual([
      { effectiveDate: "2026-08-01", value: "512.50000", sourceIndicatorCode: "318", sourcePublishedAt: null },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/secret|example\.test|Servicio Fiscal|<string/);
  });

  it.each(["0", "0.000", "-1", "1e3", "1,25", "1 25", "NaN", "Infinity", ".5", "+1"])(
    "rejects unsafe decimal %s without exposing the body",
    async (value) => {
      jest.spyOn(globalThis, "fetch").mockResolvedValue(
        xmlResponse(dataset([row("318", "2026-08-01", value)])),
      );
      const error = await capture(createAdapter().adapter.getObservations(request()));
      expect(error.code).toBe("BCCR_EXCHANGE_RATE_INVALID_RESPONSE");
      expect(error.message).not.toContain(value);
    },
  );

  it.each([
    [dataset([row("317", "2026-08-01", "500.1")]), "wrong indicator"],
    [dataset([row("318", "2026-07-31", "500.1")]), "out of range"],
    [dataset(["<INGC011_CAT_INDICADORECONOMIC><COD_INDICADORINTERNO>318</COD_INDICADORINTERNO></INGC011_CAT_INDICADORECONOMIC>"]), "missing fields"],
    [dataset([row("318", "2026-08-01", "500.1"), row("318", "2026-08-01", "500.1")]), "duplicate"],
    [dataset([row("318", "2026-08-01", "500.1"), row("318", "2026-08-01", "501.1")]), "conflicting duplicate"],
    ["<string><broken></string>", "malformed XML"],
    ["<!DOCTYPE x><string></string>", "DTD"],
    [dataset([`${row("318", "2026-08-01", "500.1")}<unexpected/>`]), "unexpected structure"],
  ])("rejects %s safely (%s)", async (xml) => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(xmlResponse(xml));
    await expectCode(
      createAdapter().adapter.getObservations(request()),
      "BCCR_EXCHANGE_RATE_INVALID_RESPONSE",
    );
  });

  it("accepts an empty official dataset", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(xmlResponse(dataset([])));
    await expect(createAdapter().adapter.getObservations(request())).resolves.toMatchObject({
      observations: [],
    });
  });

  it("rejects an oversized body before parsing", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("x", {
        status: 200,
        headers: { "content-length": String(BCCR_MAX_RESPONSE_BYTES + 1) },
      }),
    );
    await expectCode(
      createAdapter().adapter.getObservations(request()),
      "BCCR_EXCHANGE_RATE_INVALID_RESPONSE",
    );
  });

  it("maps timeout without leaking credentials", async () => {
    jest.useFakeTimers();
    jest.spyOn(globalThis, "fetch").mockImplementation((_url, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("private-token", "AbortError")),
        ),
      ),
    );
    const promise = capture(createAdapter({
      ...validConfig(),
      BCCR_INDICATORS_TIMEOUT_MS: "100",
    }).adapter.getObservations(request()));
    await jest.advanceTimersByTimeAsync(100);
    const error = await promise;
    expect(error.code).toBe("BCCR_EXCHANGE_RATE_TIMEOUT");
    expect(error.message).not.toMatch(/private-token|example\.test|Servicio Fiscal/);
    jest.useRealTimers();
  });

  it.each([
    [429, "BCCR_EXCHANGE_RATE_RATE_LIMITED"],
    [500, "BCCR_EXCHANGE_RATE_UNAVAILABLE"],
    [400, "BCCR_EXCHANGE_RATE_UNAVAILABLE"],
  ] as const)("maps HTTP %s safely", async (status, code) => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("private-token raw provider body", { status }),
    );
    const error = await capture(createAdapter().adapter.getObservations(request()));
    expect(error.code).toBe(code);
    expect(error.message).not.toMatch(/private-token|raw provider body/);
  });

  it("maps network failures safely and has no persistence collaborators", async () => {
    jest.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("private-token database tenant queue BillingDocument"),
    );
    const adapter = createAdapter().adapter;
    expect(Object.keys(adapter)).toEqual(["config"]);
    const error = await capture(adapter.getObservations(request()));
    expect(error.code).toBe("BCCR_EXCHANGE_RATE_UNAVAILABLE");
    expect(error.message).not.toMatch(/private-token|database|tenant|queue|BillingDocument/);
  });
});

function request(overrides: Record<string, unknown> = {}): OfficialExchangeRateRequest {
  return {
    countryCode: "CR",
    foreignCurrencyCode: "USD",
    localCurrencyCode: "CRC",
    rateType: "REFERENCE_SELL",
    startDate: "2026-08-01",
    endDate: "2026-08-02",
    ...overrides,
  } as OfficialExchangeRateRequest;
}

function validConfig(): Record<string, string> {
  return {
    BCCR_INDICATORS_BASE_URL:
      "https://bccr.example.test/Indicadores/Suscripciones/WS/wsindicadoreseconomicos.asmx",
    BCCR_SUBSCRIPTION_NAME: "Servicio Fiscal & Seguro",
    BCCR_SUBSCRIPTION_EMAIL: "server+bccr@example.test",
    BCCR_SUBSCRIPTION_TOKEN: "secret/token?value",
    BCCR_INDICATORS_TIMEOUT_MS: "5000",
  };
}

function createAdapter(values = validConfig()) {
  const get = jest.fn((key: string, fallback?: string) => values[key] ?? fallback);
  return {
    adapter: new BccrOfficialExchangeRateAdapter({ get } as unknown as ConfigService),
    get,
  };
}

function row(indicator: string, date: string, value: string, prefix = "") {
  const tag = (name: string, content: string) =>
    `<${prefix ? `${prefix}:` : ""}${name}>${content}</${prefix ? `${prefix}:` : ""}${name}>`;
  return `<${prefix ? `${prefix}:` : ""}INGC011_CAT_INDICADORECONOMIC>${tag("COD_INDICADORINTERNO", indicator)}${tag("DES_FECHA", date)}${tag("NUM_VALOR", value)}</${prefix ? `${prefix}:` : ""}INGC011_CAT_INDICADORECONOMIC>`;
}

function dataset(rows: string[], prefix = "") {
  return `<string xmlns="http://ws.sdde.bccr.fi.cr">${datasetRoot(rows, prefix)}</string>`;
}

function datasetRoot(rows: string[], prefix = "") {
  const name = `${prefix ? `${prefix}:` : ""}Datos_de_INGC011_CAT_INDICADORECONOMIC`;
  const namespace = prefix ? ` xmlns:${prefix}="urn:bccr:dataset"` : "";
  return `<${name}${namespace}>${rows.join("")}</${name}>`;
}

function datasetRootEnvelope(content: string, declarations = "") {
  return `<string><x:Datos_de_INGC011_CAT_INDICADORECONOMIC xmlns:x="urn:bccr"${declarations}>${content}</x:Datos_de_INGC011_CAT_INDICADORECONOMIC></string>`;
}

function xmlResponse(xml: string) {
  return new Response(xml, {
    status: 200,
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}

async function capture(promise: Promise<unknown>) {
  try {
    await promise;
    throw new Error("Expected provider error");
  } catch (error) {
    expect(error).toBeInstanceOf(OfficialExchangeRateProviderError);
    return error as OfficialExchangeRateProviderError;
  }
}

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await capture(promise);
  expect(error.code).toBe(code);
}
