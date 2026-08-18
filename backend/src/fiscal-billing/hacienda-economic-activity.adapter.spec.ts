import { ConfigService } from "@nestjs/config";
import { HaciendaEconomicActivityAdapter } from "./hacienda-economic-activity.adapter";
import { HaciendaActivityLookupError } from "./hacienda-economic-activity.provider";

describe("HaciendaEconomicActivityAdapter", () => {
  afterEach(() => jest.restoreAllMocks());

  it("encodes identification and safely normalizes codes without changing them", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      response({
        nombre: " Viajes Ejemplo S.A. ",
        situacion: {
          estado: "INSCRITO",
          moroso: false,
          omiso: true,
          administracionTributaria: "San José",
        },
        actividades: [
          {
            codigo: " 0012.0 ",
            descripcion: " Actividad principal ",
            estado: "A",
            tipo: "P",
          },
          { codigo: "7911.0", descripcion: "Agencias", tipo: "S" },
          { codigo: "0012.0", descripcion: "Duplicada", tipo: "S" },
        ],
      }),
    );
    const adapter = new HaciendaEconomicActivityAdapter(config());

    await expect(adapter.findByIdentification("3-101/000 123")).resolves.toEqual({
      legalName: "Viajes Ejemplo S.A.",
      taxSituation: {
        status: "INSCRITO",
        delinquent: false,
        omission: true,
        taxAdministration: "San José",
      },
      activities: [
        {
          code: "0012.0",
          description: "Actividad principal",
          status: "A",
          primary: true,
        },
        { code: "7911.0", description: "Agencias", primary: false },
      ],
    });
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toBe(
      "https://api.hacienda.go.cr/fe/ae?identificacion=3-101%2F000+123",
    );
  });

  it("does not invent a primary indicator", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      response({ actividades: [{ codigo: "007", descripcion: "Actividad" }] }),
    );
    const result = await new HaciendaEconomicActivityAdapter(config())
      .findByIdentification("123");
    expect(result.activities[0]).toEqual({
      code: "007",
      description: "Actividad",
    });
  });

  it.each([
    [404, "HACIENDA_TAXPAYER_NOT_FOUND"],
    [429, "HACIENDA_ACTIVITY_LOOKUP_RATE_LIMITED"],
    [500, "HACIENDA_ACTIVITY_LOOKUP_UNAVAILABLE"],
  ])("maps HTTP %s to %s", async (status, code) => {
    jest.spyOn(global, "fetch").mockResolvedValue(response({}, status));
    await expect(
      new HaciendaEconomicActivityAdapter(config()).findByIdentification("1"),
    ).rejects.toMatchObject({ code });
  });

  it("maps network failures to unavailable", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("private detail"));
    await expect(
      new HaciendaEconomicActivityAdapter(config()).findByIdentification("1"),
    ).rejects.toMatchObject({ code: "HACIENDA_ACTIVITY_LOOKUP_UNAVAILABLE" });
  });

  it.each([
    [responseText("not json")],
    [response({ actividades: [{ codigo: 791100, descripcion: "Bad" }] })],
    [response({ actividades: [{ codigo: "7911.0" }] })],
  ])("rejects malformed provider data", async (providerResponse) => {
    jest.spyOn(global, "fetch").mockResolvedValue(providerResponse);
    await expect(
      new HaciendaEconomicActivityAdapter(config()).findByIdentification("1"),
    ).rejects.toBeInstanceOf(HaciendaActivityLookupError);
    await expect(
      new HaciendaEconomicActivityAdapter(config()).findByIdentification("1"),
    ).rejects.toMatchObject({ code: "HACIENDA_ACTIVITY_LOOKUP_INVALID_RESPONSE" });
  });

  it("aborts at the configured timeout", async () => {
    jest.useFakeTimers();
    jest.spyOn(global, "fetch").mockImplementation((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      }),
    );
    const promise = new HaciendaEconomicActivityAdapter(
      config({ HACIENDA_ACTIVITY_LOOKUP_TIMEOUT_MS: "100" }),
    ).findByIdentification("1");
    jest.advanceTimersByTime(100);
    await expect(promise).rejects.toMatchObject({
      code: "HACIENDA_ACTIVITY_LOOKUP_TIMEOUT",
    });
    jest.useRealTimers();
  });
});

function config(values: Record<string, string> = {}) {
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function responseText(body: string) {
  return new Response(body, { status: 200 });
}
