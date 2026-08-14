import { ArgumentMetadata, ForbiddenException, ValidationPipe } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { ROLES_KEY } from "../auth/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { CabysCodeParamDto, CabysSearchQueryDto, ConfirmCabysDto, TaxCodeParamDto } from "./fiscal-catalog.dto";
import { FiscalCatalogController } from "./fiscal-catalog.controller";

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const metadata = (metatype: new () => object, type: ArgumentMetadata["type"]): ArgumentMetadata => ({ type, metatype, data: undefined });

describe("FiscalCatalogController authorization and validation", () => {
  it("requires JWT, ADMIN role, and RolesGuard", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, FiscalCatalogController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, FiscalCatalogController)).toEqual(["ADMIN"]);
  });

  it("passes only authenticated tenant identity to the service", async () => {
    const service = { searchCabys: jest.fn().mockResolvedValue({ items: [] }) };
    const controller = new FiscalCatalogController(service as never);
    await controller.searchCabys({ user: { tenantId: "tenant-1" } }, { q: "pan", top: 20 });
    expect(service.searchCabys).toHaveBeenCalledWith("tenant-1", "pan", 20);
  });

  it("rejects missing tenant context through the service boundary", async () => {
    const service = { units: jest.fn().mockRejectedValue(new ForbiddenException({ code: "TENANT_REQUIRED" })) };
    const controller = new FiscalCatalogController(service as never);
    await expect(controller.units({ user: {} })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    [CabysSearchQueryDto, "query" as const, { q: "  ", top: 20 }],
    [CabysSearchQueryDto, "query" as const, { q: "ab", top: 20 }],
    [CabysSearchQueryDto, "query" as const, { q: "abc", top: 51 }],
    [CabysCodeParamDto, "param" as const, { code: "123" }],
    [TaxCodeParamDto, "param" as const, { taxCode: "1A" }],
  ])("rejects invalid request DTO", async (metatype, type, value) => {
    await expect(pipe.transform(value, metadata(metatype, type))).rejects.toBeDefined();
  });

  it("defaults top to 20 and trims q", async () => {
    await expect(pipe.transform({ q: "  pan pita  " }, metadata(CabysSearchQueryDto, "query"))).resolves.toMatchObject({ q: "pan pita", top: 20 });
  });

  it.each([
    [CabysSearchQueryDto, "query" as const, { q: "pan", tenantId: "other" }],
    [CabysSearchQueryDto, "query" as const, { q: "pan", countryCode: "US" }],
    [ConfirmCabysDto, "body" as const, { code: "2349002011500", description: "forged" }],
  ])("rejects unknown or caller-controlled scope properties", async (metatype, type, value) => {
    await expect(pipe.transform(value, metadata(metatype, type))).rejects.toBeDefined();
  });
});
