import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { AdditionalServiceMarginType } from "./enums";
import {
  AdditionalServicePricingConfigurationRecord,
  AdditionalServicesRepository,
} from "./repositories";
import { AdditionalServicesService } from "./additional-services.service";
import { PricingEngineService } from "../pricing-engine";

describe("AdditionalServicesService pricing configurations", () => {
  const tenantId = "tenant-1";
  const catalogId = "catalog-1";
  const configurationId = "pricing-1";

  let repository: jest.Mocked<AdditionalServicesRepository>;
  let service: AdditionalServicesService;

  const catalog = {
    id: catalogId,
    tenantId,
    code: "TOUR",
    name: "Tour",
    isActive: true,
  };

  const configuration: AdditionalServicePricingConfigurationRecord = {
    id: configurationId,
    tenantId,
    additionalServiceCatalogId: catalogId,
    marginType: AdditionalServiceMarginType.PERCENTAGE,
    marginValue: "15",
    taxPercentage: "13",
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    additionalServiceCatalog: catalog,
  };

  beforeEach(() => {
    repository = {
      executeInTransaction: jest.fn(),
      findTenantById: jest.fn(),
      findAllTenantIds: jest.fn(),
      findTravelPackageById: jest.fn(),
      findInternalBookingById: jest.fn(),
      findParticipantsByIds: jest.fn(),
      findTravelParticipants: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      updateOrderDelivery: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      findByTravel: jest.fn(),
      findOrderDashboardPage: jest.fn(),
      findAdditionalServiceCatalogById: jest.fn(),
      findAdditionalServiceCatalogByTenantAndId: jest.fn(),
      findAdditionalServiceCatalogByCode: jest.fn(),
      findAdditionalServiceCatalogsByCodes: jest.fn(),
      findAdditionalServiceCatalogs: jest.fn(),
      findAdditionalServiceCatalogCodes: jest.fn(),
      createAdditionalServiceCatalogItems: jest.fn(),
      findPricingConfigurations: jest.fn(),
      findPricingConfigurationById: jest.fn(),
      findPricingConfigurationByCatalogId: jest.fn(),
      findPricingConfigurationsByCatalogIds: jest.fn(),
      createPricingConfiguration: jest.fn(),
      updatePricingConfiguration: jest.fn(),
      findFiscalProfileById: jest.fn(),
      findFiscalProfileByCatalogId: jest.fn(),
      createFiscalProfile: jest.fn(),
      updateFiscalProfile: jest.fn(),
      findSuppliers: jest.fn(),
      findSupplierById: jest.fn(),
      findSuppliersByIds: jest.fn(),
      findSupplierByName: jest.fn(),
      createSupplier: jest.fn(),
      updateSupplier: jest.fn(),
    };
    service = new AdditionalServicesService(
      repository,
      { calculate: jest.fn() } as unknown as PricingEngineService,
    );
  });

  it("lists only administration catalog fields for the current tenant", async () => {
    repository.findAdditionalServiceCatalogs.mockResolvedValue([
      {
        ...catalog,
        pricingConfiguration: {
          id: configurationId,
          marginType: AdditionalServiceMarginType.PERCENTAGE,
          marginValue: "15",
          taxPercentage: "13",
          isActive: true,
        },
        fiscalProfile: null,
      },
    ]);

    const result = await service.listAdditionalServiceCatalog(tenantId);

    expect(repository.findAdditionalServiceCatalogs).toHaveBeenCalledWith(
      tenantId,
    );
    expect(result).toEqual([
      {
        id: catalogId,
        code: "TOUR",
        name: "Tour",
        isActive: true,
        pricingConfiguration: {
          id: configurationId,
          marginType: AdditionalServiceMarginType.PERCENTAGE,
          marginValue: "15",
          taxPercentage: "13",
          isActive: true,
        },
        fiscalProfile: null,
        fiscalReadiness: {
          status: "ABSENT",
          isReady: false,
          issues: [],
        },
      },
    ]);
  });

  it("returns null when a catalog item has no pricing configuration", async () => {
    repository.findAdditionalServiceCatalogs.mockResolvedValue([
      {
        ...catalog,
        pricingConfiguration: null,
        fiscalProfile: null,
      },
    ]);

    const result = await service.listAdditionalServiceCatalog(tenantId);

    expect(result[0].pricingConfiguration).toBeNull();
  });

  it("creates a tenant-scoped pricing configuration", async () => {
    repository.findAdditionalServiceCatalogById.mockResolvedValue(catalog);
    repository.findPricingConfigurationByCatalogId.mockResolvedValue(null);
    repository.createPricingConfiguration.mockResolvedValue(configuration);

    const result = await service.createPricingConfiguration(tenantId, {
      additionalServiceCatalogId: catalogId,
      marginType: AdditionalServiceMarginType.PERCENTAGE,
      marginValue: 15,
      taxPercentage: 13,
    });

    expect(result).toBe(configuration);
    expect(repository.createPricingConfiguration).toHaveBeenCalledWith({
      tenantId,
      additionalServiceCatalogId: catalogId,
      marginType: AdditionalServiceMarginType.PERCENTAGE,
      marginValue: 15,
      taxPercentage: 13,
      isActive: true,
    });
  });

  it("rejects a catalog from another tenant", async () => {
    repository.findAdditionalServiceCatalogById.mockResolvedValue({
      ...catalog,
      tenantId: "tenant-2",
    });

    await expect(
      service.createPricingConfiguration(tenantId, {
        additionalServiceCatalogId: catalogId,
        marginType: AdditionalServiceMarginType.FIXED,
        marginValue: 10,
        taxPercentage: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a missing catalog", async () => {
    repository.findAdditionalServiceCatalogById.mockResolvedValue(null);

    await expect(
      service.createPricingConfiguration(tenantId, {
        additionalServiceCatalogId: catalogId,
        marginType: AdditionalServiceMarginType.FIXED,
        marginValue: 10,
        taxPercentage: 0,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects a duplicate configuration", async () => {
    repository.findAdditionalServiceCatalogById.mockResolvedValue(catalog);
    repository.findPricingConfigurationByCatalogId.mockResolvedValue(
      configuration,
    );

    await expect(
      service.createPricingConfiguration(tenantId, {
        additionalServiceCatalogId: catalogId,
        marginType: AdditionalServiceMarginType.FIXED,
        marginValue: 10,
        taxPercentage: 0,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects negative values when called outside the validation pipe", async () => {
    await expect(
      service.createPricingConfiguration(tenantId, {
        additionalServiceCatalogId: catalogId,
        marginType: AdditionalServiceMarginType.FIXED,
        marginValue: -1,
        taxPercentage: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(
      repository.findAdditionalServiceCatalogById,
    ).not.toHaveBeenCalled();
  });

  it("sets the requested status for a configuration in the current tenant", async () => {
    repository.findPricingConfigurationById.mockResolvedValue(configuration);
    repository.updatePricingConfiguration.mockResolvedValue({
      ...configuration,
      isActive: false,
    });

    const result = await service.updatePricingConfigurationStatus(
      tenantId,
      configurationId,
      false,
    );

    expect(result.isActive).toBe(false);
    expect(repository.updatePricingConfiguration).toHaveBeenCalledWith(
      tenantId,
      configurationId,
      { isActive: false },
    );
  });

  it("keeps status updates idempotent", async () => {
    const inactiveConfiguration = {
      ...configuration,
      isActive: false,
    };
    repository.findPricingConfigurationById.mockResolvedValue(
      inactiveConfiguration,
    );
    repository.updatePricingConfiguration.mockResolvedValue(
      inactiveConfiguration,
    );

    await service.updatePricingConfigurationStatus(
      tenantId,
      configurationId,
      false,
    );
    await service.updatePricingConfigurationStatus(
      tenantId,
      configurationId,
      false,
    );

    expect(repository.updatePricingConfiguration).toHaveBeenNthCalledWith(
      1,
      tenantId,
      configurationId,
      { isActive: false },
    );
    expect(repository.updatePricingConfiguration).toHaveBeenNthCalledWith(
      2,
      tenantId,
      configurationId,
      { isActive: false },
    );
  });
});
