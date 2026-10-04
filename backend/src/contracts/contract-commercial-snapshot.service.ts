import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { Prisma, TravelPackageParticipantRole } from "@prisma/client";
import { pricingAmountsEqual } from "../pricing/pricing-v1-calculator";
import {
  TravelPackagePublishedPricingReader,
  type TravelPackagePublishedPricingTransaction,
} from "../travel-pricing/travel-package-published-pricing.reader";

export type ContractCommercialSnapshotPassengerInput = {
  travelPackageParticipantId: string;
  clientId: string;
  role: TravelPackageParticipantRole;
};

const CONTRACT_COMMERCIAL_UNIT_SCOPE = "PER_PERSON" as const;

type FreezeInput = {
  tenantId: string;
  contract: {
    id: string;
    travelPackageId: string;
    participantCount: number;
    commercialTotal: Prisma.Decimal;
    commercialCurrency: string;
  };
  passengers: readonly ContractCommercialSnapshotPassengerInput[];
  actor: { userId: string; name: string };
};

/**
 * Contract-owned commercial freeze. This copies existing immutable Pricing
 * evidence and never invokes a Pricing formula or queries current costs.
 */
@Injectable()
export class ContractCommercialSnapshotService {
  constructor(
    private readonly publishedPricing: TravelPackagePublishedPricingReader,
  ) {}

  async freezeInTransaction(
    tx: Prisma.TransactionClient,
    input: FreezeInput,
  ): Promise<{ snapshotId: string } | null> {
    const database = tx as unknown as TravelPackagePublishedPricingTransaction & Record<string, any>;
    const existing = await database.contractCommercialSnapshot.findFirst({
      where: { tenantId: input.tenantId, contractId: input.contract.id },
      select: { id: true },
    });
    if (existing) return { snapshotId: existing.id };

    const published = await this.publishedPricing.readInTransaction(
      database,
      input.tenantId,
      input.contract.travelPackageId,
    );
    // Pre-Pricing packages intentionally retain their legacy Contract behavior;
    // historical per-component commercial values cannot be invented.
    if (published.kind === "LEGACY") return null;
    if (published.unitScope !== CONTRACT_COMMERCIAL_UNIT_SCOPE) {
      throw new ConflictException("CONTRACT_COMMERCIAL_SNAPSHOT_UNIT_SCOPE_INVALID");
    }
    if (published.currency !== input.contract.commercialCurrency) {
      throw new ConflictException("CONTRACT_COMMERCIAL_PRICE_STALE");
    }

    const version = await database.pricingCalculationVersion.findFirst({
      where: {
        id: published.pricingCalculationVersionId,
        tenantId: input.tenantId,
        costingProjectId: published.costingProjectId,
        status: "APPROVED",
      },
      select: {
        id: true,
        costingProjectId: true,
        currency: true,
        finalSellingPrice: true,
      },
    });
    if (!version || version.currency !== published.currency) {
      throw new ConflictException("CONTRACT_COMMERCIAL_SNAPSHOT_PRICING_INVALID");
    }

    const componentLines = await database.pricingCalculationComponentLine.findMany({
      where: {
        tenantId: input.tenantId,
        pricingCalculationVersionId: version.id,
        costingProjectId: version.costingProjectId,
      },
      orderBy: { costComponentId: "asc" },
    });
    if (componentLines.length === 0) {
      throw new ConflictException("CONTRACT_COMMERCIAL_SNAPSHOT_COMPONENT_LINES_UNAVAILABLE");
    }
    if (componentLines.some((line: any) => line.currency !== published.currency)) {
      throw new ConflictException("CONTRACT_COMMERCIAL_SNAPSHOT_COMPONENT_CURRENCY_INVALID");
    }

    const perPersonSellingPrice = new Prisma.Decimal(published.perPersonSellingPrice);
    const componentTotal = componentLines.reduce(
      (total: Prisma.Decimal, line: any) => total.plus(line.effectiveSellingValue),
      new Prisma.Decimal(0),
    );
    if (
      !pricingAmountsEqual(decimalString(version.finalSellingPrice), decimalString(perPersonSellingPrice)) ||
      !pricingAmountsEqual(decimalString(componentTotal), decimalString(perPersonSellingPrice))
    ) {
      throw new ConflictException("CONTRACT_COMMERCIAL_SNAPSHOT_RECONCILIATION_INVALID");
    }

    const expectedTotal = perPersonSellingPrice.mul(input.contract.participantCount);
    if (
      input.passengers.length !== input.contract.participantCount ||
      !pricingAmountsEqual(decimalString(expectedTotal), decimalString(input.contract.commercialTotal))
    ) {
      throw new ConflictException("CONTRACT_COMMERCIAL_PRICE_STALE");
    }

    const snapshot = await database.contractCommercialSnapshot.create({
      data: {
        tenantId: input.tenantId,
        contractId: input.contract.id,
        travelPackageId: input.contract.travelPackageId,
        costingProjectId: published.costingProjectId,
        pricingCalculationVersionId: version.id,
        travelPackagePricingPublicationId: published.publicationId,
        unitScope: CONTRACT_COMMERCIAL_UNIT_SCOPE,
        perPersonSellingPrice,
        billablePassengerQuantity: input.contract.participantCount,
        commercialTotal: input.contract.commercialTotal,
        currency: published.currency,
        frozenByUserId: input.actor.userId,
        frozenByName: input.actor.name,
        passengers: {
          create: input.passengers.map((passenger) => ({
            tenantId: input.tenantId,
            travelPackageId: input.contract.travelPackageId,
            travelPackageParticipantId: passenger.travelPackageParticipantId,
            clientId: passenger.clientId,
            role: passenger.role,
            billable: true,
            unitMultiplier: 1,
          })),
        },
        componentLines: {
          create: componentLines.map((line: any) => ({
            tenantId: input.tenantId,
            costingProjectId: line.costingProjectId,
            costComponentId: line.costComponentId,
            costSnapshotId: line.costSnapshotId,
            costCategoryCode: line.costCategoryCode,
            costCategoryDisplayName: line.costCategoryDisplayName,
            componentTitle: line.componentTitle,
            currency: line.currency,
            baseCost: line.baseCost,
            allocatedOperationalExpense: line.allocatedOperationalExpense,
            risk: line.risk,
            adjustedEconomicCost: line.adjustedEconomicCost,
            preTaxSellingPrice: line.preTaxSellingPrice,
            targetProfit: line.targetProfit,
            salesCommission: line.salesCommission,
            bankCommission: line.bankCommission,
            tax: line.tax,
            rawSellingValue: line.rawSellingValue,
            allocatedPublishedPriceRetention: line.allocatedPublishedPriceRetention,
            roundingAdjustment: line.roundingAdjustment,
            effectiveSellingValue: line.effectiveSellingValue,
          })),
        },
      },
      select: { id: true },
    });
    return { snapshotId: snapshot.id };
  }
}

function decimalString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toString" in value) return String(value);
  throw new BadRequestException("CONTRACT_COMMERCIAL_SNAPSHOT_DECIMAL_INVALID");
}
