import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import {
  FISCAL_ISSUER_ADMIN_REPOSITORY,
  type FiscalIssuerAdminRepository,
} from "./fiscal-issuer-admin.repository";
import type {
  FiscalIssuerCreateInput,
  FiscalIssuerRecord,
  FiscalIssuerUpdateInput,
} from "./fiscal-issuer-admin.types";
import { fiscalBillingAdminError } from "./fiscal-billing-admin.errors";
import {
  HACIENDA_ECONOMIC_ACTIVITY_PROVIDER,
  HaciendaActivityLookupError,
  type HaciendaEconomicActivityProvider,
} from "./hacienda-economic-activity.provider";

@Injectable()
export class FiscalIssuerAdminService {
  constructor(
    @Inject(FISCAL_ISSUER_ADMIN_REPOSITORY)
    private readonly repository: FiscalIssuerAdminRepository,
    @Inject(HACIENDA_ECONOMIC_ACTIVITY_PROVIDER)
    private readonly haciendaProvider: HaciendaEconomicActivityProvider = {
      findByIdentification: async () => {
        throw new HaciendaActivityLookupError(
          "HACIENDA_ACTIVITY_LOOKUP_UNAVAILABLE",
        );
      },
    },
  ) {}

  async list(tenantId: string) {
    return (await this.repository.list(tenantId)).map(toResponse);
  }

  async find(tenantId: string, issuerId: string) {
    const issuer = await this.repository.find(tenantId, issuerId);
    if (!issuer) throw fiscalBillingAdminError("FISCAL_ISSUER_NOT_FOUND");
    return toResponse(issuer);
  }

  async availableEconomicActivities(tenantId: string, issuerId: string) {
    const issuer = await this.repository.find(tenantId, issuerId);
    if (!issuer) throw fiscalBillingAdminError("FISCAL_ISSUER_NOT_FOUND");
    try {
      const taxpayer = await this.haciendaProvider.findByIdentification(
        issuer.identificationNumber,
      );
      return {
        issuer: {
          id: issuer.id,
          identificationTypeCode: issuer.identificationTypeCode,
          identificationNumber: issuer.identificationNumber,
        },
        ...(taxpayer.legalName ? { legalName: taxpayer.legalName } : {}),
        ...(taxpayer.taxSituation
          ? { taxSituation: taxpayer.taxSituation }
          : {}),
        activities: taxpayer.activities,
      };
    } catch (error) {
      if (error instanceof HaciendaActivityLookupError) {
        throw fiscalBillingAdminError(error.code);
      }
      throw fiscalBillingAdminError("HACIENDA_ACTIVITY_LOOKUP_UNAVAILABLE");
    }
  }

  async listEconomicActivities(tenantId: string, issuerId: string) {
    await this.requireIssuer(tenantId, issuerId);
    return (await this.repository.listEconomicActivities(tenantId, issuerId)).map(toActivityResponse);
  }

  async assignEconomicActivity(tenantId: string, issuerId: string, code: string) {
    const issuer = await this.requireIssuer(tenantId, issuerId);
    const existing = await this.repository.findEconomicActivity(tenantId, issuerId, code);
    if (existing) return toActivityResponse(existing);
    let taxpayer;
    try {
      taxpayer = await this.haciendaProvider.findByIdentification(issuer.identificationNumber);
    } catch (error) {
      if (error instanceof HaciendaActivityLookupError) throw fiscalBillingAdminError(error.code);
      throw fiscalBillingAdminError("HACIENDA_ACTIVITY_LOOKUP_UNAVAILABLE");
    }
    const verified = taxpayer.activities.find((activity) => activity.code === code);
    if (!verified) throw fiscalBillingAdminError("FISCAL_ISSUER_ECONOMIC_ACTIVITY_NOT_REGISTERED");
    if (isExplicitlyInactive(verified)) throw fiscalBillingAdminError("FISCAL_ISSUER_ECONOMIC_ACTIVITY_INACTIVE");
    try {
      return toActivityResponse(await this.repository.createEconomicActivity(tenantId, issuerId, verified.code, verified.description));
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;
      const winner = await this.repository.findEconomicActivity(tenantId, issuerId, code);
      if (winner) return toActivityResponse(winner);
      throw fiscalBillingAdminError("FISCAL_ISSUER_ECONOMIC_ACTIVITY_CONFLICT");
    }
  }

  async selectPrimaryEconomicActivity(tenantId: string, issuerId: string, assignmentId: string) {
    let result;
    try {
      result = await this.repository.selectPrimaryEconomicActivity(tenantId, issuerId, assignmentId);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw fiscalBillingAdminError("FISCAL_ISSUER_ECONOMIC_ACTIVITY_CONFLICT");
      throw error;
    }
    if (result.kind === "ISSUER_NOT_FOUND") throw fiscalBillingAdminError("FISCAL_ISSUER_NOT_FOUND");
    if (result.kind === "ACTIVITY_NOT_FOUND") throw fiscalBillingAdminError("FISCAL_ISSUER_ECONOMIC_ACTIVITY_NOT_FOUND");
    if (result.kind !== "UPDATED" && result.kind !== "UNCHANGED") throw fiscalBillingAdminError("FISCAL_ISSUER_ECONOMIC_ACTIVITY_CONFLICT");
    return toActivityResponse(result.activity);
  }

  async deleteEconomicActivity(tenantId: string, issuerId: string, assignmentId: string) {
    const result = await this.repository.deleteEconomicActivity(tenantId, issuerId, assignmentId);
    if (result.kind === "ISSUER_NOT_FOUND") throw fiscalBillingAdminError("FISCAL_ISSUER_NOT_FOUND");
    if (result.kind === "ACTIVITY_NOT_FOUND") throw fiscalBillingAdminError("FISCAL_ISSUER_ECONOMIC_ACTIVITY_NOT_FOUND");
    if (result.kind === "PRIMARY_REMOVAL_FORBIDDEN") throw fiscalBillingAdminError("FISCAL_ISSUER_PRIMARY_ACTIVITY_REMOVAL_FORBIDDEN");
  }

  private async requireIssuer(tenantId: string, issuerId: string) {
    const issuer = await this.repository.find(tenantId, issuerId);
    if (!issuer) throw fiscalBillingAdminError("FISCAL_ISSUER_NOT_FOUND");
    return issuer;
  }

  async create(tenantId: string, input: FiscalIssuerCreateInput) {
    assertProvinceCode(input.countryCode, input.provinceCode);
    return toResponse(await this.repository.create(tenantId, input));
  }

  async update(
    tenantId: string,
    issuerId: string,
    input: FiscalIssuerUpdateInput,
  ) {
    const current = await this.repository.find(tenantId, issuerId);
    if (!current) throw fiscalBillingAdminError("FISCAL_ISSUER_NOT_FOUND");
    assertProvinceCode(
      input.countryCode ?? current.countryCode,
      input.provinceCode ?? current.provinceCode,
    );
    const issuer = await this.repository.update(tenantId, issuerId, input);
    if (!issuer) throw fiscalBillingAdminError("FISCAL_ISSUER_NOT_FOUND");
    return toResponse(issuer);
  }

  async setStatus(tenantId: string, issuerId: string, isActive: boolean) {
    try {
      const result = await this.repository.setStatus(
        tenantId,
        issuerId,
        isActive,
      );
      if (result.kind === "NOT_FOUND") {
        throw fiscalBillingAdminError("FISCAL_ISSUER_NOT_FOUND");
      }
      if (result.kind === "INCOMPLETE") {
        throw fiscalBillingAdminError("FISCAL_ISSUER_ACTIVATION_INCOMPLETE", {
          missingFields: result.missingFields,
        });
      }
      return toResponse(result.issuer);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw fiscalBillingAdminError("FISCAL_ISSUER_ACTIVATION_CONFLICT");
      }
      throw error;
    }
  }
}

function assertProvinceCode(countryCode: string, provinceCode: string) {
  const valid =
    countryCode === "CR"
      ? /^[1-7]$/.test(provinceCode)
      : /^\d{2}$/.test(provinceCode);
  if (!valid) {
    throw new BadRequestException(
      countryCode === "CR"
        ? "provinceCode debe ser un dígito del 1 al 7 para Costa Rica."
        : "provinceCode debe contener exactamente dos dígitos.",
    );
  }
}

function toResponse(issuer: FiscalIssuerRecord) {
  return {
    id: issuer.id,
    displayName: issuer.displayName,
    isActive: issuer.isActive,
    legalName: issuer.legalName,
    identificationTypeCode: issuer.identificationTypeCode,
    identificationNumber: issuer.identificationNumber,
    commercialName: issuer.commercialName,
    countryCode: issuer.countryCode,
    email: issuer.email,
    phoneCountryCode: issuer.phoneCountryCode,
    phoneNumber: issuer.phoneNumber,
    provinceCode: issuer.provinceCode,
    cantonCode: issuer.cantonCode,
    districtCode: issuer.districtCode,
    neighborhoodCode: issuer.neighborhoodCode,
    otherAddressDetails: issuer.otherAddressDetails,
    defaultCurrencyCode: issuer.defaultCurrencyCode,
    establishmentCode: issuer.establishmentCode,
    terminalCode: issuer.terminalCode,
    createdAt: issuer.createdAt.toISOString(),
    updatedAt: issuer.updatedAt.toISOString(),
  };
}

function toActivityResponse(activity: import("./fiscal-issuer-admin.types").FiscalIssuerEconomicActivityRecord) {
  return {
    id: activity.id,
    code: activity.economicActivityCode,
    description: activity.description,
    isPrimary: activity.isPrimary,
    displayOrder: activity.displayOrder,
    createdAt: activity.createdAt.toISOString(),
    updatedAt: activity.updatedAt.toISOString(),
  };
}

function isUniqueConstraintViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function isExplicitlyInactive(activity: { active?: boolean; status?: string }) {
  if (activity.active === false) return true;
  const status = activity.status?.trim().toUpperCase();
  return status === "I" || status === "INACTIVO" || status === "INACTIVE";
}
