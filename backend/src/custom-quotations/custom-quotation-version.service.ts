import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { CostingProjectCurrentCostReader } from "../cost-engine/costing-project-current-cost-reader";
import { pricingAmountsEqual } from "../pricing/pricing-v1-calculator";
import { PricingService } from "../pricing/pricing.service";
import type { PricingTransaction } from "../pricing/pricing.repository";
import { PrismaService } from "../prisma/prisma.service";
import { runTenantTransaction } from "../tenant/tenant-transaction";
import type { CustomQuotationActor } from "./custom-quotations.service";

type CustomQuotationIssueTransaction = PricingTransaction & {
  customQuotation: Record<string, (...args: any[]) => Promise<any>>;
  customQuotationLine: Record<string, (...args: any[]) => Promise<any>>;
  customQuotationVersion: Record<string, (...args: any[]) => Promise<any>>;
  customQuotationVersionLine: Record<string, (...args: any[]) => Promise<any>>;
  tenantFiscalClassification: Record<string, (...args: any[]) => Promise<any>>;
};

type CustomQuotationIssueDatabase = {
  $transaction<T>(work: (transaction: CustomQuotationIssueTransaction) => Promise<T>): Promise<T>;
};

@Injectable()
export class CustomQuotationVersionService {
  private readonly database: CustomQuotationIssueDatabase;

  constructor(
    prisma: PrismaService,
    private readonly currentCosts: CostingProjectCurrentCostReader,
    private readonly pricing: PricingService,
  ) {
    this.database = prisma as unknown as CustomQuotationIssueDatabase;
  }

  async issue(tenantId: string, quotationId: string, actor: CustomQuotationActor) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "custom_quotations"
        WHERE "id" = ${quotationId} AND "tenantId" = ${tenantId}
        FOR UPDATE
      `;
      if (locked.length !== 1) throw new NotFoundException("CUSTOM_QUOTATION_NOT_FOUND");

      const quotation = await tx.customQuotation.findFirst({
        where: { id: quotationId, tenantId },
        select: {
          id: true,
          quotationNumber: true,
          currency: true,
          commercialObservations: true,
          quotationValidUntil: true,
          paymentConditionType: true,
          paymentTermValue: true,
          paymentTermUnit: true,
          fiscalClassificationId: true,
          status: true,
          costingProjectLink: { select: { costingProject: { select: { id: true, baseCurrency: true } } } },
        },
      });
      if (!quotation) throw new NotFoundException("CUSTOM_QUOTATION_NOT_FOUND");
      if (quotation.status !== "DRAFT") throw new ConflictException("CUSTOM_QUOTATION_NOT_DRAFT");
      const costingProject = quotation.costingProjectLink?.costingProject;
      if (!costingProject) throw new NotFoundException("CUSTOM_QUOTATION_COSTING_PROJECT_NOT_FOUND");
      if (costingProject.baseCurrency !== quotation.currency) {
        throw new ConflictException("CUSTOM_QUOTATION_COSTING_CURRENCY_MISMATCH");
      }
      validatePaymentTerms(quotation);
      validateValidityDate(quotation.quotationValidUntil);

      const lines = await tx.customQuotationLine.findMany({
        where: { tenantId, customQuotationId: quotationId },
        orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
      });
      if (lines.length === 0) throw new BadRequestException("CUSTOM_QUOTATION_LINES_REQUIRED");

      const fiscalClassification = await tx.tenantFiscalClassification.findFirst({
        where: { id: quotation.fiscalClassificationId, tenantId },
      });
      if (!fiscalClassification) throw new NotFoundException("CUSTOM_QUOTATION_FISCAL_CLASSIFICATION_NOT_FOUND");
      if (!fiscalClassification.isActive) {
        throw new BadRequestException("CUSTOM_QUOTATION_FISCAL_CLASSIFICATION_INACTIVE");
      }

      const pricingCalculation = await tx.pricingCalculationVersion.findFirst({
        where: { tenantId, costingProjectId: costingProject.id },
        orderBy: [{ versionNumber: "desc" }, { id: "desc" }],
      });
      if (!pricingCalculation) throw new NotFoundException("CUSTOM_QUOTATION_PRICING_CALCULATION_NOT_FOUND");
      if (pricingCalculation.currency !== quotation.currency) {
        throw new ConflictException("CUSTOM_QUOTATION_PRICING_CURRENCY_MISMATCH");
      }
      if (pricingCalculation.status !== "DRAFT" && pricingCalculation.status !== "APPROVED") {
        throw new ConflictException("CUSTOM_QUOTATION_PRICING_CALCULATION_NOT_ISSUABLE");
      }

      const currentCost = await this.currentCosts.read(tx, tenantId, costingProject.id);
      if (!pricingAmountsEqual(decimalString(pricingCalculation.authoritativeCostAmount), currentCost.authoritativeTotalCost)) {
        throw new ConflictException("CUSTOM_QUOTATION_PRICING_CALCULATION_STALE");
      }
      const approvedCalculation = pricingCalculation.status === "DRAFT"
        ? await this.pricing.approveCalculationInTransaction(tx, tenantId, pricingCalculation.id, actor)
        : pricingCalculation;

      const latest = await tx.customQuotationVersion.findFirst({
        where: { tenantId, customQuotationId: quotation.id },
        orderBy: [{ versionNumber: "desc" }, { id: "desc" }],
        select: { versionNumber: true },
      });
      const version = await tx.customQuotationVersion.create({
        data: {
          tenantId,
          customQuotationId: quotation.id,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          status: "ISSUED",
          currency: quotation.currency,
          finalSellingPrice: approvedCalculation.finalSellingPrice,
          quotationValidUntil: quotation.quotationValidUntil,
          paymentConditionType: quotation.paymentConditionType,
          paymentTermValue: quotation.paymentTermValue,
          paymentTermUnit: quotation.paymentTermUnit,
          commercialObservations: quotation.commercialObservations,
          costingProjectId: costingProject.id,
          pricingCalculationVersionId: approvedCalculation.id,
          fiscalClassificationId: fiscalClassification.id,
          fiscalDescription: fiscalDescription(fiscalClassification),
          fiscalItemCategory: fiscalClassification.fiscalItemCategory,
          cabysCode: fiscalClassification.cabysCode,
          unitOfMeasureCode: fiscalClassification.unitOfMeasureCode,
          taxCode: fiscalClassification.taxCode,
          taxRateCode: fiscalClassification.taxRateCode,
          fiscalTaxPercentage: fiscalClassification.taxPercentage,
          createdByUserId: actor.userId,
          createdByName: actor.name,
        },
      });
      const copiedLines = await tx.customQuotationVersionLine.createMany({
        data: lines.map((line: any) => ({
          tenantId,
          customQuotationVersionId: version.id,
          displayOrder: line.displayOrder,
          description: line.description,
          quantity: line.quantity,
          commercialNote: line.commercialNote,
        })),
      });
      if (copiedLines.count !== lines.length) throw new ConflictException("CUSTOM_QUOTATION_VERSION_LINES_COPY_CONFLICT");

      const transitioned = await tx.customQuotation.updateMany({
        where: { id: quotation.id, tenantId, status: "DRAFT" },
        data: { status: "ISSUED", updatedByUserId: actor.userId, updatedByName: actor.name },
      });
      if (transitioned.count !== 1) throw new ConflictException("CUSTOM_QUOTATION_ISSUE_CONFLICT");

      return issuedVersionResponse(version, quotation.quotationNumber, lines);
    });
  }

  private withTenantTransaction<T>(tenantId: string, work: (tx: CustomQuotationIssueTransaction) => Promise<T>) {
    return runTenantTransaction(this.database, tenantId, work);
  }
}

function validatePaymentTerms(quotation: {
  paymentConditionType: string | null;
  paymentTermValue: number | null;
  paymentTermUnit: string | null;
}) {
  const { paymentConditionType: condition, paymentTermValue: value, paymentTermUnit: unit } = quotation;
  const valid = (condition === null && value === null && unit === null)
    || (condition === "CASH" && value === null && unit === null)
    || (condition === "CREDIT" && Number.isInteger(value) && value !== null && value > 0 && !!unit);
  if (!valid) throw new BadRequestException("CUSTOM_QUOTATION_PAYMENT_TERMS_INVALID");
}

function validateValidityDate(value: Date | null) {
  if (value !== null && !Number.isFinite(value.getTime())) {
    throw new BadRequestException("CUSTOM_QUOTATION_VALID_UNTIL_INVALID");
  }
}

function fiscalDescription(classification: { displayName: string; description: string | null }) {
  return classification.description?.trim() || classification.displayName;
}

function decimalString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toString" in value) return String(value);
  throw new ConflictException("CUSTOM_QUOTATION_PRICING_DECIMAL_INVALID");
}

function issuedVersionResponse(version: any, quotationNumber: string, lines: any[]) {
  return {
    customQuotationVersionId: version.id,
    quotationId: version.customQuotationId,
    versionNumber: version.versionNumber,
    quotationNumber,
    currency: version.currency,
    finalSellingPrice: decimalString(version.finalSellingPrice),
    quotationValidUntil: version.quotationValidUntil,
    status: version.status,
    createdAt: version.createdAt,
    lines: lines.map((line) => ({
      displayOrder: line.displayOrder,
      description: line.description,
      quantity: decimalString(line.quantity),
      commercialNote: line.commercialNote,
    })),
  };
}
