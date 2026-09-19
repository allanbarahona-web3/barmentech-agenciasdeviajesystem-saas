import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { StorageService } from "../storage/storage.service";
import { processUploadedDocument } from "../storage/uploaded-document-processor";
import { CostActor, CostEngineRepository } from "./cost-engine.repository";

const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export type CostEvidenceFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

export type PreparedCostEvidence = {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
};

@Injectable()
export class CostEvidenceService {
  constructor(
    private readonly repository: CostEngineRepository,
    private readonly storage: StorageService,
  ) {}

  async upload(tenantId: string, costSnapshotId: string, file: CostEvidenceFile | undefined, actor: CostActor) {
    validateEvidenceFile(file);
    await this.repository.assertSnapshotAccess(tenantId, costSnapshotId);
    const prepared = await this.prepare(file);
    return this.persist(tenantId, costSnapshotId, prepared, actor);
  }

  async prepare(file: CostEvidenceFile | undefined): Promise<PreparedCostEvidence> {
    validateEvidenceFile(file);
    const processed = await processUploadedDocument({ bytes: file.buffer, mimeType: file.mimetype, originalFileName: file.originalname });
    return { bytes: processed.bytes, mimeType: processed.mimeType, fileName: processed.fileName };
  }

  async uploadAgentInitial(tenantId: string, costSnapshotId: string, file: CostEvidenceFile | undefined, actor: CostActor) {
    validateEvidenceFile(file);
    await this.repository.assertAgentInitialSnapshotEvidenceAccess(tenantId, costSnapshotId, actor.userId);
    return this.persist(tenantId, costSnapshotId, await this.prepare(file), actor);
  }

  async uploadPreparedAgentInitial(tenantId: string, costSnapshotId: string, prepared: PreparedCostEvidence, actor: CostActor) {
    await this.repository.assertAgentInitialSnapshotEvidenceAccess(tenantId, costSnapshotId, actor.userId);
    return this.persist(tenantId, costSnapshotId, prepared, actor);
  }

  private async persist(tenantId: string, costSnapshotId: string, prepared: PreparedCostEvidence, actor: CostActor) {
    const objectKey = evidenceObjectKey(tenantId, costSnapshotId, prepared.fileName);
    await this.storage.putObjectIfAbsent({ objectKey, contentType: prepared.mimeType, body: prepared.bytes });
    try {
      return await this.repository.createEvidence(tenantId, costSnapshotId, {
        objectKey,
        originalFileName: safeFileName(prepared.fileName),
        mimeType: prepared.mimeType,
        byteSize: prepared.bytes.length,
        contentHash: createHash("sha256").update(prepared.bytes).digest("hex"),
        uploadedByUserId: actor.userId,
        uploadedByName: actor.name,
      });
    } catch (error) {
      await this.storage.deleteObject(objectKey).catch(() => undefined);
      throw error;
    }
  }

  async list(tenantId: string, costSnapshotId: string, page = 1, pageSize = 20) {
    const result = await this.repository.listEvidence(tenantId, costSnapshotId, page, pageSize);
    return {
      evidence: result.evidence,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: Math.ceil(result.total / result.pageSize),
    };
  }

  async getAccess(tenantId: string, costSnapshotId: string, costEvidenceId: string) {
    const evidence = await this.repository.findEvidenceForAccess(tenantId, costSnapshotId, costEvidenceId);
    if (!evidence) throw new NotFoundException("Cost evidence not found.");
    return {
      id: evidence.id,
      originalFileName: evidence.originalFileName,
      mimeType: evidence.mimeType,
      byteSize: evidence.byteSize,
      url: await this.storage.generateSignedUrl(evidence.objectKey, 900),
    };
  }
}

function validateEvidenceFile(file: CostEvidenceFile | undefined): asserts file is CostEvidenceFile {
  if (!file || !Buffer.isBuffer(file.buffer) || !ALLOWED_MIME_TYPES.has(file.mimetype) || !Number.isInteger(file.size) || file.size !== file.buffer.length || file.size < 1 || file.size > MAX_EVIDENCE_BYTES) {
    throw new BadRequestException("Invalid Cost Engine evidence file.");
  }
}

function evidenceObjectKey(tenantId: string, costSnapshotId: string, fileName: string): string {
  return ["cost-engine", "evidence", safeSegment(tenantId), safeSegment(costSnapshotId), `${randomUUID()}-${safeFileName(fileName)}`].join("/");
}

function safeSegment(value: string): string {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 191) || "unknown";
}

function safeFileName(value: string): string {
  const fileName = String(value).split(/[\\/]/).pop() ?? "evidence";
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "evidence";
}
