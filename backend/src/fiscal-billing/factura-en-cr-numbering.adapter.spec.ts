import { ConfigService } from "@nestjs/config";
import { FacturaEnCrNumberingAdapter } from "./factura-en-cr-numbering.adapter";

const values: Record<string, string> = {
  FACTURA_EN_CR_API_KEY: "private-key",
  FACTURA_EN_CR_API_SECRET: "private-secret",
  FACTURA_EN_CR_BASE_URL: "https://provider.test/v2/efactura",
  FACTURA_EN_CR_TIMEOUT_MS: "100",
};

function adapter(overrides: Record<string, string> = {}) {
  const current = { ...values, ...overrides };
  const config = {
    get: jest.fn((key: string, fallback: string) => current[key] ?? fallback),
  };
  return { adapter: new FacturaEnCrNumberingAdapter(config as unknown as ConfigService), config };
}

const configured = {
  legalId: "3101678166",
  config: {
    consecutivoMode: "integrator",
    branchCode: "001",
    terminalCode: "00001",
  },
  appliedToCertificates: 1,
};

const verified = {
  legalId: "3101678166",
  codeDoc: "01",
  branchCode: "001",
  terminalCode: "00001",
  mode: "integrator",
  currentNumber: 866,
  nextNumber: 867,
  nextConsecutivo20: "00100001010000000867",
  note: "not exposed",
};

describe("FacturaEnCrNumberingAdapter", () => {
  afterEach(() => jest.restoreAllMocks());

  it("sends the exact integrator PATCH contract", async () => {
    const fetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(configured), { status: 200 }),
    );
    await adapter().adapter.configureIntegratorMode({
      legalId: "3101678166",
      branchCode: "001",
      terminalCode: "00001",
    });
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe(
      "https://provider.test/v2/efactura/emisores/3101678166/config",
    );
    expect(init).toMatchObject({
      method: "PATCH",
      headers: {
        "X-API-Key": "private-key",
        "X-API-Secret": "private-secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        consecutivoMode: "integrator",
        branchCode: "001",
        terminalCode: "00001",
      }),
    });
  });

  it("encodes the legal ID and exact verification query", async () => {
    const fetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(verified), { status: 200 }),
    );
    await adapter().adapter.verifyIntegratorMode({
      legalId: "3101678166",
      branchCode: "001",
      terminalCode: "00001",
      documentTypeCode: "01",
    });
    expect(String(fetch.mock.calls[0][0])).toBe(
      "https://provider.test/v2/efactura/emisores/3101678166/consecutivo/next?codeDoc=01&branchCode=001&terminalCode=00001",
    );
  });

  it("loads credentials lazily", () => {
    const context = adapter();
    expect(context.config.get).not.toHaveBeenCalled();
  });

  it("maps aborts to a safe timeout without credentials", async () => {
    jest.spyOn(globalThis, "fetch").mockImplementation((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("private-secret", "AbortError")),
        );
      }),
    );
    const error = await adapter().adapter
      .configureIntegratorMode({
        legalId: "3101678166",
        branchCode: "001",
        terminalCode: "00001",
      })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "PROVIDER_NUMBERING_TIMEOUT" });
    expect(String(error)).not.toContain("private-secret");
  });

  it("rejects malformed configuration responses", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ...configured, appliedToCertificates: -1 }), {
        status: 200,
      }),
    );
    await expect(
      adapter().adapter.configureIntegratorMode({
        legalId: "3101678166",
        branchCode: "001",
        terminalCode: "00001",
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_NUMBERING_INVALID_RESPONSE" });
  });

  it.each([[-1], [1.5], [Number.MAX_SAFE_INTEGER + 1], ["1"]])(
    "rejects unsafe counter %p",
    async (currentNumber) => {
      jest.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ ...verified, currentNumber }), {
          status: 200,
        }),
      );
      await expect(
        adapter().adapter.verifyIntegratorMode({
          legalId: "3101678166",
          branchCode: "001",
          terminalCode: "00001",
          documentTypeCode: "01",
        }),
      ).rejects.toMatchObject({ code: "PROVIDER_NUMBERING_INVALID_RESPONSE" });
    },
  );

  it("preserves the 20-character consecutive as a string", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(verified), { status: 200 }),
    );
    const result = await adapter().adapter.verifyIntegratorMode({
      legalId: "3101678166",
      branchCode: "001",
      terminalCode: "00001",
      documentTypeCode: "01",
    });
    expect(result.nextConsecutivo20).toBe("00100001010000000867");
    expect(typeof result.nextConsecutivo20).toBe("string");
  });

  it("rejects malformed verification fields", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ...verified, terminalCode: "1" }), {
        status: 200,
      }),
    );
    await expect(
      adapter().adapter.verifyIntegratorMode({
        legalId: "3101678166",
        branchCode: "001",
        terminalCode: "00001",
        documentTypeCode: "01",
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_NUMBERING_INVALID_RESPONSE" });
  });
});
