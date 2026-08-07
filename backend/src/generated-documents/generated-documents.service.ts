import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { StorageService } from "../storage/storage.service";
import type {
  GeneratedDocumentOwnerReference,
  GeneratedDocumentRecord,
  RegisterGeneratedDocumentData,
} from "./generated-document.types";
import {
  GENERATED_DOCUMENTS_REPOSITORY,
  type GeneratedDocumentsRepository,
} from "./generated-documents.repository.interface";

const IDENTIFIER_PATTERN = /^[A-Z][A-Z0-9_]*$/;

@Injectable()
export class GeneratedDocumentsService {
  constructor(
    @Inject(GENERATED_DOCUMENTS_REPOSITORY)
    private readonly repository: GeneratedDocumentsRepository,
    private readonly storageService: StorageService,
  ) {}

  registerMetadata(
    data: RegisterGeneratedDocumentData,
  ): Promise<GeneratedDocumentRecord> {
    const normalized = {
      tenantId: this.requiredText(data.tenantId, "tenantId"),
      ownerType: this.identifier(data.ownerType, "ownerType"),
      ownerId: this.requiredText(data.ownerId, "ownerId"),
      documentType: this.identifier(data.documentType, "documentType"),
      variant: this.identifier(data.variant, "variant"),
      version: data.version ?? 1,
      objectKey: this.requiredText(data.objectKey, "objectKey"),
      fileName: this.requiredText(data.fileName, "fileName"),
      mimeType: this.requiredText(data.mimeType, "mimeType"),
      size: data.size,
    };
    if (!Number.isInteger(normalized.version) || normalized.version < 1) {
      throw new BadRequestException("version must be a positive integer.");
    }
    if (!Number.isInteger(normalized.size) || normalized.size < 0) {
      throw new BadRequestException("size must be a non-negative integer.");
    }
    return this.repository.upsert(normalized);
  }

  register(
    data: RegisterGeneratedDocumentData,
  ): Promise<GeneratedDocumentRecord> {
    return this.registerMetadata(data);
  }

  findByOwner(
    reference: GeneratedDocumentOwnerReference,
  ): Promise<GeneratedDocumentRecord[]> {
    return this.repository.findByOwner(this.normalizeReference(reference));
  }

  findLatest(
    reference: GeneratedDocumentOwnerReference,
  ): Promise<GeneratedDocumentRecord | null> {
    return this.repository.findLatest(this.normalizeReference(reference));
  }

  async download(
    tenantId: string,
    documentId: string,
  ): Promise<Buffer> {
    const document = await this.requireDocument(tenantId, documentId);
    return this.storageService.downloadObject(document.objectKey);
  }

  async getSignedUrl(
    tenantId: string,
    documentId: string,
    expiresInSeconds = 900,
  ): Promise<string> {
    const document = await this.requireDocument(tenantId, documentId);
    return this.storageService.generateSignedUrl(
      document.objectKey,
      expiresInSeconds,
    );
  }

  private async requireDocument(tenantId: string, documentId: string) {
    const document = await this.repository.findById(
      this.requiredText(tenantId, "tenantId"),
      this.requiredText(documentId, "documentId"),
    );
    if (!document) {
      throw new NotFoundException("Generated document not found.");
    }
    return document;
  }

  private normalizeReference(
    reference: GeneratedDocumentOwnerReference,
  ): GeneratedDocumentOwnerReference {
    return {
      tenantId: this.requiredText(reference.tenantId, "tenantId"),
      ownerType: this.identifier(reference.ownerType, "ownerType"),
      ownerId: this.requiredText(reference.ownerId, "ownerId"),
      ...(reference.documentType
        ? { documentType: this.identifier(reference.documentType, "documentType") }
        : {}),
      ...(reference.variant
        ? { variant: this.identifier(reference.variant, "variant") }
        : {}),
      ...(reference.version !== undefined
        ? { version: this.positiveInteger(reference.version, "version") }
        : {}),
    };
  }

  private requiredText(value: string, field: string): string {
    const normalized = String(value || "").trim();
    if (!normalized) {
      throw new BadRequestException(`${field} is required.`);
    }
    return normalized;
  }

  private identifier(value: string, field: string): string {
    const normalized = this.requiredText(value, field).toUpperCase();
    if (!IDENTIFIER_PATTERN.test(normalized)) {
      throw new BadRequestException(
        `${field} must be an uppercase business identifier.`,
      );
    }
    return normalized;
  }

  private positiveInteger(value: number, field: string): number {
    if (!Number.isInteger(value) || value < 1) {
      throw new BadRequestException(`${field} must be a positive integer.`);
    }
    return value;
  }
}
