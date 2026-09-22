import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PricingService } from "../pricing/pricing.service";
import { TenantPricingPolicyService } from "../pricing/tenant-pricing-policy.service";
import { runTenantTransaction } from "../tenant/tenant-transaction";
import type { CustomQuotationActor } from "./custom-quotations.service";

type CustomQuotationPricingTransaction = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  customQuotation: Record<string, (...args: any[]) => Promise<any>>;
};

type CustomQuotationPricingDatabase = {
  $transaction<T>(work: (transaction: CustomQuotationPricingTransaction) => Promise<T>): Promise<T>;
};

type PricingEligibleQuotation = {
  id: string;
  currency: string;
  status: string;
  costingProjectLink: { costingProject: { id: string; baseCurrency: string } } | null;
};

@Injectable()
export class CustomQuotationPricingService {
  private readonly database: CustomQuotationPricingDatabase;

  constructor(
    prisma: PrismaService,
    private readonly policies: TenantPricingPolicyService,
    private readonly pricing: PricingService,
  ) {
    this.database = prisma as unknown as CustomQuotationPricingDatabase;
  }

  async calculate(
    tenantId: string,
    quotationId: string,
    actor: CustomQuotationActor,
  ) {
    const quotation = await this.withTenantTransaction(tenantId, (tx) =>
      tx.customQuotation.findFirst({
        where: { id: quotationId, tenantId },
        select: {
          id: true,
          currency: true,
          status: true,
          costingProjectLink: { select: { costingProject: { select: { id: true, baseCurrency: true } } } },
        },
      }) as Promise<PricingEligibleQuotation | null>,
    );
    if (!quotation) throw new NotFoundException("CUSTOM_QUOTATION_NOT_FOUND");
    if (quotation.status !== "DRAFT") throw new ConflictException("CUSTOM_QUOTATION_NOT_DRAFT");
    const costingProject = quotation.costingProjectLink?.costingProject;
    if (!costingProject) throw new NotFoundException("CUSTOM_QUOTATION_COSTING_PROJECT_NOT_FOUND");
    if (costingProject.baseCurrency !== quotation.currency) {
      throw new ConflictException("CUSTOM_QUOTATION_COSTING_CURRENCY_MISMATCH");
    }

    const policy = await this.policies.resolveDefaultCustomQuotationPricingPolicy(tenantId);
    if (!policy) throw new NotFoundException("CUSTOM_QUOTATION_DEFAULT_PRICING_POLICY_NOT_FOUND");
    await this.pricing.resolveConfigurationFromSnapshot(
      tenantId,
      costingProject.id,
      {
        operationalCostsAmount: policy.operationalCostsAmountDefault,
        riskMarginPercent: policy.riskMarginPercent,
        targetProfitMarginPercent: policy.targetProfitMarginPercent,
        salesCommissionPercent: policy.salesCommissionPercent,
        bankCommissionPercent: policy.bankCommissionPercent,
        applicableTaxPercent: policy.applicableTaxPercent,
      },
      actor,
    );
    const calculation = await this.pricing.calculate(tenantId, costingProject.id, actor);
    return {
      pricingCalculationVersionId: calculation.id,
      currency: calculation.currency,
      finalSellingPrice: calculation.finalSellingPrice,
      status: calculation.status,
      stale: calculation.stale,
    };
  }

  private withTenantTransaction<T>(tenantId: string, work: (tx: CustomQuotationPricingTransaction) => Promise<T>) {
    return runTenantTransaction(this.database, tenantId, work);
  }
}
