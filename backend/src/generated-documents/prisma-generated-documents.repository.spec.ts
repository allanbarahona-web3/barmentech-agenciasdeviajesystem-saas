import { PrismaService } from "../prisma/prisma.service";
import { PrismaGeneratedDocumentsRepository } from "./prisma-generated-documents.repository";

describe("PrismaGeneratedDocumentsRepository", () => {
  it("atomically replaces metadata at the active document identity", async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = {
      generatedDocument: { upsert },
    } as unknown as PrismaService;
    const repository = new PrismaGeneratedDocumentsRepository(prisma);
    const data = {
      tenantId: "tenant-1",
      ownerType: "ADDITIONAL_SERVICE_ORDER",
      ownerId: "order-1",
      documentType: "COMMERCIAL_PROPOSAL",
      variant: "GENERATED",
      version: 1,
      objectKey: "dev/acme/additional-services/proposals/AS-1/proposal.pdf",
      fileName: "proposal.pdf",
      mimeType: "application/pdf",
      size: 512,
    };

    await repository.upsert(data);

    expect(upsert).toHaveBeenCalledWith({
      where: {
        tenantId_ownerType_ownerId_documentType_variant_version: {
          tenantId: "tenant-1",
          ownerType: "ADDITIONAL_SERVICE_ORDER",
          ownerId: "order-1",
          documentType: "COMMERCIAL_PROPOSAL",
          variant: "GENERATED",
          version: 1,
        },
      },
      create: data,
      update: {
        objectKey: data.objectKey,
        fileName: data.fileName,
        mimeType: data.mimeType,
        size: data.size,
      },
    });
  });

  it("scopes document lookup to tenant and generic owner fields", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      generatedDocument: { findMany },
    } as unknown as PrismaService;
    const repository = new PrismaGeneratedDocumentsRepository(prisma);

    await repository.findByOwner({
      tenantId: "tenant-1",
      ownerType: "INVOICE",
      ownerId: "invoice-1",
      documentType: "INVOICE",
      variant: "ORIGINAL",
      version: 1,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        ownerType: "INVOICE",
        ownerId: "invoice-1",
        documentType: "INVOICE",
        variant: "ORIGINAL",
        version: 1,
      },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });
  });

  it("uses tenant and document id together for direct lookup", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = {
      generatedDocument: { findFirst },
    } as unknown as PrismaService;
    const repository = new PrismaGeneratedDocumentsRepository(prisma);

    await repository.findById("tenant-1", "document-1");

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "document-1", tenantId: "tenant-1" },
    });
  });
});
