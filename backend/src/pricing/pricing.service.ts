import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import {
  calculatePricingV1,
  pricingAmountsEqual,
  validatePricingV1Configuration,
  type PricingV1ConfigurationInput,
} from "./pricing-v1-calculator";
import { PricingRepository, type PricingActor } from "./pricing.repository";

export type PricingConfigurationUpdate = Partial<PricingV1ConfigurationInput>;

@Injectable()
export class PricingService {
  constructor(private readonly repository: PricingRepository) {}

  async resolveConfiguration(tenantId: string, costingProjectId: string, actor: PricingActor) {
    const result = await this.repository.resolveConfiguration(tenantId, costingProjectId, actor);
    return pricingContextResponse(result.configuration, result.currentCost);
  }

  async updateConfiguration(
    tenantId: string,
    costingProjectId: string,
    input: PricingConfigurationUpdate,
    actor: PricingActor,
  ) {
    if (Object.keys(input).length === 0) throw new BadRequestException("At least one pricing configuration field is required.");
    const current = await this.repository.getConfigurationContext(tenantId, costingProjectId);
    const merged = configurationInput(current.configuration, input);
    validatePricingV1Configuration(merged);
    const configuration = await this.repository.updateConfiguration(tenantId, costingProjectId, input as Record<string, string>, actor);
    return pricingContextResponse(configuration, current.currentCost);
  }

  async calculate(tenantId: string, costingProjectId: string, actor: PricingActor) {
    await this.repository.resolveConfiguration(tenantId, costingProjectId, actor);
    const version = await this.repository.createDraftCalculation(tenantId, costingProjectId, actor, (configuration, currentCost) => calculatePricingV1({
      authoritativeCostAmount: currentCost.authoritativeTotalCost,
      ...configurationInput(configuration),
    }));
    const result = await this.repository.findCalculation(tenantId, version.id);
    return calculationResponse(result.version, result.currentCost.authoritativeTotalCost);
  }

  async getLatestCalculation(tenantId: string, costingProjectId: string) {
    const result = await this.repository.findLatestCalculation(tenantId, costingProjectId);
    return result.version ? calculationResponse(result.version, result.currentCost.authoritativeTotalCost) : null;
  }

  async getLatestApprovedCalculation(tenantId: string, costingProjectId: string) {
    const result = await this.repository.findLatestCalculation(tenantId, costingProjectId, "APPROVED");
    return result.version ? calculationResponse(result.version, result.currentCost.authoritativeTotalCost) : null;
  }

  async getCalculation(tenantId: string, pricingCalculationVersionId: string) {
    const result = await this.repository.findCalculation(tenantId, pricingCalculationVersionId);
    return calculationResponse(result.version, result.currentCost.authoritativeTotalCost);
  }

  async listCalculations(tenantId: string, costingProjectId: string, page = 1, pageSize = 20) {
    const safePage = positiveInteger(page, 1);
    const safePageSize = Math.min(25, positiveInteger(pageSize, 20));
    const result = await this.repository.listCalculations(tenantId, costingProjectId, safePage, safePageSize);
    return {
      versions: result.versions.map((version: any) => calculationResponse(version, result.currentCost.authoritativeTotalCost)),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: Math.ceil(result.total / result.pageSize),
    };
  }

  async approveCalculation(tenantId: string, pricingCalculationVersionId: string, actor: PricingActor) {
    const version = await this.repository.approveCalculation(
      tenantId,
      pricingCalculationVersionId,
      actor,
      (candidate, currentCost) => {
        if (!pricingAmountsEqual(decimalString(candidate.authoritativeCostAmount), currentCost.authoritativeTotalCost)) {
          throw new ConflictException("Stale pricing calculation versions cannot be approved.");
        }
      },
    );
    if (!version) throw new ConflictException("Pricing calculation approval conflict.");
    const result = await this.repository.findCalculation(tenantId, version.id);
    return calculationResponse(result.version, result.currentCost.authoritativeTotalCost);
  }

  /** Internal adapter contract for later travel/quotation consumers; no breakdown leaks. */
  async getApprovedCommercialOutput(tenantId: string, costingProjectId: string) {
    const result = await this.repository.findLatestCalculation(tenantId, costingProjectId, "APPROVED");
    if (!result.version) return null;
    return {
      pricingCalculationVersionId: result.version.id,
      costingProjectId: result.version.costingProjectId,
      currency: result.version.currency,
      finalSellingPrice: decimalString(result.version.finalSellingPrice),
      status: result.version.status,
      approvedAt: result.version.approvedAt,
    };
  }
}

function pricingContextResponse(configuration: any, currentCost: { baseCurrency: string; authoritativeTotalCost: string }) {
  return {
    configuration: {
      id: configuration.id,
      costingProjectId: configuration.costingProjectId,
      status: configuration.status,
      ...configurationInput(configuration),
      createdAt: configuration.createdAt,
      updatedAt: configuration.updatedAt,
      createdBy: { userId: configuration.createdByUserId, name: configuration.createdByName },
      updatedBy: configuration.updatedByUserId ? { userId: configuration.updatedByUserId, name: configuration.updatedByName } : null,
    },
    currentAuthoritativeCost: currentCost.authoritativeTotalCost,
    currency: currentCost.baseCurrency,
  };
}

function calculationResponse(version: any, currentAuthoritativeCost: string) {
  const authoritativeCostAmount = decimalString(version.authoritativeCostAmount);
  return {
    id: version.id,
    pricingConfigurationId: version.pricingConfigurationId,
    costingProjectId: version.costingProjectId,
    versionNumber: version.versionNumber,
    status: version.status,
    policyVersion: version.policyVersion,
    currency: version.currency,
    stale: !pricingAmountsEqual(authoritativeCostAmount, currentAuthoritativeCost),
    authoritativeCostAmount,
    operationalCostsAmount: decimalString(version.operationalCostsAmount),
    riskMarginPercent: decimalString(version.riskMarginPercent),
    targetProfitMarginPercent: decimalString(version.targetProfitMarginPercent),
    salesCommissionPercent: decimalString(version.salesCommissionPercent),
    bankCommissionPercent: decimalString(version.bankCommissionPercent),
    applicableTaxPercent: decimalString(version.applicableTaxPercent),
    riskBasis: version.riskBasis,
    targetProfitBasis: version.targetProfitBasis,
    salesCommissionBasis: version.salesCommissionBasis,
    bankCommissionBasis: version.bankCommissionBasis,
    taxBasis: version.taxBasis,
    baseCostAmount: decimalString(version.baseCostAmount),
    riskAmount: decimalString(version.riskAmount),
    adjustedEconomicCostAmount: decimalString(version.adjustedEconomicCostAmount),
    targetProfitAmount: decimalString(version.targetProfitAmount),
    salesCommissionAmount: decimalString(version.salesCommissionAmount),
    bankCommissionAmount: decimalString(version.bankCommissionAmount),
    preTaxSellingPrice: decimalString(version.preTaxSellingPrice),
    taxAmount: decimalString(version.taxAmount),
    finalSellingPrice: decimalString(version.finalSellingPrice),
    estimatedAgencyProfitBeforeIncomeTax: decimalString(version.estimatedAgencyProfitBeforeIncomeTax),
    createdAt: version.createdAt,
    createdBy: { userId: version.createdByUserId, name: version.createdByName },
    approvedAt: version.approvedAt,
    approvedBy: version.approvedByUserId ? { userId: version.approvedByUserId, name: version.approvedByName } : null,
  };
}

function configurationInput(configuration: any, updates: PricingConfigurationUpdate = {}): PricingV1ConfigurationInput {
  return {
    operationalCostsAmount: updates.operationalCostsAmount ?? decimalString(configuration.operationalCostsAmount),
    riskMarginPercent: updates.riskMarginPercent ?? decimalString(configuration.riskMarginPercent),
    targetProfitMarginPercent: updates.targetProfitMarginPercent ?? decimalString(configuration.targetProfitMarginPercent),
    salesCommissionPercent: updates.salesCommissionPercent ?? decimalString(configuration.salesCommissionPercent),
    bankCommissionPercent: updates.bankCommissionPercent ?? decimalString(configuration.bankCommissionPercent),
    applicableTaxPercent: updates.applicableTaxPercent ?? decimalString(configuration.applicableTaxPercent),
  };
}

function decimalString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toString" in value) return String(value);
  throw new BadRequestException("Invalid persisted pricing decimal.");
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
