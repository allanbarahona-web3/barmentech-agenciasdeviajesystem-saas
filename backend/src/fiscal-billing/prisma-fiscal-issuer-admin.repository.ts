import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { FiscalIssuerAdminRepository } from "./fiscal-issuer-admin.repository";
import type {
  FiscalIssuerCreateInput,
  FiscalIssuerRecord,
  FiscalIssuerUpdateInput,
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
