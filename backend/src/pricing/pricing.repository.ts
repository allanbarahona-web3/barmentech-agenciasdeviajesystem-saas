import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { runTenantTransaction } from "../tenant/tenant-transaction";
import {
  CostingProjectCurrentCostReader,
  type CostingProjectCurrentCost,
  type CostingProjectCurrentCostTransaction,
} from "../cost-engine/costing-project-current-cost-reader";
import type { PricingV1Calculation } from "./pricing-v1-calculator";

export type PricingActor = { userId: string; name: string };

export type PricingTransaction = CostingProjectCurrentCostTransaction & {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  pricingConfiguration: Record<string, (...args: any[]) => Promise<any>>;
  pricingCalculationVersion: Record<string, (...args: any[]) => Promise<any>>;
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
    persistWhen?: (calculation: PricingV1Calculation, currentCost: CostingProjectCurrentCost) => boolean,
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
      if (persistWhen && !persistWhen(calculation, currentCost)) return null;
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
          policyVersion: calculation.policyVersion,
          currency: currentCost.baseCurrency,
          authoritativeCostAmount: calculation.authoritativeCostAmount,
          operationalCostsAmount: calculation.operationalCostsAmount,
          riskMarginPercent: calculation.riskMarginPercent,
          targetProfitMarginPercent: calculation.targetProfitMarginPercent,
          salesCommissionPercent: calculation.salesCommissionPercent,
          bankCommissionPercent: calculation.bankCommissionPercent,
          applicableTaxPercent: calculation.applicableTaxPercent,
          riskBasis: calculation.riskBasis,
          targetProfitBasis: calculation.targetProfitBasis,
          salesCommissionBasis: calculation.salesCommissionBasis,
          bankCommissionBasis: calculation.bankCommissionBasis,
          taxBasis: calculation.taxBasis,
          baseCostAmount: calculation.baseCostAmount,
          riskAmount: calculation.riskAmount,
          adjustedEconomicCostAmount: calculation.adjustedEconomicCostAmount,
          targetProfitAmount: calculation.targetProfitAmount,
          salesCommissionAmount: calculation.salesCommissionAmount,
          bankCommissionAmount: calculation.bankCommissionAmount,
          preTaxSellingPrice: calculation.preTaxSellingPrice,
          taxAmount: calculation.taxAmount,
          finalSellingPrice: calculation.finalSellingPrice,
          estimatedAgencyProfitBeforeIncomeTax: calculation.estimatedAgencyProfitBeforeIncomeTax,
          createdByUserId: actor.userId,
          createdByName: actor.name,
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
}

function isUniqueConstraint(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002";
}
