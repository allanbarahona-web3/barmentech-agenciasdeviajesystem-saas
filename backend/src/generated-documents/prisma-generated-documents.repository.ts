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

  create(
    data: Required<RegisterGeneratedDocumentData>,
  ): Promise<GeneratedDocumentRecord> {
    return this.prisma.generatedDocument.create({ data });
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
    };
  }
}
