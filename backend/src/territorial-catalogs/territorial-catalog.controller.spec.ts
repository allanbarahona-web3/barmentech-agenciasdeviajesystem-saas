import { ArgumentMetadata, ForbiddenException, ValidationPipe } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ROLES_KEY } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { TerritorialCatalogController } from "./territorial-catalog.controller";
import { TerritorialCountryParamDto, TerritorialSubdivisionQueryDto } from "./territorial-catalog.dto";

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const metadata = (metatype: new () => object, type: ArgumentMetadata["type"]): ArgumentMetadata => ({ type, metatype, data: undefined });

describe("TerritorialCatalogController authorization and validation", () => {
  it("exposes exactly the ADMIN-authenticated subdivisions GET route", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, TerritorialCatalogController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, TerritorialCatalogController)).toEqual([UserRole.ADMIN]);
    const handler = TerritorialCatalogController.prototype.subdivisions;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(":countryCode/subdivisions");
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(0);
  });

  it.each([UserRole.FACTURACION_COBROS, UserRole.AGENT, UserRole.OPERACIONES, UserRole.CONTADOR])("rejects non-ADMIN role %s", (role) => {
    const guard = new RolesGuard(new Reflector());
    expect(() => guard.canActivate({
      getHandler: () => TerritorialCatalogController.prototype.subdivisions,
      getClass: () => TerritorialCatalogController,
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    } as never)).toThrow(ForbiddenException);
  });

  it("normalizes country and trims parentFullCode while preserving it as a string", async () => {
    await expect(pipe.transform({ countryCode: " cr " }, metadata(TerritorialCountryParamDto, "param"))).resolves.toEqual({ countryCode: "CR" });
    await expect(pipe.transform({ parentFullCode: " 101 " }, metadata(TerritorialSubdivisionQueryDto, "query"))).resolves.toEqual({ parentFullCode: "101" });
    await expect(pipe.transform({}, metadata(TerritorialSubdivisionQueryDto, "query"))).resolves.toEqual({});
  });

  it.each([{ countryCode: "C" }, { countryCode: "CR1" }, { countryCode: "C1" }, { countryCode: "éR" }])("rejects invalid country %#", async (value) => {
    await expect(pipe.transform(value, metadata(TerritorialCountryParamDto, "param"))).rejects.toBeDefined();
  });

  it.each([{ parentFullCode: " " }, { parentFullCode: 101 }, { tenantId: "tenant" }, { parentFullCode: "1", releaseId: "forged" }])("rejects invalid or caller-controlled query %#", async (value) => {
    await expect(pipe.transform(value, metadata(TerritorialSubdivisionQueryDto, "query"))).rejects.toBeDefined();
  });

  it("passes no tenant identity to the service", async () => {
    const service = { subdivisions: jest.fn().mockResolvedValue({ subdivisions: [] }) };
    const controller = new TerritorialCatalogController(service as never);
    await controller.subdivisions({ countryCode: "CR" }, { parentFullCode: "101" });
    expect(service.subdivisions).toHaveBeenCalledWith("CR", "101");
  });
});
