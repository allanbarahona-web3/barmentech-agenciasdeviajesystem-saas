import { BadRequestException, ConflictException, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { OperationalEvidenceService } from "./operational-evidence.service";

const tenantId = "tenant-a";
const travelPackageId = "package-a";
const requirementId = "requirement-a";
const fulfillmentId = "fulfillment-a";
const purchaseId = "purchase-a";
const evidenceId = "evidence-a";
const actor = { userId: "operator-a", name: "Operator A" };

describe("OperationalEvidenceService", () => {
  it("uploads fulfillment evidence with server-owned object metadata and uploader", async () => {
    const c = context();
    hierarchy(c);
    c.tx.operationalEvidence.create.mockResolvedValue(evidence());

    await expect(c.service.upload(tenantId, travelPackageId, requirementId, fulfillmentId, { evidenceType: "BOOKING_CONFIRMATION" }, file(), actor))
      .resolves.toMatchObject({ id: evidenceId, evidenceType: "BOOKING_CONFIRMATION", uploadedBy: actor });

    expect(c.storage.uploadObject).toHaveBeenCalledWith(expect.objectContaining({ objectKey: expect.stringMatching(/^operations\/tenant-a\/package-a\/fulfillment-a\//), contentType: "application/pdf" }));
    expect(c.tx.operationalEvidence.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenantId, travelPackageId, operationalFulfillmentId: fulfillmentId, operationalPurchaseId: null, byteSize: 7, uploadedByUserId: actor.userId, uploadedByName: actor.name, contentHash: expect.any(String) }) }));
    expect(c.tx.operationalEvidence.create.mock.calls[0][0].data).not.toHaveProperty("objectKey", "client-key");
  });

  it("uploads purchase evidence only after validating the purchase under its Fulfillment", async () => {
    const c = context();
    hierarchy(c, { purchase: true });
    c.tx.operationalEvidence.create.mockResolvedValue(evidence({ operationalPurchaseId: purchaseId }));
    await c.service.upload(tenantId, travelPackageId, requirementId, fulfillmentId, { evidenceType: "SUPPLIER_INVOICE", operationalPurchaseId: purchaseId }, file(), actor);
    expect(c.tx.operationalPurchase.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: purchaseId, tenantId, travelPackageId, operationalFulfillmentId: fulfillmentId } }));

    const outside = context();
    outside.tx.operationalRequirement.findFirst.mockResolvedValue({ id: requirementId });
    outside.tx.operationalFulfillment.findFirst.mockResolvedValue({ id: fulfillmentId });
    outside.tx.operationalPurchase.findFirst.mockResolvedValue(null);
    await expect(outside.service.upload(tenantId, travelPackageId, requirementId, fulfillmentId, { evidenceType: "RECEIPT", operationalPurchaseId: "outside" }, file(), actor))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_PURCHASE_NOT_FOUND" }) });
    expect(outside.storage.uploadObject).not.toHaveBeenCalled();
  });

  it("rejects missing hierarchy before storage and invalid files before persistence", async () => {
    const parent = context();
    parent.tx.operationalRequirement.findFirst.mockResolvedValue(null);
    await expect(parent.service.upload(tenantId, travelPackageId, requirementId, fulfillmentId, { evidenceType: "OTHER" }, file(), actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(parent.storage.uploadObject).not.toHaveBeenCalled();

    const invalid = context();
    await expect(invalid.service.upload(tenantId, travelPackageId, requirementId, fulfillmentId, { evidenceType: "OTHER" }, { ...file(), mimetype: "application/x-msdownload" }, actor))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_EVIDENCE_FILE_INVALID" }) });
    await expect(invalid.service.upload(tenantId, travelPackageId, requirementId, fulfillmentId, { evidenceType: "OTHER" }, { ...file(), size: 0, buffer: Buffer.alloc(0) }, actor))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it("attempts storage cleanup when metadata persistence fails", async () => {
    const c = context();
    hierarchy(c);
    c.tx.operationalEvidence.create.mockRejectedValue(new Error("database failed"));
    await expect(c.service.upload(tenantId, travelPackageId, requirementId, fulfillmentId, { evidenceType: "OTHER" }, file(), actor))
      .rejects.toMatchObject({ response: expect.objectContaining({ message: "OPERATIONAL_EVIDENCE_METADATA_PERSISTENCE_FAILED" }) });
    expect(c.storage.deleteObject).toHaveBeenCalledTimes(1);
  });

  it("lists a bounded deterministic page without per-evidence Purchase reads", async () => {
    const c = context();
    hierarchy(c);
    c.tx.operationalEvidence.findMany.mockResolvedValue([evidence()]);
    c.tx.operationalEvidence.count.mockResolvedValue(21);
    await expect(c.service.list(tenantId, travelPackageId, requirementId, fulfillmentId, { page: 1, pageSize: 20, evidenceType: "TICKET" }))
      .resolves.toMatchObject({ total: 21, totalPages: 2, items: [{ id: evidenceId }] });
    expect(c.tx.operationalEvidence.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId, travelPackageId, operationalFulfillmentId: fulfillmentId, evidenceType: "TICKET" }), orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 20 }));
    expect(c.tx.operationalPurchase.findFirst).not.toHaveBeenCalled();
  });

  it("returns detail metadata without object keys and signs only after hierarchy authorization", async () => {
    const c = context();
    hierarchy(c);
    c.tx.operationalEvidence.findFirst.mockResolvedValue(evidence());
    await expect(c.service.find(tenantId, travelPackageId, requirementId, fulfillmentId, evidenceId)).resolves.not.toHaveProperty("objectKey");
    await expect(c.service.getAccess(tenantId, travelPackageId, requirementId, fulfillmentId, evidenceId)).resolves.toMatchObject({ id: evidenceId, url: "https://signed" });
    expect(c.storage.generateSignedUrl).toHaveBeenCalledWith("private-key", 900);
  });

  it("deletes metadata then object storage, surfacing a logged storage cleanup failure", async () => {
    const c = context();
    hierarchy(c);
    c.tx.operationalEvidence.findFirst.mockResolvedValue(evidence());
    c.tx.operationalEvidence.deleteMany.mockResolvedValue({ count: 1 });
    await expect(c.service.remove(tenantId, travelPackageId, requirementId, fulfillmentId, evidenceId)).resolves.toEqual({ id: evidenceId, deleted: true });
    expect(c.storage.deleteObject).toHaveBeenCalledWith("private-key");

    const failed = context();
    hierarchy(failed);
    failed.tx.operationalEvidence.findFirst.mockResolvedValue(evidence());
    failed.tx.operationalEvidence.deleteMany.mockResolvedValue({ count: 1 });
    failed.storage.deleteObject.mockRejectedValue(new Error("storage failed"));
    await expect(failed.service.remove(tenantId, travelPackageId, requirementId, fulfillmentId, evidenceId)).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it("keeps confirmed Fulfillment evidence viewable but rejects uploads and deletion", async () => {
    const c = context();
    hierarchy(c, { status: "CONFIRMED" });
    c.tx.operationalEvidence.findFirst.mockResolvedValue(evidence());
    await expect(c.service.find(tenantId, travelPackageId, requirementId, fulfillmentId, evidenceId)).resolves.toMatchObject({ id: evidenceId });
    await expect(c.service.upload(tenantId, travelPackageId, requirementId, fulfillmentId, { evidenceType: "OTHER" }, file(), actor)).rejects.toBeInstanceOf(ConflictException);
    await expect(c.service.remove(tenantId, travelPackageId, requirementId, fulfillmentId, evidenceId)).rejects.toBeInstanceOf(ConflictException);
    expect(c.tx.operationalEvidence.deleteMany).not.toHaveBeenCalled();
  });
});

function context() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    operationalRequirement: { findFirst: jest.fn() },
    operationalFulfillment: { findFirst: jest.fn() },
    operationalPurchase: { findFirst: jest.fn() },
    operationalEvidence: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), deleteMany: jest.fn() },
  };
  const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
  const storage = { uploadObject: jest.fn().mockResolvedValue(undefined), deleteObject: jest.fn().mockResolvedValue(undefined), generateSignedUrl: jest.fn().mockResolvedValue("https://signed") };
  return { tx, storage, service: new OperationalEvidenceService(prisma as never, storage as never) };
}

function hierarchy(c: ReturnType<typeof context>, options: { purchase?: boolean; status?: string } = {}) {
  c.tx.operationalRequirement.findFirst.mockResolvedValue({ id: requirementId });
  c.tx.operationalFulfillment.findFirst.mockResolvedValue({ id: fulfillmentId, status: options.status ?? "PURCHASED" });
  if (options.purchase) c.tx.operationalPurchase.findFirst.mockResolvedValue({ id: purchaseId });
}
function file() { return { buffer: Buffer.from("pdfdata"), mimetype: "application/pdf", originalname: "booking.pdf", size: 7 }; }
function evidence(overrides: Record<string, unknown> = {}) {
  return { id: evidenceId, travelPackageId, operationalFulfillmentId: fulfillmentId, operationalPurchaseId: null, evidenceType: "BOOKING_CONFIRMATION", objectKey: "private-key", originalFilename: "booking.pdf", mimeType: "application/pdf", byteSize: 7, contentHash: "hash", uploadedByUserId: actor.userId, uploadedByName: actor.name, createdAt: new Date("2026-09-29T12:00:00.000Z"), ...overrides };
}
