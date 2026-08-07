import { PrismaService } from "../prisma/prisma.service";
import { PrismaGeneratedDocumentsRepository } from "./prisma-generated-documents.repository";

describe("PrismaGeneratedDocumentsRepository", () => {
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
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        ownerType: "INVOICE",
        ownerId: "invoice-1",
        documentType: "INVOICE",
        variant: "ORIGINAL",
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
