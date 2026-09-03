import {
  BadRequestException,
  NotFoundException,
  ValidationPipe,
} from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { ROLES_KEY } from "../auth/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { PricingEngineService } from "../pricing-engine";
import { FiscalCatalogService } from "../fiscal-catalogs/fiscal-catalog.service";
import { AdditionalServiceCatalogController } from "./additional-service-catalog.controller";
import { AdditionalServicesService } from "./additional-services.service";
import {
  CreateAdditionalServiceCatalogDto,
  UpdateAdditionalServiceCatalogDto,
} from "./dto";
import { AdditionalServicesRepository } from "./repositories";

describe("Additional Service catalog usage administration", () => {
  const tenantId = "tenant-1";
  const catalogId = "catalog-1";
  const fiscalReadiness = {
    status: "READY" as const,
    isReady: true,
    issues: [],
  };
  let repository: jest.Mocked<AdditionalServicesRepository>;
  let service: AdditionalServicesService;

  const adminRecord = (usages: Array<"ADDITIONAL_SERVICE" | "TRAVEL_PACKAGE" | "INTERNAL_TRIP">) => ({
    id: catalogId,
    tenantId,
    code: "TOUR",
    name: "Tour",
    isActive: true,
    usages,
    pricingConfiguration: null,
    fiscalProfile: {
      id: "profile-1",
      cabysCode: "6331000000000",
      unitOfMeasureCode: "Sp",
      taxCode: "01",
      taxRateCode: "08",
      taxPercentage: "13.0000",
      isActive: true,
    },
  });

  beforeEach(() => {
    const partial: Partial<jest.Mocked<AdditionalServicesRepository>> = {
      executeInTransaction: jest.fn(),
      createAdditionalServiceCatalog: jest.fn().mockResolvedValue({
        id: catalogId,
        tenantId,
        code: "TOUR",
        name: "Tour",
        isActive: true,
      }),
      updateAdditionalServiceCatalog: jest.fn(),
      replaceAdditionalServiceCatalogUsages: jest.fn(),
      findAdditionalServiceCatalogByTenantAndId: jest.fn(),
      findAdditionalServiceCatalogs: jest
        .fn()
        .mockResolvedValue([adminRecord(["ADDITIONAL_SERVICE"])]),
      findAdditionalServiceCatalogsByUsage: jest.fn(),
    };
    repository = partial as jest.Mocked<AdditionalServicesRepository>;
    repository.executeInTransaction.mockImplementation((work) =>
      work(repository),
    );
    const fiscal = {
      evaluateFiscalProfiles: jest
        .fn()
        .mockResolvedValue(new Map([[catalogId, fiscalReadiness]])),
    };
    service = new AdditionalServicesService(
      repository,
      {} as PricingEngineService,
      fiscal as unknown as FiscalCatalogService,
    );
  });

  it("defaults omitted usages to ADDITIONAL_SERVICE atomically", async () => {
    await service.createAdditionalServiceCatalog(tenantId, {
      code: "tour",
      name: "Tour",
    });

    expect(repository.executeInTransaction).toHaveBeenCalledTimes(1);
    expect(repository.createAdditionalServiceCatalog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        code: "TOUR",
        name: "Tour",
      }),
    );
    expect(
      repository.replaceAdditionalServiceCatalogUsages,
    ).toHaveBeenCalledWith(tenantId, catalogId, ["ADDITIONAL_SERVICE"]);
  });

  it.each([
    [["TRAVEL_PACKAGE"]],
    [["INTERNAL_TRIP"]],
    [["TRAVEL_PACKAGE", "INTERNAL_TRIP"]],
  ] as const)("creates explicit usage set %j", async (usages) => {
    repository.findAdditionalServiceCatalogs.mockResolvedValue([
      adminRecord([...usages]),
    ]);

    await service.createAdditionalServiceCatalog(tenantId, {
      code: "travel",
      name: "Travel",
      usages: [...usages],
    });

    expect(
      repository.replaceAdditionalServiceCatalogUsages,
    ).toHaveBeenCalledWith(tenantId, catalogId, [...usages]);
  });

  it.each([
    [[], "ADDITIONAL_SERVICE_CATALOG_USAGES_REQUIRED"],
    [
      ["TRAVEL_PACKAGE", "TRAVEL_PACKAGE"],
      "ADDITIONAL_SERVICE_CATALOG_USAGE_DUPLICATE",
    ],
    [["UNKNOWN"], "ADDITIONAL_SERVICE_CATALOG_USAGE_INVALID"],
  ])("rejects invalid usage set %j", async (usages, code) => {
    await expect(
      service.createAdditionalServiceCatalog(tenantId, {
        code: "travel",
        name: "Travel",
        usages: usages as never,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(repository.executeInTransaction).not.toHaveBeenCalled();
    expect(code).toBeTruthy();
  });

  it("replaces ADDITIONAL_SERVICE with TRAVEL_PACKAGE in one transaction", async () => {
    repository.findAdditionalServiceCatalogByTenantAndId.mockResolvedValue({
      id: catalogId,
      tenantId,
      code: "TOUR",
      name: "Tour",
      isActive: true,
    });
    repository.findAdditionalServiceCatalogs.mockResolvedValue([
      adminRecord(["TRAVEL_PACKAGE"]),
    ]);

    const result = await service.updateAdditionalServiceCatalog(
      tenantId,
      catalogId,
      { usages: ["TRAVEL_PACKAGE"] },
    );

    expect(repository.executeInTransaction).toHaveBeenCalledTimes(1);
    expect(repository.updateAdditionalServiceCatalog).toHaveBeenCalledWith(
      tenantId,
      catalogId,
      {},
    );
    expect(
      repository.replaceAdditionalServiceCatalogUsages,
    ).toHaveBeenCalledWith(tenantId, catalogId, ["TRAVEL_PACKAGE"]);
    expect(result.usages).toEqual(["TRAVEL_PACKAGE"]);
  });

  it("can add and remove usages while always retaining at least one", async () => {
    repository.findAdditionalServiceCatalogByTenantAndId.mockResolvedValue({
      id: catalogId,
      tenantId,
      code: "TOUR",
      name: "Tour",
      isActive: true,
    });
    repository.findAdditionalServiceCatalogs.mockResolvedValue([
      adminRecord(["ADDITIONAL_SERVICE", "INTERNAL_TRIP"]),
    ]);

    await service.updateAdditionalServiceCatalog(tenantId, catalogId, {
      usages: ["ADDITIONAL_SERVICE", "INTERNAL_TRIP"],
    });

    expect(
      repository.replaceAdditionalServiceCatalogUsages,
    ).toHaveBeenCalledWith(tenantId, catalogId, [
      "ADDITIONAL_SERVICE",
      "INTERNAL_TRIP",
    ]);

    await expect(
      service.updateAdditionalServiceCatalog(tenantId, catalogId, {
        usages: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("does not expose or modify a cross-tenant catalog", async () => {
    repository.findAdditionalServiceCatalogByTenantAndId.mockResolvedValue(
      null,
    );

    await expect(
      service.updateAdditionalServiceCatalog(tenantId, "foreign", {
        usages: ["TRAVEL_PACKAGE"],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.updateAdditionalServiceCatalog).not.toHaveBeenCalled();
    expect(
      repository.replaceAdditionalServiceCatalogUsages,
    ).not.toHaveBeenCalled();
  });

  it("propagates usage-write failure so catalog creation rolls back", async () => {
    repository.replaceAdditionalServiceCatalogUsages.mockRejectedValue(
      new Error("usage insert failed"),
    );

    await expect(
      service.createAdditionalServiceCatalog(tenantId, {
        code: "travel",
        name: "Travel",
        usages: ["TRAVEL_PACKAGE"],
      }),
    ).rejects.toThrow("usage insert failed");
    expect(repository.executeInTransaction).toHaveBeenCalledTimes(1);
    expect(repository.findAdditionalServiceCatalogs).not.toHaveBeenCalled();
  });

  it("returns usages in the ADMIN catalog read", async () => {
    repository.findAdditionalServiceCatalogs.mockResolvedValue([
      adminRecord(["TRAVEL_PACKAGE", "INTERNAL_TRIP"]),
    ]);

    const result = await service.listAdditionalServiceCatalog(tenantId);

    expect(result[0].usages).toEqual([
      "TRAVEL_PACKAGE",
      "INTERNAL_TRIP",
    ]);
  });

  it("loads selectable Add-ons only through ADDITIONAL_SERVICE usage", async () => {
    repository.findAdditionalServiceCatalogsByUsage.mockResolvedValue([
      adminRecord(["ADDITIONAL_SERVICE", "TRAVEL_PACKAGE"]),
    ]);

    const result = await service.listSelectableAdditionalServices(tenantId);

    expect(
      repository.findAdditionalServiceCatalogsByUsage,
    ).toHaveBeenCalledWith(tenantId, "ADDITIONAL_SERVICE");
    expect(result).toEqual([
      expect.objectContaining({ code: "TOUR", isSellable: true }),
    ]);
  });
});

describe("Additional Service catalog DTO and authorization", () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  it("keeps all catalog mutations ADMIN-only", () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdditionalServiceCatalogController),
    ).toEqual([JwtAuthGuard, RolesGuard]);
    expect(
      Reflect.getMetadata(ROLES_KEY, AdditionalServiceCatalogController),
    ).toEqual(["ADMIN"]);
  });

  it.each([
    [CreateAdditionalServiceCatalogDto, { code: "X", name: "X", usages: [] }],
    [
      CreateAdditionalServiceCatalogDto,
      { code: "X", name: "X", usages: ["UNKNOWN"] },
    ],
    [
      UpdateAdditionalServiceCatalogDto,
      { usages: ["TRAVEL_PACKAGE", "TRAVEL_PACKAGE"] },
    ],
  ])("rejects invalid or duplicate usage DTOs", async (metatype, value) => {
    await expect(
      pipe.transform(value, { type: "body", metatype }),
    ).rejects.toBeDefined();
  });
});
