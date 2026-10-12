import { Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../storage/storage.service";

const SIGNED_ACCESS_SECONDS = 900;
const select = { id: true, originalFilename: true, mimeType: true, byteSize: true, evidenceType: true, createdAt: true, objectKey: true } as const;

/** Read-only report evidence reader. It deliberately scopes only direct purchase evidence. */
@Injectable()
export class AccountingCostEvidenceService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}
  async list(tenantId: string, purchaseId: string, page: number, pageSize: number) {
    await this.purchase(tenantId, purchaseId);
    const where = { tenantId, operationalPurchaseId: purchaseId };
    const [items, totalItems] = await Promise.all([
      this.prisma.operationalEvidence.findMany({ where, select, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.operationalEvidence.count({ where }),
    ]);
    return { items: items.map(metadata), pagination: { page, pageSize, totalItems, totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize) } };
  }
  async access(tenantId: string, purchaseId: string, evidenceId: string) {
    await this.purchase(tenantId, purchaseId);
    const evidence = await this.prisma.operationalEvidence.findFirst({ where: { id: evidenceId, tenantId, operationalPurchaseId: purchaseId }, select });
    if (!evidence) throw new NotFoundException("ACCOUNTING_COST_EVIDENCE_NOT_FOUND");
    try { return { ...metadata(evidence), url: await this.storage.generateSignedUrl(evidence.objectKey, SIGNED_ACCESS_SECONDS), expiresInSeconds: SIGNED_ACCESS_SECONDS }; }
    catch { throw new InternalServerErrorException("ACCOUNTING_COST_EVIDENCE_SIGNED_ACCESS_FAILED"); }
  }
  private async purchase(tenantId: string, id: string) { const purchase = await this.prisma.operationalPurchase.findFirst({ where: { id, tenantId }, select: { id: true } }); if (!purchase) throw new NotFoundException("ACCOUNTING_COST_SOURCE_NOT_FOUND"); }
}
function metadata(evidence: any) { return { id: evidence.id, originalFilename: evidence.originalFilename, mimeType: evidence.mimeType, byteSize: evidence.byteSize, evidenceType: evidence.evidenceType, createdAt: evidence.createdAt }; }
