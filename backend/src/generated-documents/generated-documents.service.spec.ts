import { BadRequestException, NotFoundException } from "@nestjs/common";
import { StorageService } from "../storage/storage.service";
import type { GeneratedDocumentRecord } from "./generated-document.types";
import type { GeneratedDocumentsRepository } from "./generated-documents.repository.interface";
import { GeneratedDocumentsService } from "./generated-documents.service";

describe("GeneratedDocumentsService", () => {
  const record: GeneratedDocumentRecord = {
    id: "document-1",
    tenantId: "tenant-1",
    ownerType: "SALES_ORDER",
    ownerId: "owner-1",
    documentType: "SALES_ORDER",
    variant: "ORIGINAL",
    version: 1,
    objectKey: "prod/acme/generated/sales-order/owner-1/v1.pdf",
    fileName: "sales-order.pdf",
    mimeType: "application/pdf",
    size: 1024,
    createdAt: new Date("2026-08-06T00:00:00.000Z"),
    updatedAt: new Date("2026-08-06T00:00:00.000Z"),
  };

  it("normalizes open business identifiers and registers metadata only", async () => {
    const { service, repository } = setup();
    repository.create.mockResolvedValue(record);

    await expect(
      service.registerMetadata({
        tenantId: " tenant-1 ",
        ownerType: "sales_order",
        ownerId: " owner-1 ",
        documentType: "sales_order",
        variant: "original",
        objectKey: " prod/acme/generated/sales-order/owner-1/v1.pdf ",
        fileName: " sales-order.pdf ",
        mimeType: " application/pdf ",
        size: 1024,
      }),
    ).resolves.toBe(record);

    expect(repository.create).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      ownerType: "SALES_ORDER",
      ownerId: "owner-1",
      documentType: "SALES_ORDER",
      variant: "ORIGINAL",
      version: 1,
      objectKey: "prod/acme/generated/sales-order/owner-1/v1.pdf",
      fileName: "sales-order.pdf",
      mimeType: "application/pdf",
      size: 1024,
    });
  });

  it("rejects invalid metadata before persistence", () => {
    const { service, repository } = setup();

    expect(() =>
      service.registerMetadata({
        tenantId: "tenant-1",
        ownerType: "sales order",
        ownerId: "owner-1",
        documentType: "SALES_ORDER",
        variant: "ORIGINAL",
        version: 0,
        objectKey: "key",
        fileName: "file.pdf",
        mimeType: "application/pdf",
        size: -1,
      }),
    ).toThrow(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("retrieves content through StorageService after a tenant-scoped lookup", async () => {
    const { service, repository, storage } = setup();
    repository.findById.mockResolvedValue(record);
    storage.downloadObject.mockResolvedValue(Buffer.from("pdf"));
    storage.generateSignedUrl.mockResolvedValue("https://signed.example/document");

    await expect(service.download("tenant-1", "document-1")).resolves.toEqual(
      Buffer.from("pdf"),
    );
    await expect(
      service.getSignedUrl("tenant-1", "document-1", 300),
    ).resolves.toBe("https://signed.example/document");
    expect(repository.findById).toHaveBeenCalledWith("tenant-1", "document-1");
    expect(storage.downloadObject).toHaveBeenCalledWith(record.objectKey);
    expect(storage.generateSignedUrl).toHaveBeenCalledWith(record.objectKey, 300);
  });

  it("does not access storage when the tenant-scoped document is absent", async () => {
    const { service, repository, storage } = setup();
    repository.findById.mockResolvedValue(null);

    await expect(service.download("tenant-2", "document-1")).rejects.toThrow(
      NotFoundException,
    );
    expect(storage.downloadObject).not.toHaveBeenCalled();
  });
});

function setup() {
  const repository = {
    create: jest.fn(),
    findById: jest.fn(),
    findByOwner: jest.fn(),
    findLatest: jest.fn(),
  } as jest.Mocked<GeneratedDocumentsRepository>;
  const storage = {
    downloadObject: jest.fn(),
    generateSignedUrl: jest.fn(),
  } as unknown as jest.Mocked<StorageService>;
  return {
    repository,
    storage,
    service: new GeneratedDocumentsService(repository, storage),
  };
}
