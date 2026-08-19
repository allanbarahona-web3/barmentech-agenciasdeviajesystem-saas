import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  FacturaEnCrNumberingProvider,
  FacturaEnCrNumberingProviderError,
  ProviderNumberingConfiguration,
  ProviderNumberingInput,
  ProviderNumberingVerification,
  ProviderNumberingVerificationInput,
} from "./factura-en-cr-numbering.provider";

const DEFAULT_BASE_URL = "https://api.facturaencr.com/v2/efactura";
const DEFAULT_TIMEOUT_MS = 5000;

@Injectable()
export class FacturaEnCrNumberingAdapter
  implements FacturaEnCrNumberingProvider
{
  constructor(private readonly config: ConfigService) {}

  async configureIntegratorMode(
    input: ProviderNumberingInput,
  ): Promise<ProviderNumberingConfiguration> {
    const response = await this.request(
      `/emisores/${encodeURIComponent(input.legalId)}/config`,
      {
        method: "PATCH",
        body: JSON.stringify({
          consecutivoMode: "integrator",
          branchCode: input.branchCode,
          terminalCode: input.terminalCode,
        }),
      },
    );
    return parseConfiguration(response);
  }

  async verifyIntegratorMode(
    input: ProviderNumberingVerificationInput,
  ): Promise<ProviderNumberingVerification> {
    const query = new URLSearchParams({
      codeDoc: input.documentTypeCode,
      branchCode: input.branchCode,
      terminalCode: input.terminalCode,
    });
    const response = await this.request(
      `/emisores/${encodeURIComponent(input.legalId)}/consecutivo/next?${query.toString()}`,
      { method: "GET" },
    );
    return parseVerification(response);
  }

  private credentials() {
    const apiKey = this.config
      .get<string>("FACTURA_EN_CR_API_KEY", "")
      .trim();
    const apiSecret = this.config
      .get<string>("FACTURA_EN_CR_API_SECRET", "")
      .trim();
    if (!apiKey || !apiSecret) {
      throw new FacturaEnCrNumberingProviderError(
        "PROVIDER_NUMBERING_CONFIGURATION_MISSING",
      );
    }
    return { apiKey, apiSecret };
  }

  private timeoutMs() {
    const raw = this.config.get<string>(
      "FACTURA_EN_CR_TIMEOUT_MS",
      String(DEFAULT_TIMEOUT_MS),
    );
    const timeout = Number(raw);
    if (!Number.isInteger(timeout) || timeout < 100 || timeout > 30000) {
      throw new FacturaEnCrNumberingProviderError(
        "PROVIDER_NUMBERING_CONFIGURATION_MISSING",
      );
    }
    return timeout;
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const { apiKey, apiSecret } = this.credentials();
    const baseUrl = this.config
      .get<string>("FACTURA_EN_CR_BASE_URL", DEFAULT_BASE_URL)
      .trim()
      .replace(/\/+$/, "");
    if (!baseUrl) {
      throw new FacturaEnCrNumberingProviderError(
        "PROVIDER_NUMBERING_CONFIGURATION_MISSING",
      );
    }

    let url: URL;
    try {
      url = new URL(`${baseUrl}${path}`);
    } catch {
      throw new FacturaEnCrNumberingProviderError(
        "PROVIDER_NUMBERING_CONFIGURATION_MISSING",
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          "X-API-Key": apiKey,
          "X-API-Secret": apiSecret,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
      if (response.status === 404) {
        throw new FacturaEnCrNumberingProviderError(
          "PROVIDER_NUMBERING_ISSUER_NOT_FOUND",
        );
      }
      if (response.status === 409 || response.status === 400) {
        throw new FacturaEnCrNumberingProviderError(
          "PROVIDER_NUMBERING_CONFIGURATION_CONFLICT",
        );
      }
      if (response.status === 429) {
        throw new FacturaEnCrNumberingProviderError(
          "PROVIDER_NUMBERING_RATE_LIMITED",
        );
      }
      if (!response.ok) {
        throw new FacturaEnCrNumberingProviderError(
          "PROVIDER_NUMBERING_UNAVAILABLE",
        );
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new FacturaEnCrNumberingProviderError(
          "PROVIDER_NUMBERING_INVALID_RESPONSE",
        );
      }
      return body;
    } catch (error) {
      if (error instanceof FacturaEnCrNumberingProviderError) throw error;
      if (
        controller.signal.aborted ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        throw new FacturaEnCrNumberingProviderError(
          "PROVIDER_NUMBERING_TIMEOUT",
        );
      }
      throw new FacturaEnCrNumberingProviderError(
        "PROVIDER_NUMBERING_UNAVAILABLE",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalidResponse();
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || !value) invalidResponse();
  return value as string;
}

function patternedString(value: unknown, pattern: RegExp): string {
  const result = requiredString(value);
  if (!pattern.test(result)) invalidResponse();
  return result;
}

function mode(value: unknown): "integrator" | "platform" {
  if (value !== "integrator" && value !== "platform") invalidResponse();
  return value;
}

function safeCounter(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    invalidResponse();
  }
  return value as number;
}

function parseConfiguration(value: unknown): ProviderNumberingConfiguration {
  const body = record(value);
  const config = record(body.config);
  const applied = safeCounter(body.appliedToCertificates);
  return {
    legalId: patternedString(body.legalId, /^[0-9A-Za-z]{9,12}$/),
    mode: mode(config.consecutivoMode),
    branchCode: patternedString(config.branchCode, /^\d{3}$/),
    terminalCode: patternedString(config.terminalCode, /^\d{5}$/),
    appliedToCertificates: applied,
  };
}

function parseVerification(value: unknown): ProviderNumberingVerification {
  const body = record(value);
  const nextConsecutivo20 = requiredString(body.nextConsecutivo20);
  if (!/^[0-9A-Za-z]{20}$/.test(nextConsecutivo20)) invalidResponse();
  return {
    legalId: patternedString(body.legalId, /^[0-9A-Za-z]{9,12}$/),
    documentTypeCode: patternedString(body.codeDoc, /^\d{2}$/),
    branchCode: patternedString(body.branchCode, /^\d{3}$/),
    terminalCode: patternedString(body.terminalCode, /^\d{5}$/),
    mode: mode(body.mode),
    currentNumber: safeCounter(body.currentNumber),
    nextNumber: safeCounter(body.nextNumber),
    nextConsecutivo20,
  };
}

function invalidResponse(): never {
  throw new FacturaEnCrNumberingProviderError(
    "PROVIDER_NUMBERING_INVALID_RESPONSE",
  );
}
