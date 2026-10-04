import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { pricingAmountsEqual } from "../pricing/pricing-v1-calculator";
import { runTenantTransaction } from "../tenant/tenant-transaction";

export type TravelPackagePublishedPricingTransaction = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  travelPackage: Record<string, (...args: any[]) => Promise<any>>;
  travelPackagePricingPublication: Record<string, (...args: any[]) => Promise<any>>;
};

type ReaderDatabase = {
  $transaction<T>(work: (transaction: TravelPackagePublishedPricingTransaction) => Promise<T>): Promise<T>;
};

const PUBLISHED_TRAVEL_PACKAGE_UNIT_SCOPE = "PER_PERSON" as const;
type PublishedTravelPackageUnitScope = typeof PUBLISHED_TRAVEL_PACKAGE_UNIT_SCOPE;

export type TravelPackageCommercialPrice =
  | {
    kind: "PRICING_PUBLISHED";
    travelPackageId: string;
    publicationId: string;
    costingProjectId: string;
    pricingCalculationVersionId: string;
    perPersonSellingPrice: string;
    currency: string;
    unitScope: PublishedTravelPackageUnitScope;
    commercialFloorPrice: string;
  }
  | {
    kind: "LEGACY";
    travelPackageId: string;
    packagePrice: string;
    currency: string;
  };

/** Neutral Contract read boundary for the current published TravelPackage price. */
@Injectable()
export class TravelPackagePublishedPricingReader {
  private readonly database: ReaderDatabase;

  constructor(prisma: PrismaService) {
    this.database = prisma as unknown as ReaderDatabase;
  }

  read(tenantId: string, travelPackageId: string): Promise<TravelPackageCommercialPrice> {
    return runTenantTransaction(this.database, tenantId, (tx) =>
      this.readInTransaction(tx, tenantId, travelPackageId),
    );
  }

  /** Reads the identical published-price authority inside an existing tenant transaction. */
  async readInTransaction(
    tx: TravelPackagePublishedPricingTransaction,
    tenantId: string,
    travelPackageId: string,
  ): Promise<TravelPackageCommercialPrice> {
    const travelPackage = await tx.travelPackage.findFirst({
      where: { id: travelPackageId, tenantId },
      select: { id: true, packagePrice: true, priceCurrency: true },
    });
    if (!travelPackage) throw new NotFoundException("TRAVEL_PACKAGE_COMMERCIAL_SOURCE_NOT_FOUND");
    if (travelPackage.packagePrice === null) throw new BadRequestException("TRAVEL_PACKAGE_COMMERCIAL_PRICE_UNAVAILABLE");

    const publication = await tx.travelPackagePricingPublication.findFirst({
      where: { tenantId, travelPackageId },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        costingProjectId: true,
        pricingCalculationVersionId: true,
        publishedPrice: true,
        currency: true,
        commercialFloorPrice: true,
      },
    });
    if (!publication) {
      return {
        kind: "LEGACY",
        travelPackageId: travelPackage.id,
        packagePrice: decimalString(travelPackage.packagePrice),
        currency: travelPackage.priceCurrency,
      };
    }
    if (
      travelPackage.priceCurrency !== publication.currency ||
      !pricingAmountsEqual(decimalString(travelPackage.packagePrice), decimalString(publication.publishedPrice))
    ) {
      throw new ConflictException("TRAVEL_PACKAGE_PUBLISHED_PRICING_STATE_INVALID");
    }
    return {
      kind: "PRICING_PUBLISHED",
      travelPackageId: travelPackage.id,
      publicationId: publication.id,
      costingProjectId: publication.costingProjectId,
      pricingCalculationVersionId: publication.pricingCalculationVersionId,
      perPersonSellingPrice: decimalString(publication.publishedPrice),
      currency: publication.currency,
      unitScope: PUBLISHED_TRAVEL_PACKAGE_UNIT_SCOPE,
      commercialFloorPrice: decimalString(publication.commercialFloorPrice),
    };
  }
}

function decimalString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toString" in value) return String(value);
  throw new BadRequestException("TRAVEL_PACKAGE_COMMERCIAL_PRICE_INVALID");
}
