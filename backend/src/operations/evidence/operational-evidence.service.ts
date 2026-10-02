import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { OperationalEvidenceType } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../storage/storage.service";
import { processUploadedDocument } from "../../storage/uploaded-document-processor";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import { CreateOperationalEvidenceDto, ListOperationalEvidenceDto } from "./dto/operational-evidence.dto";

export const MAX_OPERATIONAL_EVIDENCE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const SIGNED_ACCESS_SECONDS = 900;

export type OperationalEvidenceActor = { userId: string; name: string };
export type OperationalEvidenceFile = { buffer: Buffer; mimetype: string; originalname: string; size: number };

type Tx = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  operationalRequirement: Record<string, (...args: any[]) => Promise<any>>;
  operationalFulfillment: Record<string, (...args: any[]) => Promise<any>>;
  operationalPurchase: Record<string, (...args: any[]) => Promise<any>>;
  operationalEvidence: Record<string, (...args: any[]) => Promise<any>>;
};
type Database = { $transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> };
type Evidence = {
  id: string; travelPackageId: string; operationalFulfillmentId: string | null; operationalPurchaseId: string | null;
  evidenceType: OperationalEvidenceType; objectKey: string; originalFilename: string; mimeType: string; byteSize: number;
  contentHash: string | null; uploadedByUserId: string; uploadedByName: string; createdAt: Date;
};

const EVIDENCE_SELECT = {
  id: true, travelPackageId: true, operationalFulfillmentId: true, operationalPurchaseId: true, evidenceType: true,
  objectKey: true, originalFilename: true, mimeType: true, byteSize: true, contentHash: true,
  uploadedByUserId: true, uploadedByName: true, createdAt: true,
} as const;

@Injectable()
export class OperationalEvidenceService {
  private readonly database: Database;
  private readonly logger = new Logger(OperationalEvidenceService.name);

  constructor(prisma: PrismaService, private readonly storage: StorageService) {
    this.database = prisma as unknown as Database;
  }

  async upload(tenantId: string, travelPackageId: string, requirementId: string, fulfillmentId: string, input: CreateOperationalEvidenceDto, file: OperationalEvidenceFile | undefined, actor: OperationalEvidenceActor) {
    validateFile(file);
    const prepared = await prepareFile(file);
    await this.withTransaction(tenantId, (tx) => this.requireHierarchy(tx, tenantId, travelPackageId, requirementId, fulfillmentId, input.operationalPurchaseId));

    const objectKey = evidenceObjectKey(tenantId, travelPackageId, fulfillmentId, prepared.fileName);
    try {
      await this.storage.uploadObject({ objectKey, contentType: prepared.mimeType, body: prepared.bytes });
    } catch {
      throw new InternalServerErrorException("OPERATIONAL_EVIDENCE_STORAGE_UPLOAD_FAILED");
    }

    try {
      return await this.withTransaction(tenantId, async (tx) => {
        await this.requireHierarchy(tx, tenantId, travelPackageId, requirementId, fulfillmentId, input.operationalPurchaseId);
        const evidence = await tx.operationalEvidence.create({
          data: {
            tenantId, travelPackageId, operationalFulfillmentId: fulfillmentId, operationalPurchaseId: input.operationalPurchaseId ?? null,
            evidenceType: input.evidenceType, objectKey, originalFilename: prepared.fileName, mimeType: prepared.mimeType,
            byteSize: prepared.bytes.length, contentHash: createHash("sha256").update(prepared.bytes).digest("hex"),
            uploadedByUserId: actor.userId, uploadedByName: actor.name,
          },
          select: EVIDENCE_SELECT,
        }) as Evidence;
        return toResponse(evidence);
      });
    } catch {
      await this.storage.deleteObject(objectKey).catch((cleanupError: unknown) => {
        this.logger.error("Operational evidence metadata persistence cleanup failed", cleanupError instanceof Error ? cleanupError.stack : undefined);
      });
      throw new InternalServerErrorException("OPERATIONAL_EVIDENCE_METADATA_PERSISTENCE_FAILED");
    }
  }

  async list(tenantId: string, travelPackageId: string, requirementId: string, fulfillmentId: string, input: ListOperationalEvidenceDto) {
    const page = integer(input.page, 1);
    const pageSize = pageSizeValue(input.pageSize);
    const where = {
      tenantId, travelPackageId, operationalFulfillmentId: fulfillmentId,
      ...(input.evidenceType === undefined ? {} : { evidenceType: input.evidenceType }),
      ...(input.operationalPurchaseId === undefined ? {} : { operationalPurchaseId: input.operationalPurchaseId }),
    };
    return this.withTransaction(tenantId, async (tx) => {
      await this.requireHierarchy(tx, tenantId, travelPackageId, requirementId, fulfillmentId);
      const [items, total] = await Promise.all([
        tx.operationalEvidence.findMany({ where, select: EVIDENCE_SELECT, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }) as Promise<Evidence[]>,
        tx.operationalEvidence.count({ where }) as Promise<number>,
      ]);
      return { items: items.map(toResponse), total, page, pageSize, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) };
    });
  }

  async find(tenantId: string, travelPackageId: string, requirementId: string, fulfillmentId: string, evidenceId: string) {
    return this.withTransaction(tenantId, async (tx) => {
      const evidence = await this.findEvidence(tx, tenantId, travelPackageId, requirementId, fulfillmentId, evidenceId);
      if (!evidence) throw new NotFoundException("OPERATIONAL_EVIDENCE_NOT_FOUND");
      return toResponse(evidence);
    });
  }

  async getAccess(tenantId: string, travelPackageId: string, requirementId: string, fulfillmentId: string, evidenceId: string) {
    const evidence = await this.withTransaction(tenantId, async (tx) => {
      const found = await this.findEvidence(tx, tenantId, travelPackageId, requirementId, fulfillmentId, evidenceId);
      if (!found) throw new NotFoundException("OPERATIONAL_EVIDENCE_NOT_FOUND");
      return found;
    });
    try {
      return { id: evidence.id, originalFilename: evidence.originalFilename, mimeType: evidence.mimeType, byteSize: evidence.byteSize, url: await this.storage.generateSignedUrl(evidence.objectKey, SIGNED_ACCESS_SECONDS), expiresInSeconds: SIGNED_ACCESS_SECONDS };
    } catch {
      throw new InternalServerErrorException("OPERATIONAL_EVIDENCE_SIGNED_ACCESS_FAILED");
    }
  }

  async remove(tenantId: string, travelPackageId: string, requirementId: string, fulfillmentId: string, evidenceId: string) {
    const evidence = await this.withTransaction(tenantId, async (tx) => {
      const found = await this.findEvidence(tx, tenantId, travelPackageId, requirementId, fulfillmentId, evidenceId);
      if (!found) throw new NotFoundException("OPERATIONAL_EVIDENCE_NOT_FOUND");
      const deleted = await tx.operationalEvidence.deleteMany({ where: { id: evidenceId, tenantId, travelPackageId, operationalFulfillmentId: fulfillmentId } });
      if (deleted.count !== 1) throw new NotFoundException("OPERATIONAL_EVIDENCE_NOT_FOUND");
      return found;
    });
    try {
      await this.storage.deleteObject(evidence.objectKey);
    } catch (error) {
      this.logger.error("Operational evidence object cleanup failed after metadata deletion", error instanceof Error ? error.stack : undefined);
      throw new InternalServerErrorException("OPERATIONAL_EVIDENCE_STORAGE_DELETE_FAILED");
    }
    return { id: evidence.id, deleted: true };
  }

  private async requireHierarchy(tx: Tx, tenantId: string, travelPackageId: string, requirementId: string, fulfillmentId: string, purchaseId?: string) {
    const requirement = await tx.operationalRequirement.findFirst({ where: { id: requirementId, tenantId, travelPackageId }, select: { id: true } });
    if (!requirement) throw new NotFoundException("OPERATIONAL_REQUIREMENT_NOT_FOUND");
    const fulfillment = await tx.operationalFulfillment.findFirst({ where: { id: fulfillmentId, tenantId, travelPackageId, operationalRequirementId: requirementId }, select: { id: true } });
    if (!fulfillment) throw new NotFoundException("OPERATIONAL_FULFILLMENT_NOT_FOUND");
    if (!purchaseId) return;
    const purchase = await tx.operationalPurchase.findFirst({ where: { id: purchaseId, tenantId, travelPackageId, operationalFulfillmentId: fulfillmentId }, select: { id: true } });
    if (!purchase) throw new NotFoundException("OPERATIONAL_PURCHASE_NOT_FOUND");
  }

  private async findEvidence(tx: Tx, tenantId: string, travelPackageId: string, requirementId: string, fulfillmentId: string, evidenceId: string): Promise<Evidence | null> {
    await this.requireHierarchy(tx, tenantId, travelPackageId, requirementId, fulfillmentId);
    return tx.operationalEvidence.findFirst({ where: { id: evidenceId, tenantId, travelPackageId, operationalFulfillmentId: fulfillmentId }, select: EVIDENCE_SELECT }) as Promise<Evidence | null>;
  }

  private withTransaction<T>(tenantId: string, work: (tx: Tx) => Promise<T>) { return runTenantTransaction(this.database, tenantId, work); }
}

function validateFile(file: OperationalEvidenceFile | undefined): asserts file is OperationalEvidenceFile {
  if (!file || !Buffer.isBuffer(file.buffer) || !ALLOWED_MIME_TYPES.has(file.mimetype) || !Number.isInteger(file.size) || file.size !== file.buffer.length || file.size < 1) throw new BadRequestException("OPERATIONAL_EVIDENCE_FILE_INVALID");
  if (file.size > MAX_OPERATIONAL_EVIDENCE_BYTES) throw new BadRequestException("OPERATIONAL_EVIDENCE_FILE_TOO_LARGE");
}

async function prepareFile(file: OperationalEvidenceFile) {
  try {
    const processed = await processUploadedDocument({ bytes: file.buffer, mimeType: file.mimetype, originalFileName: file.originalname });
    if (processed.bytes.length > MAX_OPERATIONAL_EVIDENCE_BYTES) throw new BadRequestException("OPERATIONAL_EVIDENCE_FILE_TOO_LARGE");
    return { bytes: processed.bytes, mimeType: processed.mimeType, fileName: safeFileName(processed.fileName) };
  } catch (error) {
    if (error instanceof BadRequestException && error.getResponse() === "OPERATIONAL_EVIDENCE_FILE_TOO_LARGE") throw error;
    throw new BadRequestException("OPERATIONAL_EVIDENCE_FILE_INVALID");
  }
}

function evidenceObjectKey(tenantId: string, travelPackageId: string, fulfillmentId: string, fileName: string) {
  return ["operations", safeSegment(tenantId), safeSegment(travelPackageId), safeSegment(fulfillmentId), `${randomUUID()}-${safeFileName(fileName)}`].join("/");
}
function safeSegment(value: string) { return String(value).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 191) || "unknown"; }
function safeFileName(value: string) { const fileName = String(value).split(/[\\/]/).pop() ?? "evidence"; return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "evidence"; }
function integer(value: number | undefined, fallback: number) { return Number.isInteger(value) && value! > 0 ? value! : fallback; }
function pageSizeValue(value: number | undefined) { if (value === undefined) return 20; if (!Number.isInteger(value) || value < 1 || value > 25) throw new BadRequestException("OPERATIONAL_EVIDENCE_PAGE_SIZE_INVALID"); return value; }
function toResponse(evidence: Evidence) { return { id: evidence.id, travelPackageId: evidence.travelPackageId, fulfillmentId: evidence.operationalFulfillmentId, purchaseId: evidence.operationalPurchaseId, evidenceType: evidence.evidenceType, originalFilename: evidence.originalFilename, mimeType: evidence.mimeType, byteSize: evidence.byteSize, contentHash: evidence.contentHash, uploadedBy: { userId: evidence.uploadedByUserId, name: evidence.uploadedByName }, createdAt: evidence.createdAt }; }
