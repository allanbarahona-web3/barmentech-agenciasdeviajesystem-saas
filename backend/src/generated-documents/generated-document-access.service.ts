import { createHash, randomBytes } from "crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export const GENERATED_DOCUMENT_ACCESS_PURPOSES = {
  APPROVAL: "APPROVAL",
} as const;

@Injectable()
export class GeneratedDocumentAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(
    generatedDocumentId: string,
    purpose: string,
    expiresAt?: Date,
  ): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    await this.prisma.$transaction([
      this.prisma.generatedDocumentAccessToken.updateMany({
        where: { generatedDocumentId, purpose, isActive: true },
        data: { isActive: false, revokedAt: new Date() },
      }),
      this.prisma.generatedDocumentAccessToken.create({
        data: {
          generatedDocumentId,
          purpose,
          tokenHash: this.hash(token),
          expiresAt,
        },
      }),
    ]);
    return token;
  }

  async resolve(token: string, purpose: string) {
    const access = await this.prisma.generatedDocumentAccessToken.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { generatedDocument: true },
    });
    if (
      !access ||
      access.purpose !== purpose ||
      !access.isActive ||
      access.usedAt ||
      access.revokedAt ||
      (access.expiresAt && access.expiresAt <= new Date())
    ) {
      throw new NotFoundException("Approval link is invalid or expired.");
    }
    return access;
  }

  async consume(id: string): Promise<boolean> {
    const result = await this.prisma.generatedDocumentAccessToken.updateMany({
      where: {
        id,
        isActive: true,
        usedAt: null,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      data: { isActive: false, usedAt: new Date() },
    });
    return result.count === 1;
  }

  async revoke(token: string): Promise<void> {
    await this.prisma.generatedDocumentAccessToken.updateMany({
      where: { tokenHash: this.hash(token), isActive: true },
      data: { isActive: false, revokedAt: new Date() },
    });
  }

  private hash(token: string): string {
    return createHash("sha256").update(String(token || "")).digest("hex");
  }
}
