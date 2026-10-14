import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import * as sharp from "sharp";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import {
  AdditionalServiceCommercialCostEvidenceService,
  MAX_ADDITIONAL_SERVICE_COST_EVIDENCE_BYTES,
} from "./additional-service-commercial-cost-evidence.service";

describe("AdditionalServiceCommercialCostEvidenceService", () => {
  it.each(["jpeg", "png", "webp"] as const)("uploads a valid %s image as private, normalized evidence", async (format) => {
    const c = context();
    const bytes = await image(format);

    await expect(c.service.upload("tenant-a", "order-a", "line-a", file(bytes, `source.${format}`, `image/${format === "jpeg" ? "jpeg" : format}`))).resolves.toMatchObject({
      hasCostEvidence: true,
      costEvidenceOriginalFilename: `source.${format}`,
      costEvidenceMimeType: "image/webp",
    });

    expect(c.database.additionalServiceOrderLine.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "line-a", orderId: "order-a", tenantId: "tenant-a" } }));
    expect(c.storage.uploadObject).toHaveBeenCalledWith(expect.objectContaining({
      objectKey: expect.stringMatching(/^additional-services\/cost-evidence\/tenant-a\/order-a\/line-a\//),
      contentType: "image/webp",
    }));
    expect(c.database.additionalServiceOrderLine.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ costEvidenceMimeType: "image/webp", costEvidenceContentHash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    }));
  });

  it("rejects unsupported and oversized uploads before any storage write", async () => {
    const c = context();
    await expect(c.service.upload("tenant-a", "order-a", "line-a", file(Buffer.from("x"), "quote.pdf", "application/pdf"))).rejects.toBeInstanceOf(BadRequestException);
    await expect(c.service.upload("tenant-a", "order-a", "line-a", { buffer: Buffer.alloc(MAX_ADDITIONAL_SERVICE_COST_EVIDENCE_BYTES + 1), mimetype: "image/png", originalname: "large.png", size: MAX_ADDITIONAL_SERVICE_COST_EVIDENCE_BYTES + 1 })).rejects.toBeInstanceOf(BadRequestException);
    expect(c.storage.uploadObject).not.toHaveBeenCalled();
  });

  it("rejects a declared image that cannot be decoded", async () => {
    const c = context();
    await expect(c.service.upload("tenant-a", "order-a", "line-a", file(Buffer.from("not-an-image"), "bad.png", "image/png"))).rejects.toBeInstanceOf(BadRequestException);
    expect(c.storage.uploadObject).not.toHaveBeenCalled();
    expect(c.database.additionalServiceOrderLine.updateMany).not.toHaveBeenCalled();
  });

  it("tenant-scopes upload, signed read, and removal", async () => {
    const c = context(null);
    const png = await image("png");
    await expect(c.service.upload("tenant-a", "order-b", "line-b", file(png, "quote.png", "image/png"))).rejects.toBeInstanceOf(NotFoundException);
    await expect(c.service.getAccess("tenant-a", "order-b", "line-b")).rejects.toBeInstanceOf(NotFoundException);
    await expect(c.service.remove("tenant-a", "order-b", "line-b")).rejects.toBeInstanceOf(NotFoundException);
    expect(c.database.additionalServiceOrderLine.findFirst).toHaveBeenCalledTimes(3);
    expect(c.storage.uploadObject).not.toHaveBeenCalled();
    expect(c.storage.generateSignedUrl).not.toHaveBeenCalled();
    expect(c.storage.deleteObject).not.toHaveBeenCalled();
  });

  it("requires the line to belong to the supplied order", async () => {
    const c = context(null);
    await expect(c.service.getAccess("tenant-a", "other-order", "line-a")).rejects.toBeInstanceOf(NotFoundException);
    expect(c.database.additionalServiceOrderLine.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "line-a", orderId: "other-order", tenantId: "tenant-a" } }));
  });

  it("preserves old evidence when replacement metadata persistence fails", async () => {
    const c = context(line({ costEvidenceObjectKey: "old-object" }));
    c.database.additionalServiceOrderLine.updateMany.mockRejectedValue(new Error("persistence failed"));
    const png = await image("png");

    await expect(c.service.upload("tenant-a", "order-a", "line-a", file(png, "replacement.png", "image/png"))).rejects.toThrow("persistence failed");

    const newObjectKey = c.storage.uploadObject.mock.calls[0][0].objectKey;
    expect(c.storage.deleteObject).toHaveBeenCalledWith(newObjectKey);
    expect(c.storage.deleteObject).not.toHaveBeenCalledWith("old-object");
  });

  it("removes old storage only after a successful replacement", async () => {
    const c = context(line({ costEvidenceObjectKey: "old-object" }));
    const png = await image("png");

    await c.service.upload("tenant-a", "order-a", "line-a", file(png, "replacement.png", "image/png"));

    expect(c.storage.deleteObject).toHaveBeenCalledWith("old-object");
  });

  it("returns signed access without exposing the private object key", async () => {
    const c = context(line({
      costEvidenceObjectKey: "private/tenant-a/evidence.webp",
      costEvidenceOriginalFilename: "quote.webp",
      costEvidenceMimeType: "image/webp",
      costEvidenceByteSize: 42,
    }));

    const result = await c.service.getAccess("tenant-a", "order-a", "line-a");

    expect(result).toEqual({
      hasCostEvidence: true,
      costEvidenceOriginalFilename: "quote.webp",
      costEvidenceMimeType: "image/webp",
      costEvidenceByteSize: 42,
      signedUrl: "https://signed.example/evidence",
      expiresInSeconds: 900,
    });
    expect(JSON.stringify(result)).not.toContain("private/tenant-a/evidence.webp");
    expect(c.storage.generateSignedUrl).toHaveBeenCalledWith("private/tenant-a/evidence.webp", 900);
  });

  it("clears metadata before deleting storage and makes repeated removal safe", async () => {
    const c = context(line({ costEvidenceObjectKey: "old-object" }));
    await expect(c.service.remove("tenant-a", "order-a", "line-a")).resolves.toEqual({ deleted: true });
    expect(c.database.additionalServiceOrderLine.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        costEvidenceObjectKey: null,
        costEvidenceOriginalFilename: null,
        costEvidenceMimeType: null,
        costEvidenceByteSize: null,
        costEvidenceContentHash: null,
      },
    }));
    expect(c.storage.deleteObject).toHaveBeenCalledWith("old-object");

    c.database.additionalServiceOrderLine.findFirst.mockResolvedValue(line());
    await expect(c.service.remove("tenant-a", "order-a", "line-a")).resolves.toEqual({ deleted: false });
    expect(c.storage.deleteObject).toHaveBeenCalledTimes(1);
  });

  it("does not allow evidence mutation after commercial approval", async () => {
    const c = context(line({ commercialStatus: "APPROVED", costEvidenceObjectKey: "old-object" }));
    const png = await image("png");
    await expect(c.service.upload("tenant-a", "order-a", "line-a", file(png, "replacement.png", "image/png"))).rejects.toBeInstanceOf(ConflictException);
    await expect(c.service.remove("tenant-a", "order-a", "line-a")).rejects.toBeInstanceOf(ConflictException);
    expect(c.storage.uploadObject).not.toHaveBeenCalled();
    expect(c.database.additionalServiceOrderLine.updateMany).not.toHaveBeenCalled();
  });
});

function line({
  commercialStatus,
  ...overrides
}: Partial<{
  commercialStatus: string | null;
  costEvidenceObjectKey: string | null;
  costEvidenceOriginalFilename: string | null;
  costEvidenceMimeType: string | null;
  costEvidenceByteSize: number | null;
}> = {}) {
  return {
    id: "line-a",
    costEvidenceObjectKey: null,
    costEvidenceOriginalFilename: null,
    costEvidenceMimeType: null,
    costEvidenceByteSize: null,
    ...overrides,
    order: { commercialStatus: commercialStatus ?? "DRAFT" },
  };
}

function context(existing: ReturnType<typeof line> | null = line()) {
  const database = {
    additionalServiceOrderLine: {
      findFirst: jest.fn().mockResolvedValue(existing),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const storage = {
    uploadObject: jest.fn().mockResolvedValue(undefined),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    generateSignedUrl: jest.fn().mockResolvedValue("https://signed.example/evidence"),
  };
  return {
    service: new AdditionalServiceCommercialCostEvidenceService(
      database as unknown as PrismaService,
      storage as unknown as StorageService,
    ),
    database,
    storage,
  };
}

function file(buffer: Buffer, originalname: string, mimetype: string) {
  return { buffer, originalname, mimetype, size: buffer.length };
}

async function image(format: "jpeg" | "png" | "webp") {
  const source = sharp({
    create: { width: 2, height: 2, channels: 3, background: "#2563eb" },
  });
  if (format === "jpeg") return source.jpeg().toBuffer();
  if (format === "png") return source.png().toBuffer();
  return source.webp().toBuffer();
}
