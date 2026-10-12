import { ValidationPipe } from "@nestjs/common";
import { ROLES_KEY } from "../auth/roles.decorator";
import { TenantController } from "./tenant.controller";
import { TenantService } from "./tenant.service";
import { UpdateTenantConfigDto } from "./dto/update-tenant-config.dto";

describe("Tenant accounting currency setting", () => {
  it("keeps the existing tenant settings endpoint ADMIN-only", () => {
    expect(Reflect.getMetadata(ROLES_KEY, TenantController)).toEqual(["ADMIN"]);
  });

  it("returns the nullable accounting currency through the existing tenant settings read", async () => {
    const c = context();
    c.billing.findUnique.mockResolvedValue({ accountingCurrencyCode: "CRC" });

    await expect(c.service.getTenantConfig("tenant-a")).resolves.toMatchObject({ id: "tenant-a", accountingCurrencyCode: "CRC" });
    expect(c.billing.findUnique).toHaveBeenCalledWith({ where: { tenantId: "tenant-a" }, select: { accountingCurrencyCode: true } });
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

  it("validates exactly three uppercase letters at the existing request boundary", async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    const metadata = { type: "body" as const, data: "", metatype: UpdateTenantConfigDto };
    await expect(pipe.transform({ accountingCurrencyCode: "crc" }, metadata)).resolves.toMatchObject({ accountingCurrencyCode: "CRC" });
    await expect(pipe.transform({ accountingCurrencyCode: "CR" }, metadata)).rejects.toMatchObject({ response: { message: expect.arrayContaining(["La moneda contable debe tener exactamente 3 letras mayúsculas."]) } });
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
