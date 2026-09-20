import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CostingProjectCurrentCostReader, type CostingProjectCurrentCostTransaction } from "../cost-engine/costing-project-current-cost-reader";
import { pricingAmountsEqual } from "../pricing/pricing-v1-calculator";
import { runTenantTransaction } from "../tenant/tenant-transaction";

type Actor = { userId: string; name: string };
type TravelSourceType = "TRAVEL_PACKAGE" | "INTERNAL_TRIP";

type TravelPricingTransaction = CostingProjectCurrentCostTransaction & {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  pricingCalculationVersion: Record<string, (...args: any[]) => Promise<any>>;
  travelPackage: Record<string, (...args: any[]) => Promise<any>>;
  internalTrip: Record<string, (...args: any[]) => Promise<any>>;
  travelPackageCostingProjectLink: Record<string, (...args: any[]) => Promise<any>>;
  internalTripCostingProjectLink: Record<string, (...args: any[]) => Promise<any>>;
  travelPackagePricingPublication: Record<string, (...args: any[]) => Promise<any>>;
  internalTripPricingPublication: Record<string, (...args: any[]) => Promise<any>>;
};

type TravelPricingDatabase = {
  $transaction<T>(work: (transaction: TravelPricingTransaction) => Promise<T>): Promise<T>;
};

type Source = {
  type: TravelSourceType;
  id: string;
  name: string;
  currentCommercialPrice: string | null;
  currency: string;
};

@Injectable()
export class TravelPricingService {
  private readonly database: TravelPricingDatabase;

  constructor(prisma: PrismaService, private readonly currentCosts: CostingProjectCurrentCostReader) {
    this.database = prisma as unknown as TravelPricingDatabase;
  }

  getPublicationContext(tenantId: string, costingProjectId: string) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      const currentCost = await this.currentCosts.read(tx, tenantId, costingProjectId);
      const source = await this.resolveSource(tx, tenantId, costingProjectId);
      const latest = await this.findLatestPublication(tx, tenantId, source);
      return publicationContext(source, currentCost.baseCurrency, latest);
    });
  }

  publish(tenantId: string, pricingCalculationVersionId: string, actor: Actor) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "pricing_calculation_versions"
        WHERE "id" = ${pricingCalculationVersionId} AND "tenantId" = ${tenantId}
        FOR UPDATE
      `;
      if (locked.length !== 1) throw new NotFoundException("La versión de pricing no existe.");

      const version = await tx.pricingCalculationVersion.findFirst({ where: { id: pricingCalculationVersionId, tenantId } });
      if (!version) throw new NotFoundException("La versión de pricing no existe.");
      if (version.status !== "APPROVED") throw new ConflictException("Solo una versión de pricing aprobada puede publicarse.");

      const source = await this.resolveSource(tx, tenantId, version.costingProjectId, true);
      const duplicate = await this.findPublicationForVersion(tx, tenantId, source.type, version.id);
      if (duplicate) return publicationResponse(source, duplicate, true);

      const currentCost = await this.currentCosts.read(tx, tenantId, version.costingProjectId);
      if (!pricingAmountsEqual(decimalString(version.authoritativeCostAmount), currentCost.authoritativeTotalCost)) {
        throw new ConflictException("Los costos cambiaron desde este cálculo. Recalcula y aprueba una nueva versión antes de publicar.");
      }
      if (version.currency !== currentCost.baseCurrency) {
        throw new ConflictException("La moneda de pricing no coincide con la moneda base del proyecto.");
      }
      if (source.currency !== version.currency) {
        throw new ConflictException("La moneda de pricing no coincide con la moneda comercial del viaje.");
      }

      const latest = await this.findLatestPublication(tx, tenantId, source);
      const recommendedPrice = decimalString(version.finalSellingPrice);
      const floor = latest ? decimalString(latest.commercialFloorPrice) : recommendedPrice;
      if (decimalComparison(recommendedPrice, floor) < 0) {
        throw new ConflictException(`El precio aprobado está por debajo del piso comercial de ${version.currency} ${floor}.`);
      }

      const published = await this.publishToSource(tx, tenantId, source, version, floor, actor);
      return publicationResponse({ ...source, currentCommercialPrice: recommendedPrice }, published, false);
    });
  }

  private async resolveSource(tx: TravelPricingTransaction, tenantId: string, costingProjectId: string, lock = false): Promise<Source> {
    if (lock) {
      await tx.$queryRaw`
        SELECT "id" FROM "travel_package_costing_project_links"
        WHERE "tenantId" = ${tenantId} AND "costingProjectId" = ${costingProjectId}
        FOR UPDATE
      `;
      await tx.$queryRaw`
        SELECT "id" FROM "internal_trip_costing_project_links"
        WHERE "tenantId" = ${tenantId} AND "costingProjectId" = ${costingProjectId}
        FOR UPDATE
      `;
    }

    const [packageLink, tripLink] = await Promise.all([
      tx.travelPackageCostingProjectLink.findFirst({
        where: { tenantId, costingProjectId },
        select: { travelPackage: { select: { id: true, name: true, packagePrice: true, priceCurrency: true } } },
      }),
      tx.internalTripCostingProjectLink.findFirst({
        where: { tenantId, costingProjectId },
        select: { internalTrip: { select: { id: true, name: true, price: true, currency: true } } },
      }),
    ]);
    if (packageLink && tripLink) throw new ConflictException("El proyecto de costos tiene más de un origen de viaje.");
    if (packageLink?.travelPackage) {
      const travel = packageLink.travelPackage;
      return { type: "TRAVEL_PACKAGE", id: travel.id, name: travel.name, currentCommercialPrice: travel.packagePrice === null ? null : decimalString(travel.packagePrice), currency: travel.priceCurrency };
    }
    if (tripLink?.internalTrip) {
      const travel = tripLink.internalTrip;
      return { type: "INTERNAL_TRIP", id: travel.id, name: travel.name, currentCommercialPrice: travel.price === null ? null : decimalString(travel.price), currency: travel.currency };
    }
    throw new NotFoundException("El proyecto de costos no está vinculado a un viaje publicable.");
  }

  private findLatestPublication(tx: TravelPricingTransaction, tenantId: string, source: Source) {
    const orderBy = [{ publishedAt: "desc" }, { id: "desc" }];
    return source.type === "TRAVEL_PACKAGE"
      ? tx.travelPackagePricingPublication.findFirst({ where: { tenantId, travelPackageId: source.id }, orderBy })
      : tx.internalTripPricingPublication.findFirst({ where: { tenantId, internalTripId: source.id }, orderBy });
  }

  private findPublicationForVersion(tx: TravelPricingTransaction, tenantId: string, sourceType: TravelSourceType, pricingCalculationVersionId: string) {
    return sourceType === "TRAVEL_PACKAGE"
      ? tx.travelPackagePricingPublication.findFirst({ where: { tenantId, pricingCalculationVersionId } })
      : tx.internalTripPricingPublication.findFirst({ where: { tenantId, pricingCalculationVersionId } });
  }

  private async publishToSource(tx: TravelPricingTransaction, tenantId: string, source: Source, version: any, commercialFloorPrice: string, actor: Actor) {
    const publishedPrice = decimalString(version.finalSellingPrice);
    if (source.type === "TRAVEL_PACKAGE") {
      const updated = await tx.travelPackage.updateMany({ where: { id: source.id, tenantId }, data: { packagePrice: publishedPrice, priceCurrency: version.currency } });
      if (updated.count !== 1) throw new NotFoundException("El paquete de viaje no existe.");
      return tx.travelPackagePricingPublication.create({
        data: { tenantId, travelPackageId: source.id, costingProjectId: version.costingProjectId, pricingCalculationVersionId: version.id, publishedPrice, currency: version.currency, commercialFloorPrice, publishedByUserId: actor.userId, publishedByName: actor.name },
      });
    }
    const updated = await tx.internalTrip.updateMany({ where: { id: source.id, tenantId }, data: { price: publishedPrice, currency: version.currency } });
    if (updated.count !== 1) throw new NotFoundException("El viaje interno no existe.");
    return tx.internalTripPricingPublication.create({
      data: { tenantId, internalTripId: source.id, costingProjectId: version.costingProjectId, pricingCalculationVersionId: version.id, publishedPrice, currency: version.currency, commercialFloorPrice, publishedByUserId: actor.userId, publishedByName: actor.name },
    });
  }

  private withTenantTransaction<T>(tenantId: string, work: (tx: TravelPricingTransaction) => Promise<T>) {
    return runTenantTransaction(this.database, tenantId, work);
  }
}

function publicationContext(source: Source, baseCurrency: string, latest: any) {
  return {
    sourceType: source.type,
    travelName: source.name,
    currency: source.currency,
    baseCurrency,
    currentCommercialPrice: source.currentCommercialPrice,
    commercialPriceStatus: latest
      ? "PRICING_PUBLISHED"
      : source.currentCommercialPrice === null
        ? "PENDING"
        : "LEGACY",
    commercialFloorPrice: latest ? decimalString(latest.commercialFloorPrice) : null,
    latestPublication: latest ? publicationSummary(latest) : null,
  };
}

function publicationResponse(source: Source, publication: any, idempotent: boolean) {
  return {
    sourceType: source.type,
    travelName: source.name,
    currentCommercialPrice: decimalString(publication.publishedPrice),
    commercialPriceStatus: "PRICING_PUBLISHED",
    currency: publication.currency,
    commercialFloorPrice: decimalString(publication.commercialFloorPrice),
    publication: publicationSummary(publication),
    idempotent,
  };
}

function publicationSummary(publication: any) {
  return {
    id: publication.id,
    pricingCalculationVersionId: publication.pricingCalculationVersionId,
    publishedPrice: decimalString(publication.publishedPrice),
    currency: publication.currency,
    commercialFloorPrice: decimalString(publication.commercialFloorPrice),
    publishedAt: publication.publishedAt,
    publishedBy: { userId: publication.publishedByUserId, name: publication.publishedByName },
  };
}

function decimalString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toString" in value) return String(value);
  throw new BadRequestException("Valor monetario persistido inválido.");
}

function decimalComparison(left: string, right: string): number {
  const normalized = (value: string) => {
    const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
    if (!match) throw new BadRequestException("Valor monetario persistido inválido.");
    return { whole: match[1].replace(/^0+(?=\d)/, ""), fraction: match[2] ?? "" };
  };
  const first = normalized(left); const second = normalized(right);
  if (first.whole.length !== second.whole.length) return first.whole.length > second.whole.length ? 1 : -1;
  if (first.whole !== second.whole) return first.whole > second.whole ? 1 : -1;
  const scale = Math.max(first.fraction.length, second.fraction.length);
  const firstFraction = first.fraction.padEnd(scale, "0"); const secondFraction = second.fraction.padEnd(scale, "0");
  return firstFraction === secondFraction ? 0 : firstFraction > secondFraction ? 1 : -1;
}
