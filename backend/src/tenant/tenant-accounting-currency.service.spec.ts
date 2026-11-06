import { ValidationPipe } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { ROLES_KEY } from "../auth/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { TenantController } from "./tenant.controller";
import { TenantService } from "./tenant.service";
import { UpdateTenantConfigDto } from "./dto/update-tenant-config.dto";

describe("Tenant accounting currency setting", () => {
  it("keeps the existing tenant settings endpoint ADMIN-only", () => {
    expect(Reflect.getMetadata(ROLES_KEY, TenantController)).toEqual(["ADMIN"]);
    expect(Reflect.getMetadata(GUARDS_METADATA, TenantController)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
  });

  it("takes tenant identity only from the authenticated request", async () => {
    const service = {
      getTenantConfig: jest.fn().mockResolvedValue({}),
      updateTenantConfig: jest.fn().mockResolvedValue({}),
    };
    const controller = new TenantController(service as never);

    await controller.getTenantConfig({ user: { tenantId: "tenant-auth" } });
    await controller.updateTenantConfig(
      { user: { tenantId: "tenant-auth" } },
      { timeZone: "America/Lima" },
    );

    expect(service.getTenantConfig).toHaveBeenCalledWith("tenant-auth");
    expect(service.updateTenantConfig).toHaveBeenCalledWith("tenant-auth", {
      timeZone: "America/Lima",
    });
  });

  it("returns the nullable accounting currency through the existing tenant settings read", async () => {
    const c = context();
    c.billing.findUnique.mockResolvedValue({ accountingCurrencyCode: "CRC", fiscalTimezone: "America/Lima" });

    await expect(c.service.getTenantConfig("tenant-a")).resolves.toMatchObject({
      id: "tenant-a",
      accountingCurrencyCode: "CRC",
      timeZone: "America/Lima",
    });
    expect(c.billing.findUnique).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a" },
      select: { accountingCurrencyCode: true, fiscalTimezone: true },
    });
    expect(c.billing.upsert).not.toHaveBeenCalled();
  });

  it("uses the established fallback for a missing configuration without creating one", async () => {
    const c = context();

    await expect(c.service.getTenantConfig("tenant-a")).resolves.toMatchObject({
      timeZone: "America/Costa_Rica",
    });
    expect(c.billing.upsert).not.toHaveBeenCalled();
  });

  it("returns an existing stored timezone unchanged, including a legacy invalid value", async () => {
    const c = context();
    c.billing.findUnique.mockResolvedValue({
      accountingCurrencyCode: null,
      fiscalTimezone: "legacy/invalid",
    });

    await expect(c.service.getTenantConfig("tenant-a")).resolves.toMatchObject({
      timeZone: "legacy/invalid",
    });
    expect(c.billing.upsert).not.toHaveBeenCalled();
  });

  it("normalizes and persists only accountingCurrencyCode without changing fiscal defaults or FX source", async () => {
    const c = context();

    await expect(c.service.updateTenantConfig("tenant-a", { accountingCurrencyCode: " cop " } as UpdateTenantConfigDto)).resolves.toMatchObject({ accountingCurrencyCode: "COP" });

    expect(c.billing.upsert).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a" },
      create: { tenantId: "tenant-a", accountingCurrencyCode: "COP" },
      update: { accountingCurrencyCode: "COP" },
    });
    const billingWrite = c.billing.upsert.mock.calls[0][0];
    expect(billingWrite.update).not.toHaveProperty("defaultCurrencyCode");
    expect(billingWrite.update).not.toHaveProperty("exchangeRateSource");
  });

  it("supports the null/unconfigured state and rejects malformed direct service input", async () => {
    const c = context();
    await c.service.updateTenantConfig("tenant-a", { accountingCurrencyCode: null } as UpdateTenantConfigDto);
    expect(c.billing.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ update: { accountingCurrencyCode: null } }));
    await expect(c.service.updateTenantConfig("tenant-a", { accountingCurrencyCode: "US" } as UpdateTenantConfigDto)).rejects.toMatchObject({ response: expect.objectContaining({ message: "TENANT_ACCOUNTING_CURRENCY_INVALID" }) });
  });

  it("normalizes a valid tenant timezone without changing fiscal controls", async () => {
    const c = context();

    await expect(
      c.service.updateTenantConfig("tenant-a", {
        timeZone: " America/Costa_Rica ",
      } as UpdateTenantConfigDto),
    ).resolves.toMatchObject({ timeZone: "America/Costa_Rica" });

    expect(c.billing.upsert).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a" },
      create: { tenantId: "tenant-a", fiscalTimezone: "America/Costa_Rica" },
      update: { fiscalTimezone: "America/Costa_Rica" },
    });
    const billingWrite = c.billing.upsert.mock.calls[0][0];
    expect(billingWrite.update).not.toHaveProperty("billingEnabled");
    expect(billingWrite.update).not.toHaveProperty("electronicIssuanceEnabled");
    expect(billingWrite.update).not.toHaveProperty("defaultCurrencyCode");
  });

  it("rejects invalid direct timezone input and leaves an omitted timezone untouched", async () => {
    const c = context();

    await expect(
      c.service.updateTenantConfig("tenant-a", {
        timeZone: "Not/A_Timezone",
      } as UpdateTenantConfigDto),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ message: "TENANT_TIMEZONE_INVALID" }),
    });
    expect(c.billing.upsert).not.toHaveBeenCalled();

    await c.service.updateTenantConfig("tenant-a", {
      primaryColor: "#123456",
    } as UpdateTenantConfigDto);
    expect(c.billing.upsert).not.toHaveBeenCalled();
  });

  it("validates exactly three uppercase letters at the existing request boundary", async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    const metadata = { type: "body" as const, data: "", metatype: UpdateTenantConfigDto };
    await expect(pipe.transform({ accountingCurrencyCode: "crc" }, metadata)).resolves.toMatchObject({ accountingCurrencyCode: "CRC" });
    await expect(pipe.transform({ accountingCurrencyCode: "CR" }, metadata)).rejects.toMatchObject({ response: { message: expect.arrayContaining(["La moneda contable debe tener exactamente 3 letras mayúsculas."]) } });
  });

  it.each([" America/Costa_Rica ", "America/Lima"]) (
    "accepts and trims a runtime-supported timezone %s at the request boundary",
    async (timeZone) => {
      const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
      const metadata = { type: "body" as const, data: "", metatype: UpdateTenantConfigDto };
      await expect(pipe.transform({ timeZone }, metadata)).resolves.toMatchObject({
        timeZone: timeZone.trim(),
      });
    },
  );

  it("rejects empty and unsupported timezone identifiers at the request boundary", async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    const metadata = { type: "body" as const, data: "", metatype: UpdateTenantConfigDto };
    await expect(pipe.transform({ timeZone: "   " }, metadata)).rejects.toBeDefined();
    await expect(pipe.transform({ timeZone: "Not/A_Timezone" }, metadata)).rejects.toBeDefined();
  });
});

function context() {
  const tenant = {
    findUnique: jest.fn().mockResolvedValue({ id: "tenant-a", name: "Agencia", fromEmail: null, replyToEmail: null, emailVerified: true }),
    update: jest.fn().mockResolvedValue({ id: "tenant-a", name: "Agencia", primaryColor: null, secondaryColor: null, fromEmail: null, replyToEmail: null, emailVerified: true, websiteUrl: null, legalName: null }),
  };
  const billing = { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) };
  const prisma = { tenant, tenantBillingConfiguration: billing };
  return { service: new TenantService(prisma as never, {} as never, {} as never), tenant, billing };
}
