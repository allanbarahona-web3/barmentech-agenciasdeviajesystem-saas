import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Decimal } from "@prisma/client/runtime/library";
import { CabysCatalogProvider, CabysProviderError, CabysProviderItem } from "./cabys-catalog.provider";

const DEFAULT_BASE_URL = "https://api.facturaencr.com/v2/efactura";
const DEFAULT_TIMEOUT_MS = 5000;

@Injectable()
export class FacturaEnCrCabysProvider implements CabysCatalogProvider {
  constructor(private readonly config: ConfigService) {}

  async search(query: string, top: number): Promise<CabysProviderItem[]> {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 3 || !Number.isInteger(top) || top < 1 || top > 50) {
      throw new CabysProviderError("CABYS_PROVIDER_INVALID_RESPONSE");
    }
    return this.request(trimmedQuery, top);
  }

  async findExact(code: string): Promise<CabysProviderItem | null> {
    const items = await this.request(code, 1);
    return items.find((item) => item.code === code) ?? null;
  }

  private credentials(): { apiKey: string; apiSecret: string } {
    const apiKey = this.config.get<string>("FACTURA_EN_CR_API_KEY", "").trim();
    const apiSecret = this.config.get<string>("FACTURA_EN_CR_API_SECRET", "").trim();
    if (!apiKey || !apiSecret) throw new CabysProviderError("CABYS_PROVIDER_UNAVAILABLE");
    return { apiKey, apiSecret };
  }

  private timeoutMs(): number {
    const raw = this.config.get<string>("FACTURA_EN_CR_TIMEOUT_MS", String(DEFAULT_TIMEOUT_MS));
    const timeout = Number(raw);
    if (!Number.isInteger(timeout) || timeout < 100 || timeout > 30000) throw new CabysProviderError("CABYS_PROVIDER_UNAVAILABLE");
    return timeout;
  }

  private async request(query: string, top: number): Promise<CabysProviderItem[]> {
    const { apiKey, apiSecret } = this.credentials();
    const baseUrl = this.config.get<string>("FACTURA_EN_CR_BASE_URL", DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
    if (!baseUrl) throw new CabysProviderError("CABYS_PROVIDER_UNAVAILABLE");
    let url: URL;
    try { url = new URL(`${baseUrl}/catalogs/cabys`); } catch { throw new CabysProviderError("CABYS_PROVIDER_UNAVAILABLE"); }
    url.searchParams.set("q", query);
    url.searchParams.set("top", String(top));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      const response = await fetch(url, { method: "GET", headers: { "X-API-Key": apiKey, "X-API-Secret": apiSecret }, signal: controller.signal });
      if (response.status === 429) throw new CabysProviderError("CABYS_PROVIDER_RATE_LIMITED");
      if (response.status === 401 || response.status === 403 || response.status >= 500) throw new CabysProviderError("CABYS_PROVIDER_UNAVAILABLE");
      if (!response.ok) throw new CabysProviderError("CABYS_PROVIDER_UNAVAILABLE");
      let body: unknown;
      try { body = await response.json(); } catch { throw new CabysProviderError("CABYS_PROVIDER_INVALID_RESPONSE"); }
      return this.parseResponse(body);
    } catch (error) {
      if (error instanceof CabysProviderError) throw error;
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) throw new CabysProviderError("CABYS_PROVIDER_TIMEOUT");
      throw new CabysProviderError("CABYS_PROVIDER_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseResponse(value: unknown): CabysProviderItem[] {
    if (typeof value !== "object" || value === null || !("items" in value) || !Array.isArray(value.items)) {
      throw new CabysProviderError("CABYS_PROVIDER_INVALID_RESPONSE");
    }
    return value.items.map((raw): CabysProviderItem => {
      if (typeof raw !== "object" || raw === null) throw new CabysProviderError("CABYS_PROVIDER_INVALID_RESPONSE");
      const item = raw as Record<string, unknown>;
      if (typeof item.codigo !== "string" || !/^\d{13}$/.test(item.codigo)) throw new CabysProviderError("CABYS_PROVIDER_INVALID_RESPONSE");
      if (typeof item.descripcion !== "string" || !item.descripcion.trim()) throw new CabysProviderError("CABYS_PROVIDER_INVALID_RESPONSE");
      if ((typeof item.impuesto !== "number" && typeof item.impuesto !== "string") || (typeof item.impuesto === "number" && !Number.isFinite(item.impuesto))) throw new CabysProviderError("CABYS_PROVIDER_INVALID_RESPONSE");
      try {
        const percentage = new Decimal(String(item.impuesto));
        if (!percentage.isFinite() || percentage.isNegative() || percentage.greaterThan("999.9999") || percentage.decimalPlaces() > 4) throw new Error();
        return { code: item.codigo, description: item.descripcion.trim(), referenceTaxPercentage: percentage.toFixed(4) };
      } catch {
        throw new CabysProviderError("CABYS_PROVIDER_INVALID_RESPONSE");
      }
    });
  }
}
