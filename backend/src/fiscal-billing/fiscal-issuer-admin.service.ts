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

@Injectable()
export class FiscalIssuerAdminService {
  constructor(
    @Inject(FISCAL_ISSUER_ADMIN_REPOSITORY)
    private readonly repository: FiscalIssuerAdminRepository,
  ) {}

  async list(tenantId: string) {
    return (await this.repository.list(tenantId)).map(toResponse);
  }

  async find(tenantId: string, issuerId: string) {
    const issuer = await this.repository.find(tenantId, issuerId);
    if (!issuer) throw fiscalBillingAdminError("FISCAL_ISSUER_NOT_FOUND");
    return toResponse(issuer);
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

function isUniqueConstraintViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
