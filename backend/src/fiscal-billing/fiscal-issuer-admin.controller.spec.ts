import { ForbiddenException, ValidationPipe } from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ROLES_KEY } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import {
  CreateFiscalIssuerDto,
  UpdateFiscalIssuerDto,
  UpdateFiscalIssuerStatusDto,
  AssignFiscalIssuerEconomicActivityDto,
} from "./dto/fiscal-issuer-admin.dto";
import { FiscalIssuerAdminController } from "./fiscal-issuer-admin.controller";

describe("FiscalIssuerAdminController", () => {
  it("requires JWT and ADMIN role", () => {
    expect(Reflect.getMetadata(ROLES_KEY, FiscalIssuerAdminController)).toEqual([
      UserRole.ADMIN,
    ]);
    expect(Reflect.getMetadata(GUARDS_METADATA, FiscalIssuerAdminController)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
    expect(canActivate(UserRole.ADMIN)).toBe(true);
  });

  it("exposes the read-only available-activities GET route", () => {
    const handler =
      FiscalIssuerAdminController.prototype.availableEconomicActivities;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      ":issuerId/economic-activities/available",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(0);
  });

  it.each([
    UserRole.FACTURACION_COBROS,
    UserRole.AGENT,
    UserRole.OPERACIONES,
    UserRole.CONTADOR,
  ])("rejects non-ADMIN role %s", (role) => {
    expect(() => canActivate(role)).toThrow(ForbiddenException);
  });

  it("takes tenant ID only from the authenticated request", async () => {
    const service = serviceMock();
    const controller = new FiscalIssuerAdminController(service as never);
    const request = {
      user: { tenantId: "tenant-auth", role: UserRole.ADMIN },
    };

    await controller.list(request);
    await controller.find(request, "issuer-a");
    await controller.availableEconomicActivities(request, "issuer-a");
    await controller.listEconomicActivities(request, "issuer-a");
    await controller.assignEconomicActivity(request, "issuer-a", { code: "007.0" });
    await controller.selectPrimaryEconomicActivity(request, "issuer-a", "activity-a");
    await controller.deleteEconomicActivity(request, "issuer-a", "activity-a");
    await controller.update(request, "issuer-a", { displayName: "Updated" });
    await controller.setStatus(request, "issuer-a", { isActive: true });

    expect(service.list).toHaveBeenCalledWith("tenant-auth");
    expect(service.find).toHaveBeenCalledWith("tenant-auth", "issuer-a");
    expect(service.availableEconomicActivities).toHaveBeenCalledWith(
      "tenant-auth",
      "issuer-a",
    );
    expect(service.listEconomicActivities).toHaveBeenCalledWith("tenant-auth", "issuer-a");
    expect(service.assignEconomicActivity).toHaveBeenCalledWith("tenant-auth", "issuer-a", "007.0");
    expect(service.selectPrimaryEconomicActivity).toHaveBeenCalledWith("tenant-auth", "issuer-a", "activity-a");
    expect(service.deleteEconomicActivity).toHaveBeenCalledWith("tenant-auth", "issuer-a", "activity-a");
    expect(service.update).toHaveBeenCalledWith("tenant-auth", "issuer-a", {
      displayName: "Updated",
    });
    expect(service.setStatus).toHaveBeenCalledWith(
      "tenant-auth",
      "issuer-a",
      true,
    );
  });

  it("accepts only a trimmed activity code", async () => {
    await expect(validate(AssignFiscalIssuerEconomicActivityDto, { code: " 007.0 " })).resolves.toEqual({ code: "007.0" });
    await expect(validate(AssignFiscalIssuerEconomicActivityDto, { code: "007.0", tenantId: "foreign" })).rejects.toBeDefined();
    await expect(validate(AssignFiscalIssuerEconomicActivityDto, { code: "007.0", description: "fake", isPrimary: true, displayOrder: 9, fiscalIssuerId: "other" })).rejects.toBeDefined();
  });

  it.each([
    { tenantId: "foreign" },
    { isActive: true },
    { economicActivities: [] },
    { numberingSequences: [] },
    { apiSecret: "hidden" },
  ])("rejects forbidden issuer creation field %#", async (field) => {
    await expect(validate(CreateFiscalIssuerDto, { ...validCreate(), ...field })).rejects.toBeDefined();
  });

  it.each([
    { tenantId: "foreign" },
    { isActive: true },
    { economicActivities: [] },
    { nextSequenceNumber: "1" },
    { providerCredential: "hidden" },
  ])("rejects forbidden issuer update field %#", async (field) => {
    await expect(validate(UpdateFiscalIssuerDto, field)).rejects.toBeDefined();
  });

  it("status DTO accepts only a real boolean", async () => {
    await expect(validate(UpdateFiscalIssuerStatusDto, { isActive: true })).resolves.toMatchObject({ isActive: true });
    await expect(validate(UpdateFiscalIssuerStatusDto, { isActive: "true" })).rejects.toBeDefined();
    await expect(validate(UpdateFiscalIssuerStatusDto, { isActive: false, tenantId: "foreign" })).rejects.toBeDefined();
  });

  it("trims strings and preserves codes and identification as strings", async () => {
    await expect(validate(CreateFiscalIssuerDto, validCreate())).resolves.toMatchObject({
      displayName: "Main issuer",
      identificationNumber: "0012345678",
      establishmentCode: "001",
      terminalCode: "00001",
    });
  });
});

function canActivate(role: UserRole) {
  const guard = new RolesGuard(new Reflector());
  return guard.canActivate({
    getHandler: () => FiscalIssuerAdminController.prototype.list,
    getClass: () => FiscalIssuerAdminController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as never);
}

function validate(metatype: new () => object, value: object) {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }).transform(value, { type: "body", metatype });
}

function validCreate() {
  return {
    displayName: " Main issuer ",
    legalName: "Issuer S.A.",
    identificationTypeCode: "02",
    identificationNumber: "0012345678",
    countryCode: "CR",
    email: "fiscal@example.com",
    provinceCode: "1",
    cantonCode: "01",
    districtCode: "01",
    otherAddressDetails: "San José",
    establishmentCode: "001",
    terminalCode: "00001",
  };
}

function serviceMock() {
  return {
    list: jest.fn(),
    find: jest.fn(),
    availableEconomicActivities: jest.fn(),
    listEconomicActivities: jest.fn(),
    assignEconomicActivity: jest.fn(),
    selectPrimaryEconomicActivity: jest.fn(),
    deleteEconomicActivity: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    setStatus: jest.fn(),
  };
}
