import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  ConditionalAdvanceResult,
  FiscalNumberSequenceAdminRepository,
  FiscalNumberSequenceScope,
} from "./fiscal-number-sequence-admin.repository";

@Injectable()
export class PrismaFiscalNumberSequenceAdminRepository
  implements FiscalNumberSequenceAdminRepository
{
  constructor(private readonly prisma: PrismaService) {}

  list(
    tenantId: string,
    fiscalIssuerId: string,
    establishmentCode: string,
    terminalCode: string,
  ) {
    return this.prisma.billingDocumentNumberSequence.findMany({
      where: {
        tenantId,
        fiscalIssuerId,
        establishmentCode,
        terminalCode,
      },
      orderBy: { documentTypeCode: "asc" },
    });
  }

  find(scope: FiscalNumberSequenceScope) {
    return this.prisma.billingDocumentNumberSequence.findUnique({
      where: {
        tenantId_fiscalIssuerId_establishmentCode_terminalCode_documentTypeCode:
          scope,
      },
    });
  }

  create(scope: FiscalNumberSequenceScope, nextSequenceNumber: bigint) {
    return this.prisma.billingDocumentNumberSequence.create({
      data: {
        ...scope,
        startingSequenceNumber: nextSequenceNumber,
        nextSequenceNumber,
      },
    });
  }

  advance(
    scope: FiscalNumberSequenceScope,
    expectedNext: bigint,
    requestedNext: bigint,
  ): Promise<ConditionalAdvanceResult> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.billingDocumentNumberSequence.updateMany({
        where: { ...scope, nextSequenceNumber: expectedNext },
        data: { nextSequenceNumber: requestedNext },
      });
      const sequence = await tx.billingDocumentNumberSequence.findUnique({
        where: {
          tenantId_fiscalIssuerId_establishmentCode_terminalCode_documentTypeCode:
            scope,
        },
      });
      return updated.count === 1
        ? { kind: "UPDATED" as const, sequence: sequence! }
        : { kind: "CHANGED" as const, sequence };
    });
  }
}
