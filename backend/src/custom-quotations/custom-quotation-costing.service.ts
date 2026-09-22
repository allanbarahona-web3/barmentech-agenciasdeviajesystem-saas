import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { CostingProjectCurrentCostReader } from "../cost-engine/costing-project-current-cost-reader";
import { PrismaService } from "../prisma/prisma.service";
import { runTenantTransaction } from "../tenant/tenant-transaction";
import type { CustomQuotationActor } from "./custom-quotations.service";

type CustomQuotationCostingTransaction = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  customQuotation: Record<string, (...args: any[]) => Promise<any>>;
  customQuotationCostingProjectLink: Record<string, (...args: any[]) => Promise<any>>;
  costingProject: Record<string, (...args: any[]) => Promise<any>>;
};

type CustomQuotationCostingDatabase = {
  $transaction<T>(work: (transaction: CustomQuotationCostingTransaction) => Promise<T>): Promise<T>;
};

type QuotationForCosting = {
  id: string;
  quotationNumber: string;
  title: string;
  currency: string;
  status: string;
};

type CostingProjectRecord = { id: string; baseCurrency: string };

@Injectable()
export class CustomQuotationCostingService {
  private readonly database: CustomQuotationCostingDatabase;

  constructor(
    prisma: PrismaService,
    private readonly currentCosts: CostingProjectCurrentCostReader,
  ) {
    this.database = prisma as unknown as CustomQuotationCostingDatabase;
  }

  async resolveOrCreateCostingProject(
    tenantId: string,
    customQuotationId: string,
    actor: CustomQuotationActor,
  ) {
    try {
      return await this.withTenantTransaction(tenantId, async (tx) => {
        const quotation = await tx.customQuotation.findFirst({
          where: { id: customQuotationId, tenantId },
          select: { id: true, quotationNumber: true, title: true, currency: true, status: true },
        }) as QuotationForCosting | null;
        if (!quotation) throw new NotFoundException("CUSTOM_QUOTATION_NOT_FOUND");

        const existing = await tx.customQuotationCostingProjectLink.findFirst({
          where: { tenantId, customQuotationId },
          select: { costingProject: { select: { id: true, baseCurrency: true } } },
        });
        if (existing) return this.context(tx, tenantId, existing.costingProject);

        if (quotation.status !== "DRAFT") {
          throw new ConflictException("CUSTOM_QUOTATION_NOT_DRAFT");
        }
        const costingProject = await tx.costingProject.create({
          data: {
            tenantId,
            displayName: `Cotización ${quotation.quotationNumber}: ${quotation.title}`,
            baseCurrency: quotation.currency,
            createdByUserId: actor.userId,
            createdByName: actor.name,
          },
          select: { id: true, baseCurrency: true },
        }) as CostingProjectRecord;
        await tx.customQuotationCostingProjectLink.create({
          data: { tenantId, customQuotationId: quotation.id, costingProjectId: costingProject.id },
        });
        return this.context(tx, tenantId, costingProject);
      });
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error;
      const winner = await this.findWinner(tenantId, customQuotationId);
      if (winner) return winner;
      throw error;
    }
  }

  private async findWinner(tenantId: string, customQuotationId: string) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      const link = await tx.customQuotationCostingProjectLink.findFirst({
        where: { tenantId, customQuotationId },
        select: { costingProject: { select: { id: true, baseCurrency: true } } },
      });
      return link ? this.context(tx, tenantId, link.costingProject) : null;
    });
  }

  private async context(tx: CustomQuotationCostingTransaction, tenantId: string, costingProject: CostingProjectRecord) {
    const currentCost = await this.currentCosts.read(tx, tenantId, costingProject.id);
    return {
      costingProjectId: currentCost.costingProjectId,
      baseCurrency: currentCost.baseCurrency,
      authoritativeTotalCost: currentCost.authoritativeTotalCost,
    };
  }

  private withTenantTransaction<T>(tenantId: string, work: (tx: CustomQuotationCostingTransaction) => Promise<T>) {
    return runTenantTransaction(this.database, tenantId, work);
  }
}

function isUniqueConstraint(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002";
}
