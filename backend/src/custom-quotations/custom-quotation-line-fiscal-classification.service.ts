import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { runTenantTransaction } from "../tenant/tenant-transaction";

type Tx = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  customQuotation: Record<string, (...args: any[]) => Promise<any>>;
  customQuotationCostingProjectLink: Record<string, (...args: any[]) => Promise<any>>;
  costComponent: Record<string, (...args: any[]) => Promise<any>>;
  tenantFiscalClassification: Record<string, (...args: any[]) => Promise<any>>;
  customQuotationComponentFiscalClassification: Record<string, (...args: any[]) => Promise<any>>;
};
type Database = { $transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> };

/** Draft-only selection boundary; it never mutates Cost Engine components. */
@Injectable()
export class CustomQuotationLineFiscalClassificationService {
  private readonly database: Database;

  constructor(prisma: PrismaService) {
    this.database = prisma as unknown as Database;
  }

  async context(tenantId: string, quotationId: string) {
    return this.withTransaction(tenantId, async (tx) => {
      const quotation = await tx.customQuotation.findFirst({ where: { id: quotationId, tenantId }, select: { id: true } });
      if (!quotation) throw new NotFoundException("CUSTOM_QUOTATION_NOT_FOUND");
      const [classifications, selections] = await Promise.all([
        tx.tenantFiscalClassification.findMany({
          where: { tenantId, isActive: true },
          select: { id: true, displayName: true, description: true, fiscalItemCategory: true, cabysCode: true, unitOfMeasureCode: true, taxCode: true, taxRateCode: true, taxPercentage: true },
          orderBy: [{ displayName: "asc" }, { id: "asc" }],
          take: 25,
        }),
        tx.customQuotationComponentFiscalClassification.findMany({
          where: { tenantId, customQuotationId: quotationId },
          select: { costComponentId: true, fiscalClassificationId: true },
        }),
      ]);
      return {
        classifications: classifications.map((classification: any) => ({ ...classification, taxPercentage: classification.taxPercentage.toFixed(4) })),
        selections: selections.map((selection: any) => ({ costComponentId: selection.costComponentId, fiscalClassificationId: selection.fiscalClassificationId })),
      };
    });
  }

  async assign(tenantId: string, quotationId: string, costComponentId: string, fiscalClassificationId: string) {
    return this.withTransaction(tenantId, async (tx) => {
      const quotation = await tx.customQuotation.findFirst({ where: { id: quotationId, tenantId, status: "DRAFT" }, select: { id: true } });
      if (!quotation) throw new ConflictException("CUSTOM_QUOTATION_NOT_DRAFT");
      const link = await tx.customQuotationCostingProjectLink.findFirst({ where: { tenantId, customQuotationId: quotationId }, select: { costingProjectId: true } });
      if (!link) throw new NotFoundException("CUSTOM_QUOTATION_COSTING_PROJECT_NOT_FOUND");
      const [component, classification] = await Promise.all([
        tx.costComponent.findFirst({ where: { id: costComponentId, tenantId, costingProjectId: link.costingProjectId, status: "ACTIVE" }, select: { id: true } }),
        tx.tenantFiscalClassification.findFirst({ where: { id: fiscalClassificationId, tenantId, isActive: true }, select: { id: true } }),
      ]);
      if (!component) throw new NotFoundException("CUSTOM_QUOTATION_COMMERCIAL_LINE_NOT_FOUND");
      if (!classification) throw new NotFoundException("FISCAL_CLASSIFICATION_NOT_FOUND");
      await tx.customQuotationComponentFiscalClassification.upsert({
        where: { tenantId_customQuotationId_costComponentId: { tenantId, customQuotationId: quotationId, costComponentId } },
        create: { tenantId, customQuotationId: quotationId, costComponentId, fiscalClassificationId },
        update: { fiscalClassificationId },
      });
      return { costComponentId, fiscalClassificationId };
    });
  }

  private withTransaction<T>(tenantId: string, work: (tx: Tx) => Promise<T>) {
    return runTenantTransaction(this.database, tenantId, work);
  }
}
