import { ForbiddenException, ValidationPipe } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ROLES_KEY } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UpdateTenantBillingConfigurationDto } from "./dto/update-tenant-billing-configuration.dto";
import { FiscalBillingAdminController } from "./fiscal-billing-admin.controller";

describe("FiscalBillingAdminController", () => {
  it("requires JWT and ADMIN role", () => {
    expect(Reflect.getMetadata(ROLES_KEY, FiscalBillingAdminController)).toEqual([
      UserRole.ADMIN,
    ]);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, FiscalBillingAdminController),
    ).toEqual([JwtAuthGuard, RolesGuard]);
    expect(canActivate(UserRole.ADMIN)).toBe(true);
  });

  it.each([
    UserRole.FACTURACION_COBROS,
    UserRole.AGENT,
    UserRole.OPERACIONES,
    UserRole.CONTADOR,
  ])("rejects non-ADMIN role %s", (role) => {
    expect(() => canActivate(role)).toThrow(ForbiddenException);
  });

  it("takes tenant identity only from the authenticated request", async () => {
    const service = {
      getConfiguration: jest.fn().mockResolvedValue({}),
      updateConfiguration: jest.fn().mockResolvedValue({}),
    };
    const controller = new FiscalBillingAdminController(service as never);

    await controller.getConfiguration({
      user: { tenantId: "tenant-auth", role: UserRole.ADMIN },
    });
    await controller.updateConfiguration(
      { user: { tenantId: "tenant-auth", role: UserRole.ADMIN } },
      { billingEnabled: true },
    );

    expect(service.getConfiguration).toHaveBeenCalledWith("tenant-auth");
    expect(service.updateConfiguration).toHaveBeenCalledWith("tenant-auth", {
      billingEnabled: true,
    });
  });

  it.each([
    { tenantId: "tenant-other" },
    { unknown: true },
  ])("rejects forbidden body field %#", async (body) => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    await expect(
      pipe.transform(body, {
        type: "body",
        metatype: UpdateTenantBillingConfigurationDto,
      }),
    ).rejects.toBeDefined();
  });

  it("validates and trims the allowed configuration fields", async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    await expect(
      pipe.transform(
        {
          billingEnabled: true,
          externalRegistrationEnabled: false,
          electronicIssuanceEnabled: false,
          countryCode: "CR",
          defaultCurrencyCode: "CRC",
          fiscalTimezone: " America/Costa_Rica ",
          fiscalSchemaVersion: " 4.4 ",
        },
        { type: "body", metatype: UpdateTenantBillingConfigurationDto },
      ),
    ).resolves.toMatchObject({
      fiscalTimezone: "America/Costa_Rica",
      fiscalSchemaVersion: "4.4",
    });
  });
});

function canActivate(role: UserRole) {
  const guard = new RolesGuard(new Reflector());
  const context = {
    getHandler: () => FiscalBillingAdminController.prototype.getConfiguration,
    getClass: () => FiscalBillingAdminController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  };
  return guard.canActivate(context as never);
}
