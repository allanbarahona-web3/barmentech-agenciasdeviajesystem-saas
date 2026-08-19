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
import { FiscalIssuerAdminService } from "./fiscal-issuer-admin.service";
import type { FiscalIssuerAdminRepository } from "./fiscal-issuer-admin.repository";
import type { FiscalIssuerRecord } from "./fiscal-issuer-admin.types";

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

  it.each([
    [CreateFiscalIssuerDto, "3-102-884562"],
    [CreateFiscalIssuerDto, "3 102 884562"],
    [UpdateFiscalIssuerDto, "3-102-884562"],
    [UpdateFiscalIssuerDto, "3 102 884562"],
  ])(
    "%s accepts formatted identification %p and trims only outer whitespace",
    async (metatype, formatted) => {
      const input =
        metatype === CreateFiscalIssuerDto
          ? { ...validCreate(), identificationNumber: `  ${formatted}  ` }
          : { identificationNumber: `  ${formatted}  ` };

      const result = await validate(metatype, input) as {
        identificationNumber: unknown;
      };
      expect(result).toMatchObject({
        identificationNumber: formatted,
      });
      expect(typeof result.identificationNumber).toBe("string");
    },
  );

  it("passes validated formatted POST input to the service and persists it canonically", async () => {
    const repository = repositoryMock();
    repository.create.mockImplementation(async (_tenantId, input) =>
      issuer({ identificationNumber: input.identificationNumber }),
    );
    const controller = new FiscalIssuerAdminController(
      new FiscalIssuerAdminService(repository),
    );
    const body = await validate(CreateFiscalIssuerDto, {
      ...validCreate(),
      identificationNumber: " 3-102-884562 ",
    }) as CreateFiscalIssuerDto;

    await expect(
      controller.create(
        { user: { tenantId: "tenant-auth", role: UserRole.ADMIN } },
        body,
      ),
    ).resolves.toMatchObject({ identificationNumber: "3102884562" });
    expect(repository.create).toHaveBeenCalledWith(
      "tenant-auth",
      expect.objectContaining({ identificationNumber: "3102884562" }),
    );
  });

  it.each(["3A102884562", "3/102884562", "3.102884562"])(
    "rejects unsupported CR identification %p before persistence without disclosing it",
    async (identificationNumber) => {
      const repository = repositoryMock();
      const controller = new FiscalIssuerAdminController(
        new FiscalIssuerAdminService(repository),
      );
      const body = await validate(CreateFiscalIssuerDto, {
        ...validCreate(),
        identificationNumber,
      }) as CreateFiscalIssuerDto;

      try {
        await controller.create(
          { user: { tenantId: "tenant-auth", role: UserRole.ADMIN } },
          body,
        );
        throw new Error("Expected identification validation to fail");
      } catch (error) {
        expect(error).toMatchObject({
          response: expect.objectContaining({
            code: "FISCAL_ISSUER_IDENTIFICATION_INVALID",
          }),
        });
        expect(JSON.stringify((error as { response: unknown }).response))
          .not.toContain(identificationNumber);
      }
      expect(repository.create).not.toHaveBeenCalled();
    },
  );
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

function repositoryMock() {
  return {
    list: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    setStatus: jest.fn(),
    listEconomicActivities: jest.fn(),
    findEconomicActivity: jest.fn(),
    createEconomicActivity: jest.fn(),
    selectPrimaryEconomicActivity: jest.fn(),
    deleteEconomicActivity: jest.fn(),
  } as jest.Mocked<FiscalIssuerAdminRepository>;
}

function issuer(overrides: Partial<FiscalIssuerRecord> = {}): FiscalIssuerRecord {
  return {
    id: "issuer-a",
    tenantId: "tenant-auth",
    displayName: "Main issuer",
    isActive: false,
    legalName: "Issuer S.A.",
    identificationTypeCode: "02",
    identificationNumber: "3102884562",
    commercialName: null,
    countryCode: "CR",
    email: "fiscal@example.com",
    phoneCountryCode: null,
    phoneNumber: null,
    provinceCode: "1",
    cantonCode: "01",
    districtCode: "01",
    neighborhoodCode: null,
    otherAddressDetails: "San José",
    defaultCurrencyCode: null,
    establishmentCode: "001",
    terminalCode: "00001",
    createdAt: new Date("2026-08-17T10:00:00Z"),
    updatedAt: new Date("2026-08-17T11:00:00Z"),
    ...overrides,
  };
}
