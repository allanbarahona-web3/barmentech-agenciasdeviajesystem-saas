import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { processUploadedDocument } from "../storage/uploaded-document-processor";

export const MAX_ADDITIONAL_SERVICE_COST_EVIDENCE_BYTES = 10 * 1024 * 1024;
const SIGNED_ACCESS_SECONDS = 900;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type AdditionalServiceCommercialCostEvidenceFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

export type PreparedAdditionalServiceCostEvidence = {
  objectKey: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  contentHash: string;
  bytes: Buffer;
};

type OrderLine = {
  id: string;
  costEvidenceObjectKey: string | null;
  costEvidenceOriginalFilename: string | null;
  costEvidenceMimeType: string | null;
  costEvidenceByteSize: number | null;
  order: { commercialStatus: string | null };
};

type Database = {
  additionalServiceOrderLine: {
    findFirst(args: unknown): Promise<OrderLine | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
};

@Injectable()
export class AdditionalServiceCommercialCostEvidenceService {
  private readonly database: Database;
  private readonly logger = new Logger(
    AdditionalServiceCommercialCostEvidenceService.name,
  );

  constructor(
    prisma: PrismaService,
    private readonly storage: StorageService,
  ) {
    this.database = prisma as unknown as Database;
  }

  async upload(
    tenantId: string,
    orderId: string,
    lineId: string,
    file: AdditionalServiceCommercialCostEvidenceFile | undefined,
  ) {
    validateFile(file);
    const line = await this.requireLine(tenantId, orderId, lineId);
    this.requireMutable(line);
    const processed = await processUploadedDocument({
      bytes: file.buffer,
      mimeType: file.mimetype,
      originalFileName: file.originalname,
    });
    if (processed.bytes.length > MAX_ADDITIONAL_SERVICE_COST_EVIDENCE_BYTES) {
      throw new BadRequestException("Cost evidence image exceeds the allowed size.");
    }

    const objectKey = evidenceObjectKey(tenantId, orderId, lineId, processed.fileName);
    try {
      await this.storage.uploadObject({
        objectKey,
        contentType: processed.mimeType,
        body: processed.bytes,
      });
    } catch {
      throw new InternalServerErrorException(
        "ADDITIONAL_SERVICE_COST_EVIDENCE_STORAGE_UPLOAD_FAILED",
      );
    }

    try {
      const updated = await this.database.additionalServiceOrderLine.updateMany({
        where: {
          id: lineId,
          orderId,
          tenantId,
          order: {
            OR: [
              { commercialStatus: null },
              { commercialStatus: { not: "APPROVED" } },
            ],
          },
        },
        data: {
          costEvidenceObjectKey: objectKey,
          costEvidenceOriginalFilename: safeFileName(file.originalname),
          costEvidenceMimeType: processed.mimeType,
          costEvidenceByteSize: processed.bytes.length,
          costEvidenceContentHash: createHash("sha256")
            .update(processed.bytes)
            .digest("hex"),
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          "ADDITIONAL_SERVICE_COST_EVIDENCE_ORDER_APPROVED",
        );
      }
    } catch (error) {
      await this.storage.deleteObject(objectKey).catch((cleanupError: unknown) => {
        this.logger.error(
          "Commercial cost-evidence metadata persistence cleanup failed",
          cleanupError instanceof Error ? cleanupError.stack : undefined,
        );
      });
      throw error;
    }

    if (
      line.costEvidenceObjectKey &&
      line.costEvidenceObjectKey !== objectKey
    ) {
      try {
        await this.storage.deleteObject(line.costEvidenceObjectKey);
      } catch (error) {
        this.logger.error(
          "Commercial cost-evidence replacement cleanup failed",
          error instanceof Error ? error.stack : undefined,
        );
        throw new InternalServerErrorException(
          "ADDITIONAL_SERVICE_COST_EVIDENCE_REPLACEMENT_CLEANUP_FAILED",
        );
      }
    }

    return {
      hasCostEvidence: true,
      costEvidenceOriginalFilename: safeFileName(file.originalname),
      costEvidenceMimeType: processed.mimeType,
      costEvidenceByteSize: processed.bytes.length,
    };
  }

  async prepareForOrderCreation(
    tenantId: string,
    orderId: string,
    lineId: string,
    file: AdditionalServiceCommercialCostEvidenceFile | undefined,
  ): Promise<PreparedAdditionalServiceCostEvidence> {
    validateFile(file);
    const processed = await processUploadedDocument({
      bytes: file.buffer,
      mimeType: file.mimetype,
      originalFileName: file.originalname,
    });
    if (processed.bytes.length > MAX_ADDITIONAL_SERVICE_COST_EVIDENCE_BYTES) {
      throw new BadRequestException("Cost evidence image exceeds the allowed size.");
    }

    return {
      objectKey: evidenceObjectKey(tenantId, orderId, lineId, processed.fileName),
      originalFilename: safeFileName(file.originalname),
      mimeType: processed.mimeType,
      byteSize: processed.bytes.length,
      contentHash: createHash("sha256").update(processed.bytes).digest("hex"),
      bytes: processed.bytes,
    };
  }

  async uploadPreparedForOrderCreation(
    evidence: PreparedAdditionalServiceCostEvidence,
  ): Promise<void> {
    try {
      await this.storage.uploadObject({
        objectKey: evidence.objectKey,
        contentType: evidence.mimeType,
        body: evidence.bytes,
      });
    } catch {
      throw new InternalServerErrorException(
        "ADDITIONAL_SERVICE_COST_EVIDENCE_STORAGE_UPLOAD_FAILED",
      );
    }
  }

  async cleanupPreparedForOrderCreation(objectKey: string): Promise<void> {
    await this.storage.deleteObject(objectKey);
  }

  async getAccess(tenantId: string, orderId: string, lineId: string) {
    const line = await this.requireLine(tenantId, orderId, lineId);
    if (
      !line.costEvidenceObjectKey ||
      !line.costEvidenceOriginalFilename ||
      !line.costEvidenceMimeType ||
      line.costEvidenceByteSize === null
    ) {
      throw new NotFoundException("ADDITIONAL_SERVICE_COST_EVIDENCE_NOT_FOUND");
    }
    try {
      return {
        hasCostEvidence: true,
        costEvidenceOriginalFilename: line.costEvidenceOriginalFilename,
        costEvidenceMimeType: line.costEvidenceMimeType,
        costEvidenceByteSize: line.costEvidenceByteSize,
        signedUrl: await this.storage.generateSignedUrl(
          line.costEvidenceObjectKey,
          SIGNED_ACCESS_SECONDS,
        ),
        expiresInSeconds: SIGNED_ACCESS_SECONDS,
      };
    } catch {
      throw new InternalServerErrorException(
        "ADDITIONAL_SERVICE_COST_EVIDENCE_SIGNED_ACCESS_FAILED",
      );
    }
  }

  async remove(tenantId: string, orderId: string, lineId: string) {
    const line = await this.requireLine(tenantId, orderId, lineId);
    if (!line.costEvidenceObjectKey) {
      return { deleted: false };
    }
    this.requireMutable(line);

    const updated = await this.database.additionalServiceOrderLine.updateMany({
      where: {
        id: lineId,
        orderId,
        tenantId,
        costEvidenceObjectKey: line.costEvidenceObjectKey,
        order: {
          OR: [
            { commercialStatus: null },
            { commercialStatus: { not: "APPROVED" } },
          ],
        },
      },
      data: {
        costEvidenceObjectKey: null,
        costEvidenceOriginalFilename: null,
        costEvidenceMimeType: null,
        costEvidenceByteSize: null,
        costEvidenceContentHash: null,
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException(
        "ADDITIONAL_SERVICE_COST_EVIDENCE_ORDER_APPROVED",
      );
    }

    try {
      await this.storage.deleteObject(line.costEvidenceObjectKey);
    } catch (error) {
      this.logger.error(
        "Commercial cost-evidence removal storage cleanup failed",
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        "ADDITIONAL_SERVICE_COST_EVIDENCE_STORAGE_DELETE_FAILED",
      );
    }
    return { deleted: true };
  }

  private async requireLine(tenantId: string, orderId: string, lineId: string) {
    const line = await this.database.additionalServiceOrderLine.findFirst({
      where: { id: lineId, orderId, tenantId },
      select: {
        id: true,
        costEvidenceObjectKey: true,
        costEvidenceOriginalFilename: true,
        costEvidenceMimeType: true,
        costEvidenceByteSize: true,
        order: { select: { commercialStatus: true } },
      },
    });
    if (!line) {
      throw new NotFoundException("ADDITIONAL_SERVICE_ORDER_LINE_NOT_FOUND");
    }
    return line;
  }

  private requireMutable(line: OrderLine) {
    if (line.order.commercialStatus === "APPROVED") {
      throw new ConflictException(
        "ADDITIONAL_SERVICE_COST_EVIDENCE_ORDER_APPROVED",
      );
    }
  }
}

function validateFile(
  file: AdditionalServiceCommercialCostEvidenceFile | undefined,
): asserts file is AdditionalServiceCommercialCostEvidenceFile {
  if (
    !file ||
    !Buffer.isBuffer(file.buffer) ||
    !ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype) ||
    !Number.isInteger(file.size) ||
    file.size !== file.buffer.length ||
    file.size < 1 ||
    file.size > MAX_ADDITIONAL_SERVICE_COST_EVIDENCE_BYTES
  ) {
    throw new BadRequestException("Invalid Additional Services cost evidence image.");
  }
}

function evidenceObjectKey(
  tenantId: string,
  orderId: string,
  lineId: string,
  fileName: string,
): string {
  return [
    "additional-services",
    "cost-evidence",
    safeSegment(tenantId),
    safeSegment(orderId),
    safeSegment(lineId),
    `${randomUUID()}-${safeFileName(fileName)}`,
  ].join("/");
}

function safeSegment(value: string): string {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 191) || "unknown";
}

function safeFileName(value: string): string {
  const fileName = String(value).split(/[\\/]/).pop() ?? "evidence";
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "evidence";
}
