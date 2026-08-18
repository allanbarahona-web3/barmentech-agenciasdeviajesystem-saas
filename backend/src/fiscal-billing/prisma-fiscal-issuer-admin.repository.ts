import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { FiscalIssuerAdminRepository } from "./fiscal-issuer-admin.repository";
import type {
  FiscalIssuerCreateInput,
  FiscalIssuerRecord,
  FiscalIssuerUpdateInput,
  FiscalIssuerEconomicActivityRecord,
} from "./fiscal-issuer-admin.types";

@Injectable()
export class PrismaFiscalIssuerAdminRepository
  implements FiscalIssuerAdminRepository
{
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.fiscalIssuer.findMany({
      where: { tenantId },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
    });
  }

  find(tenantId: string, issuerId: string) {
    return this.prisma.fiscalIssuer.findFirst({
      where: { tenantId, id: issuerId },
    });
  }

  create(tenantId: string, input: FiscalIssuerCreateInput) {
    return this.prisma.fiscalIssuer.create({
      data: { tenantId, ...input, isActive: false },
    });
  }

  update(
    tenantId: string,
    issuerId: string,
    input: FiscalIssuerUpdateInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.fiscalIssuer.findFirst({
        where: { tenantId, id: issuerId },
        select: { id: true },
      });
      if (!existing) return null;
      return tx.fiscalIssuer.update({
        where: { id_tenantId: { id: issuerId, tenantId } },
        data: input,
      });
    });
  }

  setStatus(tenantId: string, issuerId: string, isActive: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const issuer = (await tx.fiscalIssuer.findFirst({
        where: { tenantId, id: issuerId },
      })) as FiscalIssuerRecord | null;
      if (!issuer) return { kind: "NOT_FOUND" as const };
      if (issuer.isActive === isActive) {
        return { kind: "UPDATED" as const, issuer };
      }
      if (isActive) {
        const missingFields = activationMissingFields(issuer);
        if (missingFields.length) {
          return { kind: "INCOMPLETE" as const, missingFields };
        }
        await tx.fiscalIssuer.updateMany({
          where: { tenantId, isActive: true, id: { not: issuerId } },
          data: { isActive: false },
        });
      }
      const updated = await tx.fiscalIssuer.update({
        where: { id_tenantId: { id: issuerId, tenantId } },
        data: { isActive },
      });
      return { kind: "UPDATED" as const, issuer: updated };
    });
  }

  listEconomicActivities(tenantId: string, issuerId: string) {
    return this.prisma.fiscalIssuerEconomicActivity.findMany({
      where: { tenantId, fiscalIssuerId: issuerId },
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    });
  }

  findEconomicActivity(tenantId: string, issuerId: string, code: string) {
    return this.prisma.fiscalIssuerEconomicActivity.findFirst({
      where: { tenantId, fiscalIssuerId: issuerId, economicActivityCode: code },
    });
  }

  async createEconomicActivity(tenantId: string, issuerId: string, code: string, description: string) {
    const last = await this.prisma.fiscalIssuerEconomicActivity.findFirst({
      where: { tenantId, fiscalIssuerId: issuerId },
      orderBy: [{ displayOrder: "desc" }, { id: "desc" }],
      select: { displayOrder: true },
    });
    return this.prisma.fiscalIssuerEconomicActivity.create({
      data: { tenantId, fiscalIssuerId: issuerId, economicActivityCode: code, description, isPrimary: false, displayOrder: (last?.displayOrder ?? -1) + 1 },
    });
  }

  selectPrimaryEconomicActivity(tenantId: string, issuerId: string, assignmentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const issuer = await tx.fiscalIssuer.findFirst({ where: { tenantId, id: issuerId }, select: { id: true } });
      if (!issuer) return { kind: "ISSUER_NOT_FOUND" as const };
      const activity = await tx.fiscalIssuerEconomicActivity.findFirst({ where: { id: assignmentId, tenantId, fiscalIssuerId: issuerId } }) as FiscalIssuerEconomicActivityRecord | null;
      if (!activity) return { kind: "ACTIVITY_NOT_FOUND" as const };
      if (activity.isPrimary) return { kind: "UNCHANGED" as const, activity };
      await tx.fiscalIssuerEconomicActivity.updateMany({ where: { tenantId, fiscalIssuerId: issuerId, isPrimary: true }, data: { isPrimary: false } });
      await tx.fiscalIssuerEconomicActivity.updateMany({ where: { id: assignmentId, tenantId, fiscalIssuerId: issuerId }, data: { isPrimary: true } });
      const updated = await tx.fiscalIssuerEconomicActivity.findFirst({ where: { id: assignmentId, tenantId, fiscalIssuerId: issuerId } }) as FiscalIssuerEconomicActivityRecord;
      return { kind: "UPDATED" as const, activity: updated };
    });
  }

  deleteEconomicActivity(tenantId: string, issuerId: string, assignmentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const issuer = await tx.fiscalIssuer.findFirst({ where: { tenantId, id: issuerId }, select: { id: true } });
      if (!issuer) return { kind: "ISSUER_NOT_FOUND" as const };
      const activity = await tx.fiscalIssuerEconomicActivity.findFirst({ where: { id: assignmentId, tenantId, fiscalIssuerId: issuerId } });
      if (!activity) return { kind: "ACTIVITY_NOT_FOUND" as const };
      if (activity.isPrimary) return { kind: "PRIMARY_REMOVAL_FORBIDDEN" as const };
      await tx.fiscalIssuerEconomicActivity.deleteMany({ where: { id: assignmentId, tenantId, fiscalIssuerId: issuerId, isPrimary: false } });
      return { kind: "DELETED" as const };
    });
  }
}

function activationMissingFields(issuer: FiscalIssuerRecord): string[] {
  const required: Array<[keyof FiscalIssuerRecord, unknown]> = [
    ["displayName", issuer.displayName],
    ["legalName", issuer.legalName],
    ["identificationTypeCode", issuer.identificationTypeCode],
    ["identificationNumber", issuer.identificationNumber],
    ["countryCode", issuer.countryCode],
    ["email", issuer.email],
    ["provinceCode", issuer.provinceCode],
    ["cantonCode", issuer.cantonCode],
    ["districtCode", issuer.districtCode],
    ["otherAddressDetails", issuer.otherAddressDetails],
  ];
  const missing = required.flatMap(([field, value]) =>
    typeof value === "string" && value.trim() ? [] : [String(field)],
  );
  if (!/^\d{3}$/.test(issuer.establishmentCode ?? "")) {
    missing.push("establishmentCode");
  }
  if (!/^\d{5}$/.test(issuer.terminalCode ?? "")) {
    missing.push("terminalCode");
  }
  return missing;
}
