import { ForbiddenException, HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { Decimal } from "@prisma/client/runtime/library";
import { PrismaService } from "../prisma/prisma.service";
import { CABYS_CATALOG_PROVIDER, CabysCatalogProvider, CabysProviderItem } from "./cabys-catalog.provider";
import { fiscalCatalogError, mapProviderError } from "./fiscal-catalog.errors";

export function normalizeCabysSearchText(value: string): string {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
}

interface CabysItemResponse extends CabysProviderItem {
  persisted: boolean;
  source: "LOCAL" | "FACTURA_EN_CR";
}

@Injectable()
export class FiscalCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CABYS_CATALOG_PROVIDER) private readonly provider: CabysCatalogProvider,
  ) {}

  private async requireCountry(tenantId: string | null | undefined): Promise<"CR"> {
    if (!tenantId) throw new ForbiddenException({ statusCode: 403, error: "TENANT_REQUIRED", code: "TENANT_REQUIRED" });
    const configuration = await this.prisma.tenantBillingConfiguration.findUnique({ where: { tenantId }, select: { countryCode: true } });
    const countryCode = configuration?.countryCode ?? "CR";
    if (countryCode !== "CR") throw fiscalCatalogError("UNSUPPORTED_COUNTRY", HttpStatus.UNPROCESSABLE_ENTITY);
    return "CR";
  }

  private async activeRelease(catalogType: "CABYS" | "ELECTRONIC_INVOICE_CODING") {
    return this.prisma.fiscalCatalogRelease.findFirst({ where: { countryCode: "CR", catalogType, status: "ACTIVE" }, select: { id: true, version: true } });
  }

  private localCabys(entry: { code: string; description: string; referenceTaxPercentage: Decimal | null }): CabysItemResponse {
    return { code: entry.code, description: entry.description, referenceTaxPercentage: entry.referenceTaxPercentage?.toFixed(4) ?? "0.0000", persisted: true, source: "LOCAL" };
  }

  async searchCabys(tenantId: string | undefined, query: string, top: number) {
    await this.requireCountry(tenantId);
    const normalized = normalizeCabysSearchText(query);
    const release = await this.activeRelease("CABYS");
    const localEntries = release ? await this.prisma.fiscalCabysEntry.findMany({
      where: { releaseId: release.id, isActive: true, OR: [{ code: { startsWith: query } }, { searchText: { contains: normalized } }] },
      select: { code: true, description: true, referenceTaxPercentage: true }, orderBy: { code: "asc" }, take: top,
    }) : [];
    const local = localEntries.map((entry) => this.localCabys(entry));
    try {
      const providerItems = await this.provider.search(query, top);
      const merged = new Map<string, CabysItemResponse>(local.map((item) => [item.code, item]));
      for (const item of providerItems) merged.set(item.code, { ...item, persisted: merged.has(item.code), source: "FACTURA_EN_CR" });
      return { items: [...merged.values()].sort((a, b) => a.code.localeCompare(b.code)).slice(0, top), meta: { query, top, mode: "LIVE" as const, degraded: false } };
    } catch (error) {
      if (local.length) return { items: local.slice(0, top), meta: { query, top, mode: "LOCAL_FALLBACK" as const, degraded: true } };
      throw mapProviderError(error);
    }
  }

  async findCabys(tenantId: string | undefined, code: string): Promise<CabysItemResponse> {
    await this.requireCountry(tenantId);
    const release = await this.activeRelease("CABYS");
    if (release) {
      const local = await this.prisma.fiscalCabysEntry.findFirst({ where: { releaseId: release.id, code, isActive: true }, select: { code: true, description: true, referenceTaxPercentage: true } });
      if (local) return this.localCabys(local);
    }
    try {
      const item = await this.provider.findExact(code);
      if (!item) throw fiscalCatalogError("CABYS_NOT_FOUND", HttpStatus.NOT_FOUND);
      return { ...item, persisted: false, source: "FACTURA_EN_CR" };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw mapProviderError(error);
    }
  }

  async confirmCabys(tenantId: string | undefined, code: string): Promise<CabysItemResponse> {
    await this.requireCountry(tenantId);
    const release = await this.activeRelease("CABYS");
    if (!release) throw fiscalCatalogError("FISCAL_CATALOG_NOT_READY", HttpStatus.SERVICE_UNAVAILABLE);
    const existing = await this.prisma.fiscalCabysEntry.findFirst({ where: { releaseId: release.id, code, isActive: true }, select: { code: true, description: true, referenceTaxPercentage: true } });
    if (existing) return this.localCabys(existing);
    let providerItem: CabysProviderItem | null;
    try { providerItem = await this.provider.findExact(code); } catch (error) { throw mapProviderError(error); }
    if (!providerItem || providerItem.code !== code) throw fiscalCatalogError("CABYS_NOT_FOUND", HttpStatus.NOT_FOUND);
    try {
      const created = await this.prisma.fiscalCabysEntry.create({ data: { releaseId: release.id, code, description: providerItem.description.trim(), searchText: normalizeCabysSearchText(`${code} ${providerItem.description}`), referenceTaxPercentage: new Decimal(providerItem.referenceTaxPercentage), includesText: null, excludesText: null, category1Code: null, category1Description: null, category2Code: null, category2Description: null, category3Code: null, category3Description: null, category4Code: null, category4Description: null, category5Code: null, category5Description: null, category6Code: null, category6Description: null, category7Code: null, category7Description: null, category8Code: null, category8Description: null, isActive: true, sourceCreatedAt: null, sourceEffectiveFrom: null, sourceDeletedAt: null }, select: { code: true, description: true, referenceTaxPercentage: true } });
      return this.localCabys(created);
    } catch (error) {
      if ((error as { code?: unknown }).code !== "P2002") throw error;
      const winner = await this.prisma.fiscalCabysEntry.findFirst({ where: { releaseId: release.id, code, isActive: true }, select: { code: true, description: true, referenceTaxPercentage: true } });
      if (!winner) throw error;
      return this.localCabys(winner);
    }
  }

  private async codingReleaseOrThrow() {
    const release = await this.activeRelease("ELECTRONIC_INVOICE_CODING");
    if (!release) throw fiscalCatalogError("FISCAL_CATALOG_NOT_READY", HttpStatus.SERVICE_UNAVAILABLE);
    return release;
  }

  async units(tenantId: string | undefined) {
    await this.requireCountry(tenantId); const release = await this.codingReleaseOrThrow();
    const items = await this.prisma.fiscalUnitOfMeasureEntry.findMany({ where: { releaseId: release.id, isActive: true }, select: { code: true, name: true }, orderBy: { code: "asc" } });
    return { items, release: { version: release.version } };
  }

  async taxes(tenantId: string | undefined) {
    await this.requireCountry(tenantId); const release = await this.codingReleaseOrThrow();
    const items = await this.prisma.fiscalTaxEntry.findMany({ where: { releaseId: release.id, isActive: true }, select: { code: true, name: true }, orderBy: { code: "asc" } });
    return { items, release: { version: release.version } };
  }

  async taxRates(tenantId: string | undefined, taxCode: string) {
    await this.requireCountry(tenantId); const release = await this.codingReleaseOrThrow();
    const tax = await this.prisma.fiscalTaxEntry.findFirst({ where: { releaseId: release.id, code: taxCode, isActive: true }, select: { id: true } });
    if (!tax) throw fiscalCatalogError("FISCAL_CATALOG_ENTRY_NOT_FOUND", HttpStatus.NOT_FOUND);
    const rates = await this.prisma.fiscalTaxRateEntry.findMany({ where: { releaseId: release.id, taxEntryId: tax.id, isActive: true }, select: { code: true, name: true, percentage: true }, orderBy: { code: "asc" } });
    return { items: rates.map((rate) => ({ code: rate.code, name: rate.name, percentage: rate.percentage.toFixed(4) })), release: { version: release.version } };
  }
}
