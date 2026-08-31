import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { FiscalIssuanceClock } from "./fiscal-issuance.clock";

export interface PristineSubmissionFailure {
  readonly tenantId: string;
  readonly billingDocumentId: string;
  readonly errorCode: string;
}

@Injectable()
export class BillingDocumentSubmissionFailureFinalizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: FiscalIssuanceClock,
  ) {}

  async finalizePristineFailure(input: PristineSubmissionFailure): Promise<"FINALIZED" | "UNCHANGED"> {
    if (!identity(input) || !safeCode(input.errorCode)) return "UNCHANGED";
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "billing_documents"
        WHERE "id" = ${input.billingDocumentId} AND "tenantId" = ${input.tenantId}
        FOR UPDATE
      `;
      if (locked.length !== 1) return "UNCHANGED";
      const now = this.clock.now();
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return "UNCHANGED";
      const updated = await tx.billingDocument.updateMany({
        where: pristineWhere(input),
        data: {
          providerStatus: "FAILED",
          providerLastErrorCode: input.errorCode,
          providerLastErrorAt: now,
          providerReconciliationRequired: false,
        },
      });
      return updated.count === 1 ? "FINALIZED" : "UNCHANGED";
    });
  }
}

function pristineWhere(input: PristineSubmissionFailure): Prisma.BillingDocumentWhereInput {
  return {
    id: input.billingDocumentId,
    tenantId: input.tenantId,
    billingMode: "ELECTRONIC_PROVIDER",
    lifecycleStatus: "CONFIRMED",
    providerStatus: "PENDING",
    taxAuthorityStatus: "NOT_SUBMITTED",
    providerRequestHash: null,
    providerLastAttemptAt: null,
    providerLastErrorCode: null,
    providerLastErrorAt: null,
    providerReconciliationRequired: false,
    providerDocumentId: null,
    haciendaKey: null,
    providerEnvironment: null,
    submittedAt: null,
    issuedAt: null,
    taxAuthorityFinalizedAt: null,
  };
}

function identity(value: PristineSubmissionFailure): boolean {
  return bounded(value.tenantId) && bounded(value.billingDocumentId);
}

function bounded(value: string): boolean {
  return typeof value === "string" && value.length > 0 && value.length <= 191 && value === value.trim();
}

function safeCode(value: string): boolean {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{0,99}$/.test(value);
}
