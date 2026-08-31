import { ConfigService } from "@nestjs/config";
import { CabysProviderError } from "./cabys-catalog.provider";
import { FacturaEnCrCabysProvider } from "./factura-en-cr-cabys.provider";

function provider(values: Record<string, string> = {}) {
  const defaults: Record<string, string> = { FACTURA_EN_CR_API_KEY: "key-secret", FACTURA_EN_CR_API_SECRET: "api-secret", FACTURA_EN_CR_BASE_URL: "https://provider.test/v2/efactura", FACTURA_EN_CR_TIMEOUT_MS: "5000" };
  const config = { get: jest.fn((key: string, fallback: string) => values[key] ?? defaults[key] ?? fallback) };
  return new FacturaEnCrCabysProvider(config as never);
}

describe("FacturaEnCrCabysProvider", () => {
  afterEach(() => jest.restoreAllMocks());

  it("sends encoded query, top, and both authentication headers", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ items: [{ codigo: "2349002011500", descripcion: "Pan árabe", impuesto: 1 }] }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(provider().search("pan árabe", 20)).resolves.toEqual([{ code: "2349002011500", description: "Pan árabe", referenceTaxPercentage: "1.0000" }]);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("q=pan+%C3%A1rabe&top=20");
    expect(options).toMatchObject({ method: "GET", headers: { "X-API-Key": "key-secret", "X-API-Secret": "api-secret" } });
  });

  it("fails safely when credentials are missing without calling fetch", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch");
    await expect(provider({ FACTURA_EN_CR_API_KEY: "" }).search("bread", 20)).rejects.toMatchObject({ code: "CABYS_PROVIDER_UNAVAILABLE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([[401, "CABYS_PROVIDER_UNAVAILABLE"], [403, "CABYS_PROVIDER_UNAVAILABLE"], [429, "CABYS_PROVIDER_RATE_LIMITED"], [500, "CABYS_PROVIDER_UNAVAILABLE"]])("maps HTTP %s", async (status, code) => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("private provider body", { status }));
    await expect(provider().search("bread", 20)).rejects.toEqual(new CabysProviderError(code as never));
  });

  it("maps network failures without exposing raw secrets", async () => {
    jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("api-secret network configuration"));
    const error = await provider().search("bread", 20).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "CABYS_PROVIDER_UNAVAILABLE", message: "CABYS_PROVIDER_UNAVAILABLE" });
    expect(String(error)).not.toContain("api-secret");
  });

  it("maps timeout", async () => {
    jest.useFakeTimers();
    jest.spyOn(globalThis, "fetch").mockImplementation((_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    const pending = provider({ FACTURA_EN_CR_TIMEOUT_MS: "100" }).search("bread", 20);
    const rejection = expect(pending).rejects.toMatchObject({ code: "CABYS_PROVIDER_TIMEOUT" });
    await jest.advanceTimersByTimeAsync(100);
    await rejection;
    jest.useRealTimers();
  });

  it("accepts an empty result", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    await expect(provider().search("bread", 20)).resolves.toEqual([]);
  });

  it("rejects invalid timeout configuration before fetch", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch");
    await expect(provider({ FACTURA_EN_CR_TIMEOUT_MS: "0" }).search("bread", 20)).rejects.toMatchObject({ code: "CABYS_PROVIDER_UNAVAILABLE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps invalid JSON to invalid response", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not-json", { status: 200 }));
    await expect(provider().search("bread", 20)).rejects.toMatchObject({ code: "CABYS_PROVIDER_INVALID_RESPONSE" });
  });

  it.each([{ nope: [] }, { items: [{}] }, { items: [{ codigo: "12", descripcion: "x", impuesto: 1 }] }, { items: [{ codigo: "2349002011500", descripcion: " ", impuesto: 1 }] }, { items: [{ codigo: "2349002011500", descripcion: "x", impuesto: -1 }] }])("rejects malformed response", async (body) => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    await expect(provider().search("bread", 20)).rejects.toMatchObject({ code: "CABYS_PROVIDER_INVALID_RESPONSE" });
  });

  it("returns only the exact code", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ items: [{ codigo: "2349002011500", descripcion: "Pan", impuesto: 1 }] }), { status: 200 }));
    await expect(provider().findExact("9999999999999")).resolves.toBeNull();
  });
});
