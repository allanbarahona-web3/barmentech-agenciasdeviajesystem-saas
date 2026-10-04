import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { runTenantTransaction } from "../tenant/tenant-transaction";

export type FrozenContractCommercialSnapshot = {
  contractId: string;
  contractNumber: string;
  travelPackageId: string;
  pricingCalculationVersionId: string;
  travelPackagePricingPublicationId: string;
  unitScope: "PER_PERSON";
  perPersonSellingPrice: string;
  billablePassengerQuantity: number;
  commercialTotal: string;
  currency: string;
  frozenAt: Date;
  passengers: Array<{
    travelPackageParticipantId: string;
    clientId: string;
    role: "HOLDER" | "COMPANION" | "MINOR";
    billable: true;
    unitMultiplier: 1;
  }>;
  componentLines: Array<{
    costComponentId: string;
    costSnapshotId: string;
    category: { code: string; displayName: string };
    title: string;
    currency: string;
    baseCost: string;
    allocatedOperationalExpense: string;
    risk: string;
    adjustedEconomicCost: string;
    preTaxSellingPrice: string;
    targetProfit: string;
    salesCommission: string;
    bankCommission: string;
    tax: string;
    rawSellingValue: string;
    allocatedPublishedPriceRetention: string;
    roundingAdjustment: string;
    effectiveSellingValue: string;
  }>;
};

/** Neutral, internal Contract commercial-history read boundary for future consumers. */
@Injectable()
export class ContractCommercialSnapshotReader {
  constructor(private readonly prisma: PrismaService) {}

  async read(
    tenantId: string,
    contractId: string,
  ): Promise<FrozenContractCommercialSnapshot | null> {
    return runTenantTransaction<any, FrozenContractCommercialSnapshot | null>(
      this.prisma as any,
      tenantId,
      async (tx) => {
        const contract = await tx.contract.findFirst({
          where: { id: contractId, tenantId },
          select: {
            id: true,
            contractNumber: true,
            commercialSnapshot: {
              select: {
                travelPackageId: true,
                pricingCalculationVersionId: true,
                travelPackagePricingPublicationId: true,
                unitScope: true,
                perPersonSellingPrice: true,
                billablePassengerQuantity: true,
                commercialTotal: true,
                currency: true,
                frozenAt: true,
                passengers: {
                  select: {
                    travelPackageParticipantId: true,
                    clientId: true,
                    role: true,
                    billable: true,
                    unitMultiplier: true,
                  },
                  orderBy: { travelPackageParticipantId: "asc" },
                },
                componentLines: {
                  select: {
                    costComponentId: true,
                    costSnapshotId: true,
                    costCategoryCode: true,
                    costCategoryDisplayName: true,
                    componentTitle: true,
                    currency: true,
                    baseCost: true,
                    allocatedOperationalExpense: true,
                    risk: true,
                    adjustedEconomicCost: true,
                    preTaxSellingPrice: true,
                    targetProfit: true,
                    salesCommission: true,
                    bankCommission: true,
                    tax: true,
                    rawSellingValue: true,
                    allocatedPublishedPriceRetention: true,
                    roundingAdjustment: true,
                    effectiveSellingValue: true,
                  },
                  orderBy: { costComponentId: "asc" },
                },
              },
            },
          },
        });
        if (!contract) throw new NotFoundException("CONTRACT_COMMERCIAL_SNAPSHOT_CONTRACT_NOT_FOUND");
        const snapshot = contract.commercialSnapshot;
        if (!snapshot) return null;
        return {
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          travelPackageId: snapshot.travelPackageId,
          pricingCalculationVersionId: snapshot.pricingCalculationVersionId,
          travelPackagePricingPublicationId: snapshot.travelPackagePricingPublicationId,
          unitScope: "PER_PERSON",
          perPersonSellingPrice: decimalString(snapshot.perPersonSellingPrice),
          billablePassengerQuantity: snapshot.billablePassengerQuantity,
          commercialTotal: decimalString(snapshot.commercialTotal),
          currency: snapshot.currency,
          frozenAt: snapshot.frozenAt,
          passengers: snapshot.passengers.map((passenger: any) => ({
            travelPackageParticipantId: passenger.travelPackageParticipantId,
            clientId: passenger.clientId,
            role: passenger.role,
            billable: true,
            unitMultiplier: 1,
          })),
          componentLines: snapshot.componentLines.map((line: any) => ({
            costComponentId: line.costComponentId,
            costSnapshotId: line.costSnapshotId,
            category: { code: line.costCategoryCode, displayName: line.costCategoryDisplayName },
            title: line.componentTitle,
            currency: line.currency,
            baseCost: decimalString(line.baseCost),
            allocatedOperationalExpense: decimalString(line.allocatedOperationalExpense),
            risk: decimalString(line.risk),
            adjustedEconomicCost: decimalString(line.adjustedEconomicCost),
            preTaxSellingPrice: decimalString(line.preTaxSellingPrice),
            targetProfit: decimalString(line.targetProfit),
            salesCommission: decimalString(line.salesCommission),
            bankCommission: decimalString(line.bankCommission),
            tax: decimalString(line.tax),
            rawSellingValue: decimalString(line.rawSellingValue),
            allocatedPublishedPriceRetention: decimalString(line.allocatedPublishedPriceRetention),
            roundingAdjustment: decimalString(line.roundingAdjustment),
            effectiveSellingValue: decimalString(line.effectiveSellingValue),
          })),
        };
      },
    );
  }
}

function decimalString(value: { toString(): string }): string {
  return value.toString();
}
