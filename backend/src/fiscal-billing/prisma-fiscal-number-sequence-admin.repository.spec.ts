import { PrismaFiscalNumberSequenceAdminRepository } from "./prisma-fiscal-number-sequence-admin.repository";

describe("PrismaFiscalNumberSequenceAdminRepository", () => {
  it("uses a tenant-safe compare-and-set update for advancement", async () => {
    const stored = {
      id: "sequence-a",
      tenantId: "tenant-a",
      fiscalIssuerId: "issuer-a",
      establishmentCode: "001",
      terminalCode: "00001",
      documentTypeCode: "01",
      startingSequenceNumber: 1093n,
      nextSequenceNumber: 1200n,
    };
    const tx = {
      billingDocumentNumberSequence: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(stored),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const repository = new PrismaFiscalNumberSequenceAdminRepository(
      prisma as never,
    );
    const scope = {
      tenantId: "tenant-a",
      fiscalIssuerId: "issuer-a",
      establishmentCode: "001",
      terminalCode: "00001",
      documentTypeCode: "01",
    };
    await expect(repository.advance(scope, 1093n, 1200n)).resolves.toEqual({
      kind: "UPDATED",
      sequence: stored,
    });
    expect(tx.billingDocumentNumberSequence.updateMany).toHaveBeenCalledWith({
      where: { ...scope, nextSequenceNumber: 1093n },
      data: { nextSequenceNumber: 1200n },
    });
  });
});
