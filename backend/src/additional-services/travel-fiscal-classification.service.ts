import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export const TRAVEL_FISCAL_CLASSIFICATION_USAGES = [
  "TRAVEL_PACKAGE",
  "INTERNAL_TRIP",
] as const;

export type TravelFiscalClassificationUsage =
  (typeof TRAVEL_FISCAL_CLASSIFICATION_USAGES)[number];

type ClassificationValidationRow = {
  id: string;
  isActive: boolean;
  usageAllowed: boolean;
  fiscalProfileId: string | null;
  fiscalProfileActive: boolean | null;
};

export type TravelFiscalClassificationOption = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  fiscalItemCategory: string;
  cabysCode: string;
  unitOfMeasureCode: string;
  taxCode: string | null;
  taxRateCode: string | null;
  taxPercentage: Prisma.Decimal | null;
};

@Injectable()
export class TravelFiscalClassificationService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(
    tenantId: string,
    catalogId: string,
    usage: TravelFiscalClassificationUsage,
  ): Promise<string> {
    const normalizedCatalogId = String(catalogId || "").trim();
    if (!normalizedCatalogId) {
      throw new NotFoundException("TRAVEL_FISCAL_CLASSIFICATION_NOT_FOUND");
    }

    const rows = await this.prisma.$queryRaw<ClassificationValidationRow[]>(
      Prisma.sql`
        SELECT
          catalog."id",
          catalog."isActive" AS "isActive",
          EXISTS (
            SELECT 1
            FROM "additional_service_catalog_usages" usage
            WHERE usage."tenantId" = catalog."tenantId"
              AND usage."catalogId" = catalog."id"
              AND usage."usage" = CAST(${usage} AS "AdditionalServiceCatalogUsageType")
          ) AS "usageAllowed",
          profile."id" AS "fiscalProfileId",
          profile."isActive" AS "fiscalProfileActive"
        FROM "additional_service_catalogs" catalog
        LEFT JOIN "additional_service_fiscal_profiles" profile
          ON profile."tenantId" = catalog."tenantId"
         AND profile."additionalServiceCatalogId" = catalog."id"
        WHERE catalog."tenantId" = ${tenantId}
          AND catalog."id" = ${normalizedCatalogId}
        LIMIT 1
      `,
    );

    const classification = rows[0];
    if (!classification) {
      throw new NotFoundException("TRAVEL_FISCAL_CLASSIFICATION_NOT_FOUND");
    }
    if (!classification.isActive) {
      throw new BadRequestException("TRAVEL_FISCAL_CLASSIFICATION_INACTIVE");
    }
    if (!classification.usageAllowed) {
      throw new BadRequestException(
        "TRAVEL_FISCAL_CLASSIFICATION_USAGE_INCOMPATIBLE",
      );
    }
    if (!classification.fiscalProfileId) {
      throw new BadRequestException(
        "TRAVEL_FISCAL_CLASSIFICATION_PROFILE_MISSING",
      );
    }
    if (!classification.fiscalProfileActive) {
      throw new BadRequestException(
        "TRAVEL_FISCAL_CLASSIFICATION_PROFILE_INACTIVE",
      );
    }

    return classification.id;
  }

  async list(
    tenantId: string,
    usage: TravelFiscalClassificationUsage,
  ): Promise<TravelFiscalClassificationOption[]> {
    return this.prisma.$queryRaw<TravelFiscalClassificationOption[]>(
      Prisma.sql`
        SELECT
          catalog."id",
          catalog."code",
          catalog."name",
          catalog."description",
          catalog."fiscalItemCategory"::text AS "fiscalItemCategory",
          profile."cabysCode",
          profile."unitOfMeasureCode",
          profile."taxCode",
          profile."taxRateCode",
          profile."taxPercentage"
        FROM "additional_service_catalog_usages" usage
        INNER JOIN "additional_service_catalogs" catalog
          ON catalog."tenantId" = usage."tenantId"
         AND catalog."id" = usage."catalogId"
        INNER JOIN "additional_service_fiscal_profiles" profile
          ON profile."tenantId" = catalog."tenantId"
         AND profile."additionalServiceCatalogId" = catalog."id"
        WHERE usage."tenantId" = ${tenantId}
          AND usage."usage" = CAST(${usage} AS "AdditionalServiceCatalogUsageType")
          AND catalog."isActive" = TRUE
          AND profile."isActive" = TRUE
        ORDER BY catalog."displayOrder" ASC, catalog."name" ASC
      `,
    );
  }
}

export function requireTravelFiscalClassificationUsage(
  value: unknown,
): TravelFiscalClassificationUsage {
  if (value !== "TRAVEL_PACKAGE" && value !== "INTERNAL_TRIP") {
    throw new BadRequestException(
      "TRAVEL_FISCAL_CLASSIFICATION_USAGE_INVALID",
    );
  }
  return value;
}
