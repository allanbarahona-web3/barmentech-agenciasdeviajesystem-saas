import { createHash } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { GeneratedDocumentAccessService } from "./generated-document-access.service";

describe("GeneratedDocumentAccessService", () => {
  it("stores only a hash of a cryptographically random token", async () => {
    const create = jest.fn().mockReturnValue({ operation: "create" });
    const updateMany = jest.fn().mockReturnValue({ operation: "revoke" });
    const transaction = jest.fn().mockResolvedValue([]);
    const prisma = {
      generatedDocumentAccessToken: { create, updateMany },
      $transaction: transaction,
    } as unknown as PrismaService;
    const service = new GeneratedDocumentAccessService(prisma);

    const token = await service.issue("document-1", "APPROVAL");

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        generatedDocumentId: "document-1",
        purpose: "APPROVAL",
        tokenHash: createHash("sha256").update(token).digest("hex"),
      }),
    });
    expect(JSON.stringify(create.mock.calls)).not.toContain(token);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects expired access tokens", async () => {
    const prisma = {
      generatedDocumentAccessToken: {
        findUnique: jest.fn().mockResolvedValue({
          purpose: "APPROVAL",
          isActive: true,
          usedAt: null,
          revokedAt: null,
          expiresAt: new Date(Date.now() - 1000),
          generatedDocument: {},
        }),
      },
    } as unknown as PrismaService;
    const service = new GeneratedDocumentAccessService(prisma);

    await expect(service.resolve("expired", "APPROVAL")).rejects.toThrow(
      "invalid or expired",
    );
  });

  it("rejects a token when its persisted purpose does not match the requested capability", async () => {
    const prisma = {
      generatedDocumentAccessToken: {
        findUnique: jest.fn().mockResolvedValue({
          purpose: "DOWNLOAD",
          isActive: true,
          usedAt: null,
          revokedAt: null,
          expiresAt: null,
          generatedDocument: {},
        }),
      },
    } as unknown as PrismaService;
    const service = new GeneratedDocumentAccessService(prisma);

    await expect(service.resolve("wrong-purpose", "APPROVAL")).rejects.toThrow("invalid or expired");
  });

  it("consumes a token through a caller-owned transaction with the existing single-use CAS", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = new GeneratedDocumentAccessService({} as PrismaService);
    const now = new Date("2026-09-21T12:00:00.000Z");

    await expect(service.consumeInTransaction({ generatedDocumentAccessToken: { updateMany } }, "access-1", now)).resolves.toBe(true);

    expect(updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "access-1", isActive: true, usedAt: null, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }),
      data: { isActive: false, usedAt: now },
    });
  });
});
