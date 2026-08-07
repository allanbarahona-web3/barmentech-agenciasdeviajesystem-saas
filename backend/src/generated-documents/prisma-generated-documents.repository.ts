import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type {
  GeneratedDocumentOwnerReference,
  GeneratedDocumentRecord,
  RegisterGeneratedDocumentData,
} from "./generated-document.types";
import type { GeneratedDocumentsRepository } from "./generated-documents.repository.interface";

@Injectable()
export class PrismaGeneratedDocumentsRepository
  implements GeneratedDocumentsRepository
{
  constructor(private readonly prisma: PrismaService) {}

  upsert(
    data: Required<RegisterGeneratedDocumentData>,
  ): Promise<GeneratedDocumentRecord> {
    const identity = {
      tenantId: data.tenantId,
      ownerType: data.ownerType,
      ownerId: data.ownerId,
      documentType: data.documentType,
      variant: data.variant,
      version: data.version,
    };

    return this.prisma.generatedDocument.upsert({
      where: {
        tenantId_ownerType_ownerId_documentType_variant_version: identity,
      },
      create: data,
      update: {
        objectKey: data.objectKey,
        fileName: data.fileName,
        mimeType: data.mimeType,
        size: data.size,
      },
    });
  }

  findById(
    tenantId: string,
    documentId: string,
  ): Promise<GeneratedDocumentRecord | null> {
    return this.prisma.generatedDocument.findFirst({
      where: { id: documentId, tenantId },
    });
  }

  findByOwner(
    reference: GeneratedDocumentOwnerReference,
  ): Promise<GeneratedDocumentRecord[]> {
    return this.prisma.generatedDocument.findMany({
      where: this.ownerWhere(reference),
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });
  }

  findLatest(
    reference: GeneratedDocumentOwnerReference,
  ): Promise<GeneratedDocumentRecord | null> {
    return this.prisma.generatedDocument.findFirst({
      where: this.ownerWhere(reference),
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });
  }

  private ownerWhere(reference: GeneratedDocumentOwnerReference) {
    return {
      tenantId: reference.tenantId,
      ownerType: reference.ownerType,
      ownerId: reference.ownerId,
      ...(reference.documentType
        ? { documentType: reference.documentType }
        : {}),
      ...(reference.variant ? { variant: reference.variant } : {}),
      ...(reference.version !== undefined ? { version: reference.version } : {}),
    };
  }
}
