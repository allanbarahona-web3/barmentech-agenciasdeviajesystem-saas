import type { ConfigService } from "@nestjs/config";
import { readFileSync } from "node:fs";
import {
  ElectronicDocumentStatusError,
  type ElectronicDocumentStatusLookupInput,
} from "./electronic-document-status.provider";
import { FacturaEnCrDocumentStatusAdapter } from "./factura-en-cr-document-status.adapter";

const DOCUMENT_ID = "6a640c68a06e822633e9db71";
const CONSECUTIVE = "00100001010000000866";
const KEY = "50624072600310167816600100001010000000866142351111";

describe("FacturaEnCrDocumentStatusAdapter", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("sends exactly one GET to the fixed encoded document path with only required headers", async () => {
    const fetchMock = mockFetch(response(200, detail()));
    await adapter().getDocumentStatus(input());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe(
      `https://api.facturaencr.com/v2/efactura/documents/${DOCUMENT_ID}`,
    );
    expect(init).toMatchObject({
      method: "GET",
      headers: {
        "X-API-Key": "key",
        "X-API-Secret": "secret",
        Accept: "application/json",
      },
    });
    expect(init.body).toBeUndefined();
    expect(init.headers).not.toHaveProperty("Idempotency-Key");
    expect(init.headers).not.toHaveProperty("Content-Type");
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it.each([
    "",
    " document-id",
    "document id",
    "../document",
    "document/id",
    "document?id=1",
    "document#fragment",
    "https://evil.test",
    "line\nbreak",
    "a".repeat(256),
  ])("rejects unsafe provider ID %p before configuration and fetch", async (providerDocumentId) => {
    const get = jest.fn();
    const fetchMock = mockFetch(response(200, detail()));
    await expectError(
      new FacturaEnCrDocumentStatusAdapter({ get } as unknown as ConfigService)
        .getDocumentStatus(input({ providerDocumentId })),
      "ELECTRONIC_DOCUMENT_STATUS_LOCAL_REQUEST_INVALID",
    );
    expect(get).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["expectedHaciendaKey", null],
    ["expectedHaciendaKey", []],
    ["expectedHaciendaKey", 50],
    ["expectedHaciendaKey", false],
    ["expectedHaciendaKey", Symbol("caller-secret")],
    ["expectedConsecutive", null],
    ["expectedConsecutive", {}],
    ["expectedConsecutive", 20],
    ["expectedConsecutive", true],
    ["expectedConsecutive", Symbol("caller-secret")],
    ["expectedProviderEnvironment", null],
    ["expectedProviderEnvironment", "other"],
    ["expectedFiscalIssueDate", []],
    ["expectedFiscalIssueDate", 20260724],
    ["expectedDocumentType", false],
    ["expectedDocumentType", "02"],
    ["providerDocumentId", 123],
  ])("rejects runtime field %s=%p before configuration and fetch", async (field, value) => {
    const get = jest.fn();
    const fetchMock = mockFetch(response(200, detail()));
    const runtimeInput = { ...input(), [field]: value } as unknown as ElectronicDocumentStatusLookupInput;
    const error = await capture(
      new FacturaEnCrDocumentStatusAdapter({ get } as unknown as ConfigService)
        .getDocumentStatus(runtimeInput),
    );
    expect(error.code).toBe("ELECTRONIC_DOCUMENT_STATUS_LOCAL_REQUEST_INVALID");
    expect(error).not.toBeInstanceOf(TypeError);
    expect(JSON.stringify(error)).not.toContain("caller-secret");
    expect(get).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not coerce custom or throwing toString values during validation", async () => {
    const satisfying = { toString: jest.fn().mockReturnValue(KEY) };
    const throwing = { toString: jest.fn(() => { throw new Error("caller-secret"); }) };
    for (const value of [satisfying, throwing]) {
      const get = jest.fn();
      const fetchMock = mockFetch(response(200, detail()));
      const error = await capture(
        new FacturaEnCrDocumentStatusAdapter({ get } as unknown as ConfigService)
          .getDocumentStatus({ ...input(), expectedHaciendaKey: value } as unknown as ElectronicDocumentStatusLookupInput),
      );
      expect(error.code).toBe("ELECTRONIC_DOCUMENT_STATUS_LOCAL_REQUEST_INVALID");
      expect(error.message).not.toContain("caller-secret");
      expect(value.toString).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it.each([
    { FACTURA_EN_CR_API_KEY: "" },
    { FACTURA_EN_CR_API_SECRET: "" },
    { FACTURA_EN_CR_TIMEOUT_MS: "99" },
    { FACTURA_EN_CR_TIMEOUT_MS: "30001" },
    { FACTURA_EN_CR_BASE_URL: "http://api.test" },
    { FACTURA_EN_CR_BASE_URL: "https://user:pass@api.test" },
    { FACTURA_EN_CR_BASE_URL: "https://api.test?q=1" },
    { FACTURA_EN_CR_BASE_URL: "not-a-url" },
  ])("rejects malformed configuration safely: %o", async (override) => {
    const fetchMock = mockFetch(response(200, detail()));
    await expectError(
      adapter(override).getDocumentStatus(input()),
      "ELECTRONIC_DOCUMENT_STATUS_CONFIGURATION_MISSING",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { FACTURA_EN_CR_API_KEY: 1 },
    { FACTURA_EN_CR_API_SECRET: false },
    { FACTURA_EN_CR_TIMEOUT_MS: 5000 },
    { FACTURA_EN_CR_BASE_URL: {} },
  ])("rejects non-string runtime configuration safely: %o", async (override) => {
    const fetchMock = mockFetch(response(200, detail()));
    await expectError(
      adapter(override).getDocumentStatus(input()),
      "ELECTRONIC_DOCUMENT_STATUS_CONFIGURATION_MISSING",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts a timeout, performs no retry, and always clears its timer", async () => {
    jest.useFakeTimers();
    const clear = jest.spyOn(global, "clearTimeout");
    const fetchMock = jest.spyOn(global, "fetch").mockImplementation((_url, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("raw timeout detail"), { name: "AbortError" })),
        ),
      ),
    );
    const promise = adapter({ FACTURA_EN_CR_TIMEOUT_MS: "100" })
      .getDocumentStatus(input());
    jest.advanceTimersByTime(101);
    await expectError(promise, "ELECTRONIC_DOCUMENT_STATUS_TIMEOUT");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it.each(["pending", "queued", "signing", "sent", "polling", "future_status"])(
    "normalizes non-final status %s",
    async (status) => {
      mockFetch(response(200, detail({ status })));
      await expect(adapter().getDocumentStatus(input())).resolves.toMatchObject({
        providerStatus: status,
        final: false,
        finalDecision: null,
      });
    },
  );

  it("normalizes accepted as the only accepted final decision", async () => {
    mockFetch(response(200, detail({ status: "accepted", haciendaMessage: null })));
    await expect(adapter().getDocumentStatus(input())).resolves.toEqual({
      classification: "ELECTRONIC_DOCUMENT_STATUS",
      providerDocumentId: DOCUMENT_ID,
      haciendaKey: KEY,
      consecutive: CONSECUTIVE,
      providerEnvironment: "sandbox",
      providerStatus: "accepted",
      final: true,
      finalDecision: "ACCEPTED",
      fiscalIssuedAt: "2026-07-25T01:07:52.079Z",
      rejectionDetail: null,
    });
  });

  it("normalizes rejected with bounded provider-supplied detail", async () => {
    mockFetch(response(200, detail({
      status: "rejected",
      haciendaMessage: "  -400, Código CABYS inválido\nDetalle  ",
      issueDate: undefined,
    })));
    await expect(adapter().getDocumentStatus(input())).resolves.toMatchObject({
      final: true,
      finalDecision: "REJECTED",
      fiscalIssuedAt: null,
      rejectionDetail: "-400, Código CABYS inválido\nDetalle",
    });
  });

  it.each([undefined, null])("accepts rejected status with optional Hacienda detail %p", async (haciendaMessage) => {
    mockFetch(response(200, detail({ status: "rejected", haciendaMessage })));
    await expect(adapter().getDocumentStatus(input())).resolves.toMatchObject({
      final: true,
      finalDecision: "REJECTED",
      rejectionDetail: null,
    });
  });

  it("preserves a rejection message longer than 2,000 characters within the 64 KiB body budget", async () => {
    const message = `  ${"detalle-hacienda ".repeat(300)}  `;
    mockFetch(response(200, detail({ status: "rejected", haciendaMessage: message })));
    await expect(adapter().getDocumentStatus(input())).resolves.toMatchObject({
      rejectionDetail: message.trim(),
    });
  });

  it.each(["Queued", " queued", "queued ", "queued/path", "line\nbreak", "аccepted", "a".repeat(65)])(
    "rejects unsafe status %p",
    async (status) => {
      mockFetch(response(200, detail({ status })));
      await expectInvalid(adapter().getDocumentStatus(input()));
    },
  );

  it.each([
    ["provider ID", { documentId: "different" }],
    ["Hacienda key", { clave: KEY.slice(0, 49) + "2" }],
    ["consecutive", { consecutivo: "00100001010000000867" }],
    ["environment", { environment: "production" }],
    ["document type", { documentType: "04" }],
    ["fiscal date", { issueDate: "2026-07-25T06:00:00.000Z" }],
  ])("rejects contradictory %s identity", async (_label, override) => {
    mockFetch(response(200, detail(override)));
    await expectInvalid(adapter().getDocumentStatus(input()));
  });

  it("rejects contradictory key embedding and expected-input identity locally", async () => {
    const fetchMock = mockFetch(response(200, detail()));
    await expectError(
      adapter().getDocumentStatus(input({ expectedHaciendaKey: "1".repeat(50) })),
      "ELECTRONIC_DOCUMENT_STATUS_LOCAL_REQUEST_INVALID",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a returned Hacienda-key date different from the persisted fiscal date", async () => {
    mockFetch(response(200, detail({ clave: KEY.replace("240726", "250726") })));
    await expectInvalid(adapter().getDocumentStatus(input()));
  });

  it("accepts valid leap-day identity and rejects an impossible persisted date locally", async () => {
    const leapKey = KEY.replace("240726", "290224");
    mockFetch(response(200, detail({
      clave: leapKey,
      issueDate: "2024-03-01T05:59:59.999Z",
    })));
    await expect(adapter().getDocumentStatus(input({
      expectedHaciendaKey: leapKey,
      expectedFiscalIssueDate: "2024-02-29",
    }))).resolves.toMatchObject({ haciendaKey: leapKey });

    const fetchMock = mockFetch(response(200, detail()));
    fetchMock.mockClear();
    await expectError(
      adapter().getDocumentStatus(input({ expectedFiscalIssueDate: "2025-02-29" })),
      "ELECTRONIC_DOCUMENT_STATUS_LOCAL_REQUEST_INVALID",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts RFC 3339 offsets and enforces both Costa Rica UTC/local midnight boundaries", async () => {
    mockFetch(response(200, detail({ issueDate: "2026-07-24T23:59:59.999-06:00" })));
    await expect(adapter().getDocumentStatus(input())).resolves.toMatchObject({
      fiscalIssuedAt: "2026-07-24T23:59:59.999-06:00",
    });
    mockFetch(response(200, detail({ issueDate: "2026-07-25T05:59:59.999Z" })));
    await expect(adapter().getDocumentStatus(input())).resolves.toBeDefined();

    const nextKey = KEY.replace("240726", "250726");
    mockFetch(response(200, detail({ clave: nextKey, issueDate: "2026-07-25T06:00:00.000Z" })));
    await expect(adapter().getDocumentStatus(input({
      expectedHaciendaKey: nextKey,
      expectedFiscalIssueDate: "2026-07-25",
    }))).resolves.toBeDefined();
  });

  it.each(["", "not-json", "true", "[]"])(
    "rejects malformed successful body %p",
    async (body) => {
      mockFetch(new Response(body, { status: 200 }));
      await expectInvalid(adapter().getDocumentStatus(input()));
    },
  );

  it("rejects error-shaped success and invalid UTF-8", async () => {
    mockFetch(response(200, { ...detail(), error: "raw_error" }));
    await expectInvalid(adapter().getDocumentStatus(input()));
    mockFetch(new Response(new Uint8Array([0xc3, 0x28]), { status: 200 }));
    await expectInvalid(adapter().getDocumentStatus(input()));
  });

  it("rejects declared and streamed responses larger than 64 KiB", async () => {
    mockFetch(new Response("{}", {
      status: 200,
      headers: { "Content-Length": String(65 * 1024) },
    }));
    await expectInvalid(adapter().getDocumentStatus(input()));
    mockFetch(new Response("x".repeat(65 * 1024), { status: 200 }));
    await expectInvalid(adapter().getDocumentStatus(input()));
  });

  it.each(["invalid", "-1", "1, 2"])("rejects malformed Content-Length %p", async (declared) => {
    mockFetch(new Response(JSON.stringify(detail()), {
      status: 200,
      headers: { "Content-Length": declared },
    }));
    await expectInvalid(adapter().getDocumentStatus(input()));
  });

  it("rejects misleading small Content-Length and missing-length streamed overflow", async () => {
    mockFetch(new Response("x".repeat(65 * 1024), {
      status: 200,
      headers: { "Content-Length": "1" },
    }));
    await expectInvalid(adapter().getDocumentStatus(input()));
    mockFetch(new Response("x".repeat(65 * 1024), { status: 200 }));
    await expectInvalid(adapter().getDocumentStatus(input()));
  });

  it("clears its timeout after success and ordinary HTTP error", async () => {
    const clear = jest.spyOn(global, "clearTimeout");
    mockFetch(response(200, detail()));
    await adapter().getDocumentStatus(input());
    mockFetch(response(422, { message: "raw" }));
    await expectError(
      adapter().getDocumentStatus(input()),
      "ELECTRONIC_DOCUMENT_STATUS_LOOKUP_REJECTED",
    );
    expect(clear).toHaveBeenCalledTimes(2);
  });

  it.each([
    [401, "ELECTRONIC_DOCUMENT_STATUS_AUTHENTICATION_FAILED"],
    [403, "ELECTRONIC_DOCUMENT_STATUS_AUTHORIZATION_FAILED"],
    [404, "ELECTRONIC_DOCUMENT_STATUS_NOT_FOUND"],
    [400, "ELECTRONIC_DOCUMENT_STATUS_LOOKUP_REJECTED"],
    [409, "ELECTRONIC_DOCUMENT_STATUS_LOOKUP_REJECTED"],
    [418, "ELECTRONIC_DOCUMENT_STATUS_LOOKUP_REJECTED"],
    [422, "ELECTRONIC_DOCUMENT_STATUS_LOOKUP_REJECTED"],
    [500, "ELECTRONIC_DOCUMENT_STATUS_PROVIDER_UNAVAILABLE"],
    [502, "ELECTRONIC_DOCUMENT_STATUS_PROVIDER_UNAVAILABLE"],
    [503, "ELECTRONIC_DOCUMENT_STATUS_PROVIDER_UNAVAILABLE"],
    [504, "ELECTRONIC_DOCUMENT_STATUS_PROVIDER_UNAVAILABLE"],
  ] as const)("maps HTTP %s safely", async (status, code) => {
    mockFetch(response(status, { message: "raw provider secret", clave: KEY }));
    await expectError(adapter().getDocumentStatus(input()), code);
  });

  it("maps rate limiting with only bounded Retry-After", async () => {
    mockFetch(response(429, {}, { "Retry-After": "30" }));
    expect((await capture(adapter().getDocumentStatus(input()))).retryAfterSeconds).toBe(30);
    mockFetch(response(429, {}, { "Retry-After": "86401" }));
    expect((await capture(adapter().getDocumentStatus(input()))).retryAfterSeconds).toBeNull();
  });

  it("maps network failure to a stable redacted unavailable error", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockRejectedValue(
      new Error(`underlying-secret ${DOCUMENT_ID} ${KEY}`),
    );
    const error = await capture(adapter().getDocumentStatus(input()));
    expect(error.code).toBe("ELECTRONIC_DOCUMENT_STATUS_PROVIDER_UNAVAILABLE");
    expect(JSON.stringify(error)).not.toContain("underlying-secret");
    expect(JSON.stringify(error)).not.toContain(DOCUMENT_ID);
    expect(JSON.stringify(error)).not.toContain(KEY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([201, 202, 204])("rejects unexpected successful HTTP %s", async (status) => {
    mockFetch(status === 204 ? new Response(null, { status }) : response(status, detail()));
    await expectInvalid(adapter().getDocumentStatus(input()));
  });

  it("accepts rejection detail only for rejected status", async () => {
    for (const override of [
      { status: "accepted", haciendaMessage: "raw" },
      { status: "queued", haciendaMessage: "raw" },
      { status: "rejected", haciendaMessage: "bad\u0000detail" },
    ]) {
      mockFetch(response(200, detail(override)));
      await expectInvalid(adapter().getDocumentStatus(input()));
    }
  });

  it("does not place contradictory raw Hacienda detail in the technical error", async () => {
    const raw = "raw-hacienda-customer-detail";
    mockFetch(response(200, detail({ status: "queued", haciendaMessage: raw })));
    const error = await capture(adapter().getDocumentStatus(input()));
    expect(error.code).toBe("ELECTRONIC_DOCUMENT_STATUS_INVALID_PROVIDER_RESPONSE");
    expect(JSON.stringify(error)).not.toContain(raw);
  });

  it("never exposes credentials, URL, identity, raw body, or underlying errors", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("raw-network-secret"));
    const error = await capture(adapter().getDocumentStatus(input()));
    const serialized = JSON.stringify(error);
    for (const secret of [
      "raw-network-secret", "secret", "https://api.facturaencr.com", DOCUMENT_ID,
      KEY, CONSECUTIVE, "X-API-Key",
    ]) expect(serialized).not.toContain(secret);
  });

  it("has no import-time request or forbidden infrastructure behavior", () => {
    const fetchMock = mockFetch(response(200, detail()));
    adapter();
    expect(fetchMock).not.toHaveBeenCalled();
    const source = readFileSync(require.resolve("./factura-en-cr-document-status.adapter"), "utf8");
    expect(source).not.toMatch(/Prisma|Redis|Worker|BullMQ|setInterval|refresh|webhook|xml|pdf|email|CxC|accounting/i);
  });
});

function input(override: Partial<ElectronicDocumentStatusLookupInput> = {}): ElectronicDocumentStatusLookupInput {
  return {
    providerDocumentId: DOCUMENT_ID,
    expectedHaciendaKey: KEY,
    expectedConsecutive: CONSECUTIVE,
    expectedProviderEnvironment: "sandbox",
    expectedFiscalIssueDate: "2026-07-24",
    expectedDocumentType: "01",
    ...override,
  };
}

function detail(override: Record<string, unknown> = {}) {
  return {
    documentId: DOCUMENT_ID,
    clave: KEY,
    consecutivo: CONSECUTIVE,
    documentType: "01",
    status: "queued",
    environment: "sandbox",
    issueDate: "2026-07-25T01:07:52.079Z",
    haciendaMessage: null,
    ...override,
  };
}

function values(overrides: Record<string, unknown> = {}) {
  return {
    FACTURA_EN_CR_API_KEY: "key",
    FACTURA_EN_CR_API_SECRET: "secret",
    FACTURA_EN_CR_BASE_URL: "https://api.facturaencr.com/v2/efactura",
    FACTURA_EN_CR_TIMEOUT_MS: "5000",
    ...overrides,
  };
}

function adapter(overrides: Record<string, unknown> = {}) {
  const config = values(overrides);
  return new FacturaEnCrDocumentStatusAdapter({
    get: jest.fn((key: string, fallback: unknown) =>
      config[key as keyof typeof config] ?? fallback),
  } as unknown as ConfigService);
}

function response(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function mockFetch(value: Response) {
  return jest.spyOn(global, "fetch").mockResolvedValue(value);
}

async function capture(promise: Promise<unknown>) {
  try {
    await promise;
    throw new Error("expected error");
  } catch (error) {
    expect(error).toBeInstanceOf(ElectronicDocumentStatusError);
    return error as ElectronicDocumentStatusError;
  }
}

async function expectError(promise: Promise<unknown>, code: string) {
  const error = await capture(promise);
  expect(error.code).toBe(code);
  expect(error.message).not.toBe(code);
}

function expectInvalid(promise: Promise<unknown>) {
  return expectError(promise, "ELECTRONIC_DOCUMENT_STATUS_INVALID_PROVIDER_RESPONSE");
}
