import { ConfigService } from "@nestjs/config";
import { BCCR_MAX_RESPONSE_BYTES, BccrOfficialExchangeRateAdapter } from "./bccr-official-exchange-rate.adapter";
import { OfficialExchangeRateProviderError } from "./official-exchange-rate.errors";
import type { OfficialExchangeRateRequest } from "./official-exchange-rate.provider";

describe("BccrOfficialExchangeRateAdapter SDDE", () => {
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

  it.each([["REFERENCE_BUY", "317"], ["REFERENCE_SELL", "318"]] as const)("maps %s to official series %s with Bearer auth", async (rateType, indicator) => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(documentedJson(indicator, "")));
    await createAdapter().adapter.getObservations(request({ rateType }));
    const [input, init] = fetchMock.mock.calls[0]; const url = new URL(String(input));
    expect(url.pathname).toBe(`/SDDE/api/Bccr.GE.SDDE.Publico.Indicadores.API/indicadoresEconomicos/${indicator}/series`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ fechaInicio: "2026/08/01", fechaFin: "2026/08/02", idioma: "ES" });
    expect(init).toMatchObject({ method: "GET", headers: { Authorization: "Bearer private-token", Accept: "application/json" } });
    expect(String(input)).not.toContain("private-token");
  });

  it("uses the official default and reads only SDDE configuration lazily", async () => {
    const { adapter, get } = createAdapter({ BCCR_SDDE_API_TOKEN: "private-token" }); expect(get).not.toHaveBeenCalled();
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(documentedJson("318", "")));
    await adapter.getObservations(request());
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^https:\/\/apim\.bccr\.fi\.cr\/SDDE\/api\/Bccr\.GE\.SDDE\.Publico\.Indicadores\.API\//);
    expect(get.mock.calls.map(([key]) => key)).toEqual(["BCCR_SDDE_API_TOKEN", "BCCR_SDDE_TIMEOUT_MS", "BCCR_SDDE_BASE_URL"]);
  });

  it.each(["toString", "constructor", "valueOf", "SPOT"])("rejects runtime rate type %s before config/fetch", async (rateType) => {
    const fetchMock = jest.spyOn(globalThis, "fetch"); const { adapter, get } = createAdapter();
    await expectCode(adapter.getObservations(request({ rateType }) as OfficialExchangeRateRequest), "BCCR_EXCHANGE_RATE_REQUEST_INVALID");
    expect(get).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([{ countryCode: "PA" }, { foreignCurrencyCode: "EUR" }, { localCurrencyCode: "USD" }, { startDate: "2026-02-30" }, { startDate: "2026-08-03", endDate: "2026-08-02" }, { endDate: "2026-09-01" }])("rejects scope/date before config/fetch", async (override) => {
    const fetchMock = jest.spyOn(globalThis, "fetch"); const { adapter, get } = createAdapter();
    await expectCode(adapter.getObservations(request(override as never)), "BCCR_EXCHANGE_RATE_REQUEST_INVALID");
    expect(get).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([{ BCCR_SDDE_API_TOKEN: "" }, { BCCR_SDDE_API_TOKEN: "x", BCCR_SDDE_TIMEOUT_MS: "99" }, { BCCR_SDDE_API_TOKEN: "x", BCCR_SDDE_BASE_URL: "http://unsafe.test" }])("rejects missing/unsafe configuration", async (values) => {
    const fetchMock = jest.spyOn(globalThis, "fetch");
    await expectCode(createAdapter(values).adapter.getObservations(request()), "BCCR_EXCHANGE_RATE_CONFIGURATION_MISSING"); expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes documented JSON in source order and preserves lexical decimals", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(documentedJson("318", `${series("2026-08-01", "505.810000000000")},${series("2026-08-02", "123456789012345678.123456789012")}`)));
    await expect(createAdapter().adapter.getObservations(request())).resolves.toMatchObject({ sourceAuthority: "BCCR", sourceIndicatorCode: "318", observations: [
      { effectiveDate: "2026-08-01", value: "505.810000000000", sourceIndicatorCode: "318", sourcePublishedAt: null },
      { effectiveDate: "2026-08-02", value: "123456789012345678.123456789012", sourceIndicatorCode: "318", sourcePublishedAt: null },
    ] });
  });

  it.each([[documentedJson("318", ""), "empty series"], ['{"estado":true,"mensaje":"ok","datos":[]}', "empty datos"], [documentedJson("318", series("2026-08-01", "null")), "null"]])("returns no observations for %s (%s)", async (body) => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(body));
    await expect(createAdapter().adapter.getObservations(request())).resolves.toMatchObject({ observations: [] });
  });

  it.each([
    ['[]', "root array"], ['{}', "missing root fields"], ['{"estado":false,"mensaje":"secret provider detail","datos":[]}', "false estado"],
    ['{"estado":true,"mensaje":7,"datos":[]}', "bad message"], ['{"estado":true,"datos":{}}', "bad datos"],
    [documentedJson("317", series("2026-08-01", "505.81")), "wrong indicator"], ['{"estado":true,"datos":[{"codigoIndicador":"318"}]}', "missing series"],
    [documentedJson("318", series("2026-07-31", "505.81")), "out-of-range date"],
    [documentedJson("318", `${series("2026-08-01", "505.81")},${series("2026-08-01", "506.81")}`), "duplicate date"],
    [documentedJson("318", '{"fecha":7,"valorDatoPorPeriodo":505.81}'), "bad date"],
    [documentedJson("318", '{"fecha":"2026-08-01","valorDatoPorPeriodo":"505.81"}'), "numeric string"],
    [documentedJson("318", '{"fecha":"2026-08-01","valorDatoPorPeriodo":true}'), "boolean"],
    [documentedJson("318", '{"fecha":"2026-08-01","valorDatoPorPeriodo":{}}'), "object"], ['{"estado":true', "malformed JSON"],
  ])("rejects malformed/inconsistent response: %s (%s)", async (body) => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(body)); const error = await capture(createAdapter().adapter.getObservations(request()));
    expect(error.code).toBe("BCCR_EXCHANGE_RATE_INVALID_RESPONSE"); expect(error.message).not.toMatch(/secret provider detail|505\.81|\{"estado"/);
  });

  it("does not rewrite property text in strings and recognizes an escaped target key", async () => {
    const body = '{"estado":true,"mensaje":"valorDatoPorPeriodo: 999","datos":[{"codigoIndicador":"318","nombreIndicador":"\\\"valorDatoPorPeriodo\\\":1","series":[{"fecha":"2026-08-01","\\u0076alorDatoPorPeriodo":505.8100}]}]}';
    jest.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(body));
    await expect(createAdapter().adapter.getObservations(request())).resolves.toMatchObject({ observations: [{ value: "505.8100" }] });
  });

  it.each(["0", "0.000", "-1", "1e3", "1234567890123456789", "1.1234567890123"])("rejects unsafe/capacity decimal %s", async (value) => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(documentedJson("318", series("2026-08-01", value))));
    await expectCode(createAdapter().adapter.getObservations(request()), "BCCR_EXCHANGE_RATE_INVALID_RESPONSE");
  });

  it("rejects declared and streamed oversized responses", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("x", { headers: { "content-length": String(BCCR_MAX_RESPONSE_BYTES + 1) } }));
    await expectCode(createAdapter().adapter.getObservations(request()), "BCCR_EXCHANGE_RATE_INVALID_RESPONSE");
    let pulls = 0; const cancel = jest.fn(); const body = new ReadableStream<Uint8Array>({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(BCCR_MAX_RESPONSE_BYTES + 1)); }, cancel });
    fetchMock.mockResolvedValueOnce(new Response(body)); await expectCode(createAdapter().adapter.getObservations(request()), "BCCR_EXCHANGE_RATE_INVALID_RESPONSE");
    expect(cancel).toHaveBeenCalled(); expect(pulls).toBeLessThanOrEqual(2);
  });

  it.each([[401, "BCCR_EXCHANGE_RATE_AUTHENTICATION_FAILED"], [403, "BCCR_EXCHANGE_RATE_AUTHENTICATION_FAILED"], [429, "BCCR_EXCHANGE_RATE_RATE_LIMITED"], [500, "BCCR_EXCHANGE_RATE_UNAVAILABLE"], [400, "BCCR_EXCHANGE_RATE_UNAVAILABLE"]] as const)("maps HTTP %s safely", async (status, code) => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("private-token raw provider body", { status })); const error = await capture(createAdapter().adapter.getObservations(request()));
    expect(error.code).toBe(code); expect(error.message).not.toMatch(/private-token|raw provider body|Authorization/);
  });

  it("maps timeout and network errors safely and has no persistence collaborators", async () => {
    jest.useFakeTimers(); jest.spyOn(globalThis, "fetch").mockImplementation((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("private-token", "AbortError")))));
    const timeout = capture(createAdapter({ ...validConfig(), BCCR_SDDE_TIMEOUT_MS: "100" }).adapter.getObservations(request())); await jest.advanceTimersByTimeAsync(100);
    expect((await timeout).code).toBe("BCCR_EXCHANGE_RATE_TIMEOUT"); jest.useRealTimers(); jest.restoreAllMocks();
    jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("private-token database tenant queue")); const adapter = createAdapter().adapter; expect(Object.keys(adapter)).toEqual(["config"]);
    const error = await capture(adapter.getObservations(request())); expect(error.code).toBe("BCCR_EXCHANGE_RATE_UNAVAILABLE"); expect(error.message).not.toMatch(/private-token|database|tenant|queue/);
  });
});

function request(overrides: Record<string, unknown> = {}): OfficialExchangeRateRequest { return { countryCode: "CR", foreignCurrencyCode: "USD", localCurrencyCode: "CRC", rateType: "REFERENCE_SELL", startDate: "2026-08-01", endDate: "2026-08-02", ...overrides } as OfficialExchangeRateRequest; }
function validConfig(): Record<string, string> { return { BCCR_SDDE_BASE_URL: "https://sdde.example.test/SDDE/api/Bccr.GE.SDDE.Publico.Indicadores.API/", BCCR_SDDE_API_TOKEN: "private-token", BCCR_SDDE_TIMEOUT_MS: "5000" }; }
function createAdapter(values: Record<string, string | undefined> = validConfig()) { const get = jest.fn((key: string, fallback?: string) => values[key] ?? fallback); return { adapter: new BccrOfficialExchangeRateAdapter({ get } as unknown as ConfigService), get }; }
function documentedJson(indicator: string, rows: string): string { return `{"estado":true,"mensaje":"Consulta exitosa","datos":[{"codigoIndicador":"${indicator}","nombreIndicador":"Tipo cambio","series":[${rows}]}]}`; }
function series(date: string, value: string): string { return `{"fecha":"${date}","valorDatoPorPeriodo":${value}}`; }
function jsonResponse(body: string): Response { return new Response(body, { status: 200, headers: { "content-type": "application/json" } }); }
async function capture(promise: Promise<unknown>) { try { await promise; throw new Error("Expected provider error"); } catch (error) { expect(error).toBeInstanceOf(OfficialExchangeRateProviderError); return error as OfficialExchangeRateProviderError; } }
async function expectCode(promise: Promise<unknown>, code: string) { expect((await capture(promise)).code).toBe(code); }
