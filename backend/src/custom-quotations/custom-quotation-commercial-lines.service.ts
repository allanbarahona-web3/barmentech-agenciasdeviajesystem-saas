import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { runTenantTransaction } from "../tenant/tenant-transaction";
import { mapCostComponentsToCommercialLines, type DerivedCommercialLine } from "./custom-quotation-commercial-line.mapper";

type CommercialLinesTransaction = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  customQuotation: Record<string, (...args: any[]) => Promise<any>>;
  customQuotationCostingProjectLink: Record<string, (...args: any[]) => Promise<any>>;
  costComponent: Record<string, (...args: any[]) => Promise<any>>;
};

type CommercialLinesDatabase = {
  $transaction<T>(work: (transaction: CommercialLinesTransaction) => Promise<T>): Promise<T>;
};

@Injectable()
export class CustomQuotationCommercialLinesService {
  private readonly database: CommercialLinesDatabase;

  constructor(prisma: PrismaService) {
    this.database = prisma as unknown as CommercialLinesDatabase;
  }

  async list(tenantId: string, quotationId: string) {
    return this.withTenantTransaction(tenantId, async (tx) => ({ lines: await this.listInTransaction(tx, tenantId, quotationId) }));
  }

  async listInTransaction(tx: CommercialLinesTransaction, tenantId: string, quotationId: string): Promise<DerivedCommercialLine[]> {
    const quotation = await tx.customQuotation.findFirst({
      where: { id: quotationId, tenantId },
      select: { id: true },
    });
    if (!quotation) throw new NotFoundException("CUSTOM_QUOTATION_NOT_FOUND");

    const link = await tx.customQuotationCostingProjectLink.findFirst({
      where: { tenantId, customQuotationId: quotation.id },
      select: { costingProjectId: true },
    });
    if (!link) return [];

    const components = await tx.costComponent.findMany({
      where: { tenantId, costingProjectId: link.costingProjectId, status: "ACTIVE" },
      select: {
        id: true, title: true, description: true, detailPayload: true, detailSchemaVersion: true, quantity: true, unit: true,
        costCategory: { select: { code: true, origin: true } },
      },
      orderBy: [{ sortPosition: "asc" }, { id: "asc" }],
    });
    return mapCostComponentsToCommercialLines(components);
  }

  private withTenantTransaction<T>(tenantId: string, work: (tx: CommercialLinesTransaction) => Promise<T>) {
    return runTenantTransaction(this.database, tenantId, work);
  }
}
