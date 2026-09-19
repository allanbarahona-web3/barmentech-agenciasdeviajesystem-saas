import { NotFoundException } from "@nestjs/common";
import { CostEngineRepository } from "./cost-engine.repository";
import { CostEvidenceService } from "./cost-evidence.service";
import { StorageService } from "../storage/storage.service";

const actor = { userId: "user-a", name: "Admin A" };

describe("CostEvidenceService", () => {
  it("uploads immutable private evidence and persists tenant-scoped metadata", async () => {
    const c = context();

    await expect(c.service.upload("tenant-a", "snapshot-a", evidenceFile(), actor)).resolves.toMatchObject({
      id: "evidence-a",
      costSnapshotId: "snapshot-a",
      originalFileName: "quote.pdf",
      mimeType: "application/pdf",
      byteSize: 14,
    });

    expect(c.repository.assertSnapshotAccess).toHaveBeenCalledWith("tenant-a", "snapshot-a");
    expect(c.storage.putObjectIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      objectKey: expect.stringMatching(/^cost-engine\/evidence\/tenant-a\/snapshot-a\//),
      contentType: "application/pdf",
      body: Buffer.from("quote-evidence"),
    }));
    expect(c.storage.putObjectIfAbsent.mock.calls[0][0]).not.toHaveProperty("acl");
    expect(c.repository.createEvidence).toHaveBeenCalledWith("tenant-a", "snapshot-a", expect.objectContaining({
      originalFileName: "quote.pdf",
      mimeType: "application/pdf",
      byteSize: 14,
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      uploadedByUserId: "user-a",
      uploadedByName: "Admin A",
    }));
  });

  it("rejects a cross-tenant snapshot before creating a storage object", async () => {
    const c = context();
    c.repository.assertSnapshotAccess.mockRejectedValue(new NotFoundException("Cost snapshot not found."));

    await expect(c.service.upload("tenant-a", "snapshot-b", evidenceFile(), actor)).rejects.toBeInstanceOf(NotFoundException);

    expect(c.storage.putObjectIfAbsent).not.toHaveBeenCalled();
    expect(c.repository.createEvidence).not.toHaveBeenCalled();
  });

  it("signs only an authorized evidence metadata record, never a caller-supplied object key", async () => {
    const c = context();
    c.repository.findEvidenceForAccess.mockResolvedValue({
      id: "evidence-a", originalFileName: "quote.pdf", mimeType: "application/pdf", byteSize: 14,
      objectKey: "cost-engine/evidence/tenant-a/snapshot-a/object.pdf",
    });

    await expect(c.service.getAccess("tenant-a", "snapshot-a", "evidence-a")).resolves.toMatchObject({
      id: "evidence-a",
      url: "https://signed.example/evidence",
    });
    expect(c.repository.findEvidenceForAccess).toHaveBeenCalledWith("tenant-a", "snapshot-a", "evidence-a");
    expect(c.storage.generateSignedUrl).toHaveBeenCalledWith("cost-engine/evidence/tenant-a/snapshot-a/object.pdf", 900);

    c.repository.findEvidenceForAccess.mockResolvedValue(null);
    await expect(c.service.getAccess("tenant-a", "snapshot-a", "evidence-other")).rejects.toBeInstanceOf(NotFoundException);
    expect(c.storage.generateSignedUrl).toHaveBeenCalledTimes(1);
  });

  it("lists snapshot evidence with bounded deterministic pagination", async () => {
    const c = context();
    c.repository.listEvidence.mockResolvedValue({
      evidence: [{ id: "evidence-b" }, { id: "evidence-a" }], total: 21, page: 2, pageSize: 20,
    });

    await expect(c.service.list("tenant-a", "snapshot-a", 2, 20)).resolves.toEqual({
      evidence: [{ id: "evidence-b" }, { id: "evidence-a" }], total: 21, page: 2, pageSize: 20, totalPages: 2,
    });
    expect(c.repository.listEvidence).toHaveBeenCalledWith("tenant-a", "snapshot-a", 2, 20);
  });

  it("does not create metadata when private storage fails", async () => {
    const c = context();
    c.storage.putObjectIfAbsent.mockRejectedValue(new Error("storage unavailable"));

    await expect(c.service.upload("tenant-a", "snapshot-a", evidenceFile(), actor)).rejects.toThrow("storage unavailable");

    expect(c.repository.createEvidence).not.toHaveBeenCalled();
    expect(c.storage.deleteObject).not.toHaveBeenCalled();
  });

  it("cleans up an uploaded private object if metadata persistence fails", async () => {
    const c = context();
    c.repository.createEvidence.mockRejectedValue(new Error("metadata failure"));

    await expect(c.service.upload("tenant-a", "snapshot-a", evidenceFile(), actor)).rejects.toThrow("metadata failure");

    const objectKey = c.storage.putObjectIfAbsent.mock.calls[0][0].objectKey;
    expect(c.storage.deleteObject).toHaveBeenCalledWith(objectKey);
    expect(c.storage.generateSignedUrl).not.toHaveBeenCalled();
  });
});

function evidenceFile() {
  return { buffer: Buffer.from("quote-evidence"), mimetype: "application/pdf", originalname: "quote.pdf", size: 14 };
}

function context() {
  const repository = {
    assertSnapshotAccess: jest.fn().mockResolvedValue(undefined),
    createEvidence: jest.fn().mockResolvedValue({
      id: "evidence-a", costSnapshotId: "snapshot-a", originalFileName: "quote.pdf", mimeType: "application/pdf", byteSize: 14,
    }),
    listEvidence: jest.fn(),
    findEvidenceForAccess: jest.fn(),
  };
  const storage = {
    putObjectIfAbsent: jest.fn().mockResolvedValue({ eTag: "etag" }),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    generateSignedUrl: jest.fn().mockResolvedValue("https://signed.example/evidence"),
  };
  return {
    service: new CostEvidenceService(repository as unknown as CostEngineRepository, storage as unknown as StorageService),
    repository,
    storage,
  };
}
