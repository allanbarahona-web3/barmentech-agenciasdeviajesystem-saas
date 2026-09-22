import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { tenantCalendarDate } from "../cost-engine/tenant-business-date.resolver";
import { PrismaService } from "../prisma/prisma.service";
import { runTenantTransaction } from "../tenant/tenant-transaction";
import type { CustomQuotationActor } from "./custom-quotations.service";

export type CustomQuotationApprovalActor = { userId: string | null; name: string | null };

export type CustomQuotationApprovalTransaction = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  customQuotation: Record<string, (...args: any[]) => Promise<any>>;
  customQuotationVersion: Record<string, (...args: any[]) => Promise<any>>;
  tenantBillingConfiguration: Record<string, (...args: any[]) => Promise<any>>;
};

type ApprovalDatabase = {
  $transaction<T>(work: (transaction: CustomQuotationApprovalTransaction) => Promise<T>): Promise<T>;
};

@Injectable()
export class CustomQuotationApprovalService {
  private readonly database: ApprovalDatabase;

  constructor(prisma: PrismaService) {
    this.database = prisma as unknown as ApprovalDatabase;
  }

  accept(tenantId: string, quotationId: string, versionId: string, actor: CustomQuotationActor) {
    return this.transition(tenantId, quotationId, versionId, "ACCEPTED", actor);
  }

  reject(tenantId: string, quotationId: string, versionId: string, actor: CustomQuotationActor) {
    return this.transition(tenantId, quotationId, versionId, "REJECTED", actor);
  }

  private transition(
    tenantId: string,
    quotationId: string,
    versionId: string,
    targetStatus: "ACCEPTED" | "REJECTED",
    actor: CustomQuotationApprovalActor,
  ) {
    return this.withTenantTransaction(tenantId, (tx) => this.transitionInTransaction(tx, tenantId, quotationId, versionId, targetStatus, actor));
  }

  /** Shared internal/customer lifecycle invariant; caller owns the tenant transaction. */
  async transitionInTransaction(
    tx: CustomQuotationApprovalTransaction,
    tenantId: string,
    quotationId: string,
    versionId: string,
    targetStatus: "ACCEPTED" | "REJECTED",
    actor: CustomQuotationApprovalActor,
  ) {
      const quotationLock = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "custom_quotations"
        WHERE "id" = ${quotationId} AND "tenantId" = ${tenantId}
        FOR UPDATE
      `;
      if (quotationLock.length !== 1) throw new NotFoundException("CUSTOM_QUOTATION_NOT_FOUND");
      const versionLock = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "custom_quotation_versions"
        WHERE "id" = ${versionId}
          AND "tenantId" = ${tenantId}
          AND "customQuotationId" = ${quotationId}
        FOR UPDATE
      `;
      if (versionLock.length !== 1) throw new NotFoundException("CUSTOM_QUOTATION_VERSION_NOT_FOUND");

      const version = await tx.customQuotationVersion.findFirst({
        where: { id: versionId, tenantId, customQuotationId: quotationId },
        select: {
          id: true,
          customQuotationId: true,
          costingProjectId: true,
          pricingCalculationVersionId: true,
          status: true,
          currency: true,
          finalSellingPrice: true,
          quotationValidUntil: true,
          fiscalDescription: true,
          fiscalItemCategory: true,
          cabysCode: true,
          unitOfMeasureCode: true,
          taxCode: true,
          taxRateCode: true,
          fiscalTaxPercentage: true,
          acceptedAt: true,
          acceptedByUserId: true,
          acceptedByName: true,
          rejectedAt: true,
          lines: { take: 1, select: { id: true } },
          pricingCalculationVersion: { select: { id: true, status: true, currency: true } },
        },
      });
      if (!version) throw new NotFoundException("CUSTOM_QUOTATION_VERSION_NOT_FOUND");

      if (version.status === targetStatus) return transitionResponse(version);
      if (version.status !== "ISSUED") throw new ConflictException("CUSTOM_QUOTATION_VERSION_INVALID_TRANSITION");
      validateImmutableCommercialSnapshot(version);
      if (targetStatus === "ACCEPTED") await assertCustomQuotationVersionNotExpired(tx, tenantId, version.quotationValidUntil);

      const now = new Date();
      const versionUpdate = await tx.customQuotationVersion.updateMany({
        where: { id: version.id, tenantId, customQuotationId: quotationId, status: "ISSUED" },
        data: targetStatus === "ACCEPTED"
          ? { status: "ACCEPTED", acceptedAt: now, acceptedByUserId: actor.userId, acceptedByName: actor.name }
          : { status: "REJECTED", rejectedAt: now },
      });
      if (versionUpdate.count !== 1) throw new ConflictException("CUSTOM_QUOTATION_VERSION_TRANSITION_CONFLICT");
      const quotationUpdate = await tx.customQuotation.updateMany({
        where: { id: quotationId, tenantId, status: "ISSUED" },
        data: { status: targetStatus, updatedByUserId: actor.userId, updatedByName: actor.name },
      });
      if (quotationUpdate.count !== 1) throw new ConflictException("CUSTOM_QUOTATION_TRANSITION_CONFLICT");
      return {
        customQuotationVersionId: version.id,
        quotationId,
        status: targetStatus,
        ...(targetStatus === "ACCEPTED" ? { acceptedAt: now, acceptedBy: { userId: actor.userId, name: actor.name } } : { rejectedAt: now }),
      };
  }

  private withTenantTransaction<T>(tenantId: string, work: (tx: CustomQuotationApprovalTransaction) => Promise<T>) {
    return runTenantTransaction(this.database, tenantId, work);
  }
}

export async function assertCustomQuotationVersionNotExpired(tx: CustomQuotationApprovalTransaction, tenantId: string, validUntil: Date | null): Promise<string> {
  const configuration = await tx.tenantBillingConfiguration.findUnique({
    where: { tenantId },
    select: { fiscalTimezone: true },
  });
  const timezone = configuration?.fiscalTimezone || "America/Costa_Rica";
  if (!validUntil) return timezone;
  if (tenantCalendarDate(validUntil, timezone) < tenantCalendarDate(new Date(), timezone)) {
    throw new BadRequestException("CUSTOM_QUOTATION_VERSION_EXPIRED");
  }
  return timezone;
}

function validateImmutableCommercialSnapshot(version: any) {
  const fiscalFields = [
    version.fiscalDescription,
    version.fiscalItemCategory,
    version.cabysCode,
    version.unitOfMeasureCode,
    version.taxCode,
    version.taxRateCode,
    version.fiscalTaxPercentage,
  ];
  if (!version.finalSellingPrice || version.lines.length !== 1 || fiscalFields.some((field) => field === null || field === undefined || field === "")) {
    throw new ConflictException("CUSTOM_QUOTATION_VERSION_SNAPSHOT_INVALID");
  }
  const pricing = version.pricingCalculationVersion;
  if (!pricing || pricing.id !== version.pricingCalculationVersionId || pricing.status !== "APPROVED" || pricing.currency !== version.currency) {
    throw new ConflictException("CUSTOM_QUOTATION_VERSION_PRICING_PROVENANCE_INVALID");
  }
}

function transitionResponse(version: any) {
  return {
    customQuotationVersionId: version.id,
    quotationId: version.customQuotationId,
    status: version.status,
    ...(version.status === "ACCEPTED" ? { acceptedAt: version.acceptedAt, acceptedBy: version.acceptedByUserId || version.acceptedByName ? { userId: version.acceptedByUserId, name: version.acceptedByName } : null } : { rejectedAt: version.rejectedAt }),
  };
}
