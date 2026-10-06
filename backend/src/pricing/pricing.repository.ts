import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { runTenantTransaction } from "../tenant/tenant-transaction";
import {
  CostingProjectCurrentCostReader,
  type CostingProjectCurrentCost,
  type CostingProjectCurrentCostTransaction,
} from "../cost-engine/costing-project-current-cost-reader";
import { calculateComponentSellingPrices } from "./component-selling-price-calculator";
import { pricingAmountsEqual, type PricingV1Calculation } from "./pricing-v1-calculator";

export type PricingActor = { userId: string; name: string };

type CreateDraftCalculationOptions = {
  commercialFloorPrice?: string | null;
  persistWhen?: (calculation: PricingV1Calculation, currentCost: CostingProjectCurrentCost) => boolean;
};

export type PricingTransaction = CostingProjectCurrentCostTransaction & {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  pricingConfiguration: Record<string, (...args: any[]) => Promise<any>>;
  pricingCalculationVersion: Record<string, (...args: any[]) => Promise<any>>;
  pricingCalculationComponentLine: Record<string, (...args: any[]) => Promise<any>>;
  costComponent: Record<string, (...args: any[]) => Promise<any>>;
};

type PricingDatabase = {
  $transaction<T>(work: (transaction: PricingTransaction) => Promise<T>): Promise<T>;
};

@Injectable()
export class PricingRepository {
  private readonly database: PricingDatabase;

  constructor(
    prisma: PrismaService,
    private readonly currentCosts: CostingProjectCurrentCostReader,
  ) {
    // Prisma client generation follows the user's manual migration workflow.
    this.database = prisma as unknown as PricingDatabase;
  }

  async resolveConfiguration(tenantId: string, costingProjectId: string, actor: PricingActor) {
    try {
      return await this.withTenantTransaction(tenantId, async (tx) => {
        const currentCost = await this.currentCosts.read(tx, tenantId, costingProjectId);
        const existing = await tx.pricingConfiguration.findFirst({
          where: { tenantId, costingProjectId },
        });
        if (existing) return { configuration: existing, currentCost };

        const configuration = await tx.pricingConfiguration.create({
          data: {
            tenantId,
            costingProjectId,
            status: "DRAFT",
            operationalCostsAmount: "0",
            riskMarginPercent: "0",
            targetProfitMarginPercent: "0",
            salesCommissionPercent: "0",
            bankCommissionPercent: "0",
            applicableTaxPercent: "0",
            createdByUserId: actor.userId,
            createdByName: actor.name,
          },
        });
        return { configuration, currentCost };
      });
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error;
      return this.withTenantTransaction(tenantId, async (tx) => {
        const currentCost = await this.currentCosts.read(tx, tenantId, costingProjectId);
        const configuration = await tx.pricingConfiguration.findFirst({ where: { tenantId, costingProjectId } });
        if (!configuration) throw new ConflictException("Pricing configuration resolve conflict.");
        return { configuration, currentCost };
      });
    }
  }

  /**
   * Internal adapter contract: initializes a project configuration exactly once
   * from trusted, already-validated policy inputs. Existing snapshots win.
   */
  async resolveConfigurationFromSnapshot(
    tenantId: string,
    costingProjectId: string,
    input: {
      operationalCostsAmount: string;
      riskMarginPercent: string;
      targetProfitMarginPercent: string;
      salesCommissionPercent: string;
      bankCommissionPercent: string;
      applicableTaxPercent: string;
    },
    actor: PricingActor,
  ) {
    try {
      return await this.withTenantTransaction(tenantId, async (tx) => {
        const currentCost = await this.currentCosts.read(tx, tenantId, costingProjectId);
        const existing = await tx.pricingConfiguration.findFirst({
          where: { tenantId, costingProjectId },
        });
        if (existing) return { configuration: existing, currentCost };
        const configuration = await tx.pricingConfiguration.create({
          data: {
            tenantId,
            costingProjectId,
            status: "DRAFT",
            ...input,
            createdByUserId: actor.userId,
            createdByName: actor.name,
          },
        });
        return { configuration, currentCost };
      });
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error;
      return this.withTenantTransaction(tenantId, async (tx) => {
        const currentCost = await this.currentCosts.read(tx, tenantId, costingProjectId);
        const configuration = await tx.pricingConfiguration.findFirst({ where: { tenantId, costingProjectId } });
        if (!configuration) throw new ConflictException("Pricing configuration resolve conflict.");
        return { configuration, currentCost };
      });
    }
  }

  updateConfiguration(tenantId: string, costingProjectId: string, input: Record<string, string>, actor: PricingActor) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      await this.currentCosts.read(tx, tenantId, costingProjectId);
      const configuration = await tx.pricingConfiguration.findFirst({ where: { tenantId, costingProjectId } });
      if (!configuration) throw new NotFoundException("Pricing configuration not found.");
      if (configuration.status === "ARCHIVED") throw new BadRequestException("Pricing configuration is archived.");
      await tx.pricingConfiguration.updateMany({
        where: { id: configuration.id, tenantId, costingProjectId, status: "DRAFT" },
        data: { ...input, updatedByUserId: actor.userId, updatedByName: actor.name },
      });
      return tx.pricingConfiguration.findFirst({ where: { id: configuration.id, tenantId, costingProjectId } });
    });
  }

  createDraftCalculation(
    tenantId: string,
    costingProjectId: string,
    actor: PricingActor,
    calculate: (configuration: any, currentCost: CostingProjectCurrentCost) => PricingV1Calculation,
    options: CreateDraftCalculationOptions = {},
  ) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "pricing_configurations"
        WHERE "tenantId" = ${tenantId} AND "costingProjectId" = ${costingProjectId}
        FOR UPDATE
      `;
      if (locked.length !== 1) throw new NotFoundException("Pricing configuration not found.");

      const configuration = await tx.pricingConfiguration.findFirst({ where: { id: locked[0].id, tenantId, costingProjectId } });
      if (!configuration) throw new NotFoundException("Pricing configuration not found.");
      if (configuration.status === "ARCHIVED") throw new BadRequestException("Pricing configuration is archived.");

      const currentCost = await this.currentCosts.read(tx, tenantId, costingProjectId);
      const calculation = calculate(configuration, currentCost);
      if (options.persistWhen && !options.persistWhen(calculation, currentCost)) return null;
      const components = await this.readCurrentPricingComponents(tx, tenantId, costingProjectId, currentCost.baseCurrency);
      const componentCalculation = calculateComponentSellingPrices({
        components: components.map((component) => ({
          costComponentId: component.id,
          costSnapshotId: component.currentSnapshot.id,
          costAmount: decimalString(component.currentSnapshot.amount),
          currency: component.currentSnapshot.currency,
        })),
        ...configurationInput(configuration),
        commercialFloorPrice: options.commercialFloorPrice,
      });
      if (!pricingAmountsEqual(componentCalculation.totalComponentCost, currentCost.authoritativeTotalCost)) {
        throw new ConflictException("Current CostComponent snapshots do not reconcile to authoritative Pricing cost.");
      }
      if (!pricingAmountsEqual(componentCalculation.rawFinalSellingPrice, calculation.finalSellingPrice)) {
        throw new ConflictException("Component Pricing decomposition does not reconcile to the Pricing calculation.");
      }
      const effectiveCalculation: PricingV1Calculation = {
        ...calculation,
        finalSellingPrice: componentCalculation.effectiveFinalSellingPrice,
      };
      const latest = await tx.pricingCalculationVersion.findFirst({
        where: { tenantId, costingProjectId },
        orderBy: [{ versionNumber: "desc" }, { id: "desc" }],
        select: { versionNumber: true },
      });
      return tx.pricingCalculationVersion.create({
        data: {
          tenantId,
          pricingConfigurationId: configuration.id,
          costingProjectId,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          status: "DRAFT",
          policyVersion: effectiveCalculation.policyVersion,
          currency: currentCost.baseCurrency,
          authoritativeCostAmount: effectiveCalculation.authoritativeCostAmount,
          operationalCostsAmount: effectiveCalculation.operationalCostsAmount,
          riskMarginPercent: effectiveCalculation.riskMarginPercent,
          targetProfitMarginPercent: effectiveCalculation.targetProfitMarginPercent,
          salesCommissionPercent: effectiveCalculation.salesCommissionPercent,
          bankCommissionPercent: effectiveCalculation.bankCommissionPercent,
          applicableTaxPercent: effectiveCalculation.applicableTaxPercent,
          riskBasis: effectiveCalculation.riskBasis,
          targetProfitBasis: effectiveCalculation.targetProfitBasis,
          salesCommissionBasis: effectiveCalculation.salesCommissionBasis,
          bankCommissionBasis: effectiveCalculation.bankCommissionBasis,
          taxBasis: effectiveCalculation.taxBasis,
          baseCostAmount: effectiveCalculation.baseCostAmount,
          riskAmount: effectiveCalculation.riskAmount,
          adjustedEconomicCostAmount: effectiveCalculation.adjustedEconomicCostAmount,
          targetProfitAmount: effectiveCalculation.targetProfitAmount,
          salesCommissionAmount: effectiveCalculation.salesCommissionAmount,
          bankCommissionAmount: effectiveCalculation.bankCommissionAmount,
          preTaxSellingPrice: effectiveCalculation.preTaxSellingPrice,
          taxAmount: effectiveCalculation.taxAmount,
          finalSellingPrice: effectiveCalculation.finalSellingPrice,
          estimatedAgencyProfitBeforeIncomeTax: effectiveCalculation.estimatedAgencyProfitBeforeIncomeTax,
          createdByUserId: actor.userId,
          createdByName: actor.name,
          componentLines: {
            create: componentCalculation.components.map((line) => {
              const component = componentsById(components, line.costComponentId);
              return {
                costComponentId: line.costComponentId,
                costSnapshotId: line.costSnapshotId,
                costCategoryCode: component.costCategory.code,
                costCategoryDisplayName: component.costCategory.displayName,
                componentTitle: component.title,
                currency: component.currentSnapshot.currency,
                weight: line.weight,
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
              };
            }),
          },
        },
      });
    });
  }

  getConfigurationContext(tenantId: string, costingProjectId: string) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      const currentCost = await this.currentCosts.read(tx, tenantId, costingProjectId);
      const configuration = await tx.pricingConfiguration.findFirst({ where: { tenantId, costingProjectId } });
      if (!configuration) throw new NotFoundException("Pricing configuration not found.");
      return { configuration, currentCost };
    });
  }

  findCalculation(tenantId: string, pricingCalculationVersionId: string) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      const version = await tx.pricingCalculationVersion.findFirst({ where: { id: pricingCalculationVersionId, tenantId } });
      if (!version) throw new NotFoundException("Pricing calculation version not found.");
      const currentCost = await this.currentCosts.read(tx, tenantId, version.costingProjectId);
      return { version, currentCost };
    });
  }

  findCalculationComponentLines(tenantId: string, pricingCalculationVersionId: string) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      const version = await tx.pricingCalculationVersion.findFirst({
        where: { id: pricingCalculationVersionId, tenantId },
        select: { id: true },
      });
      if (!version) throw new NotFoundException("Pricing calculation version not found.");
      return tx.pricingCalculationComponentLine.findMany({
        where: { tenantId, pricingCalculationVersionId },
        orderBy: { costComponentId: "asc" },
      });
    });
  }

  findLatestCalculation(tenantId: string, costingProjectId: string, status?: "APPROVED") {
    return this.withTenantTransaction(tenantId, async (tx) => {
      const currentCost = await this.currentCosts.read(tx, tenantId, costingProjectId);
      const version = await tx.pricingCalculationVersion.findFirst({
        where: { tenantId, costingProjectId, ...(status ? { status } : {}) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      return { version, currentCost };
    });
  }

  listCalculations(tenantId: string, costingProjectId: string, page: number, pageSize: number) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      const currentCost = await this.currentCosts.read(tx, tenantId, costingProjectId);
      const where = { tenantId, costingProjectId };
      const [versions, total] = await Promise.all([
        tx.pricingCalculationVersion.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.pricingCalculationVersion.count({ where }),
      ]);
      return { versions, total, page, pageSize, currentCost };
    });
  }

  approveCalculation(
    tenantId: string,
    pricingCalculationVersionId: string,
    actor: PricingActor,
    assertNotStale: (version: any, currentCost: CostingProjectCurrentCost) => void,
  ) {
    return this.withTenantTransaction(tenantId, (tx) =>
      this.approveCalculationInTransaction(tx, tenantId, pricingCalculationVersionId, actor, assertNotStale),
    );
  }

  /**
   * Trusted application adapters can compose approval with their own aggregate
   * transaction without reimplementing Pricing's lock/staleness invariant.
   */
  async approveCalculationInTransaction(
    tx: PricingTransaction,
    tenantId: string,
    pricingCalculationVersionId: string,
    actor: PricingActor,
    assertNotStale: (version: any, currentCost: CostingProjectCurrentCost) => void,
  ) {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "pricing_calculation_versions"
      WHERE "id" = ${pricingCalculationVersionId} AND "tenantId" = ${tenantId}
      FOR UPDATE
    `;
    if (locked.length !== 1) throw new NotFoundException("Pricing calculation version not found.");
    const version = await tx.pricingCalculationVersion.findFirst({ where: { id: pricingCalculationVersionId, tenantId } });
    if (!version) throw new NotFoundException("Pricing calculation version not found.");
    if (version.status !== "DRAFT") throw new ConflictException("Only draft pricing calculation versions can be approved.");

    const currentCost = await this.currentCosts.read(tx, tenantId, version.costingProjectId);
    assertNotStale(version, currentCost);
    const approved = await tx.pricingCalculationVersion.updateMany({
      where: { id: version.id, tenantId, status: "DRAFT" },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedByUserId: actor.userId,
        approvedByName: actor.name,
      },
    });
    if (approved.count !== 1) throw new ConflictException("Pricing calculation approval conflict.");
    return tx.pricingCalculationVersion.findFirst({ where: { id: version.id, tenantId } });
  }

  private withTenantTransaction<T>(tenantId: string, work: (tx: PricingTransaction) => Promise<T>) {
    return runTenantTransaction(this.database, tenantId, work);
  }

  /**
   * Cost Engine remains unit-neutral. Pricing interprets this active component
   * composition as the cost basis for exactly one TravelPackage person/unit.
   */
  private async readCurrentPricingComponents(
    tx: PricingTransaction,
    tenantId: string,
    costingProjectId: string,
    baseCurrency: string,
  ) {
    const components = await tx.costComponent.findMany({
      where: {
        tenantId,
        costingProjectId,
        status: "ACTIVE",
        currentSnapshotId: { not: null },
      },
      select: {
        id: true,
        title: true,
        costCategory: { select: { code: true, displayName: true } },
        currentSnapshot: { select: { id: true, amount: true, currency: true } },
      },
      orderBy: { id: "asc" },
    });
    const missingSnapshot = components.find((component: any) => !component.currentSnapshot);
    if (missingSnapshot) throw new ConflictException("An active CostComponent current snapshot is unavailable.");
    const wrongCurrency = components.find((component: any) => component.currentSnapshot.currency !== baseCurrency);
    if (wrongCurrency) throw new ConflictException("Current CostComponent snapshot currency must match the CostingProject base currency.");
    return components as Array<{
      id: string;
      title: string;
      costCategory: { code: string; displayName: string };
      currentSnapshot: { id: string; amount: unknown; currency: string };
    }>;
  }
}

function configurationInput(configuration: any) {
  return {
    operationalCostsAmount: decimalString(configuration.operationalCostsAmount),
    riskMarginPercent: decimalString(configuration.riskMarginPercent),
    targetProfitMarginPercent: decimalString(configuration.targetProfitMarginPercent),
    salesCommissionPercent: decimalString(configuration.salesCommissionPercent),
    bankCommissionPercent: decimalString(configuration.bankCommissionPercent),
    applicableTaxPercent: decimalString(configuration.applicableTaxPercent),
  };
}

function componentsById<T extends { id: string }>(components: T[], id: string): T {
  const component = components.find((candidate) => candidate.id === id);
  if (!component) throw new ConflictException("Component Pricing decomposition references an unknown CostComponent.");
  return component;
}

function decimalString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toString" in value) return String(value);
  throw new ConflictException("Invalid persisted Pricing decimal.");
}

function isUniqueConstraint(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002";
}
