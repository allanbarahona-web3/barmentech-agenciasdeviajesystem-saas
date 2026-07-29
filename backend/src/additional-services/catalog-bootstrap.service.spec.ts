import { TECHNICAL_ADDITIONAL_SERVICE_CATALOG } from "./constants/technical-additional-service-catalog.constant";
import { CatalogBootstrapService } from "./catalog-bootstrap.service";
import { AdditionalServicesRepository } from "./repositories";

describe("CatalogBootstrapService", () => {
  let repository: jest.Mocked<AdditionalServicesRepository>;
  let service: CatalogBootstrapService;

  beforeEach(() => {
    repository = {
      executeInTransaction: jest.fn(),
      findTenantById: jest.fn(),
      findAllTenantIds: jest.fn(),
      findTravelPackageById: jest.fn(),
      findInternalBookingById: jest.fn(),
      findParticipantsByIds: jest.fn(),
      findTravelParticipantIds: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      findByTravel: jest.fn(),
      findAdditionalServiceCatalogById: jest.fn(),
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
      findSuppliers: jest.fn(),
      findSupplierById: jest.fn(),
      findSuppliersByIds: jest.fn(),
      findSupplierByName: jest.fn(),
      createSupplier: jest.fn(),
      updateSupplier: jest.fn(),
    };
    service = new CatalogBootstrapService(repository);
  });

  it("registers Visa Assistance in the technical catalog", () => {
    expect(TECHNICAL_ADDITIONAL_SERVICE_CATALOG).toContainEqual({
      code: "VISA_ASSISTANCE",
      name: "Visa Assistance",
      displayOrder: 12,
    });
  });

  it("bulk inserts the complete technical catalog for an empty tenant", async () => {
    repository.findAdditionalServiceCatalogCodes.mockResolvedValue([]);
    repository.createAdditionalServiceCatalogItems.mockResolvedValue(
      TECHNICAL_ADDITIONAL_SERVICE_CATALOG.length,
    );

    const inserted = await service.bootstrapTenant("tenant-1");

    expect(inserted).toBe(TECHNICAL_ADDITIONAL_SERVICE_CATALOG.length);
    expect(repository.createAdditionalServiceCatalogItems).toHaveBeenCalledWith(
      "tenant-1",
      TECHNICAL_ADDITIONAL_SERVICE_CATALOG,
    );
  });

  it("inserts only technical items missing from an existing tenant", async () => {
    const existingCode = TECHNICAL_ADDITIONAL_SERVICE_CATALOG[0].code;
    repository.findAdditionalServiceCatalogCodes.mockResolvedValue([
      existingCode,
    ]);
    repository.createAdditionalServiceCatalogItems.mockResolvedValue(
      TECHNICAL_ADDITIONAL_SERVICE_CATALOG.length - 1,
    );

    await service.bootstrapTenant("tenant-1");

    const insertedItems =
      repository.createAdditionalServiceCatalogItems.mock.calls[0][1];
    expect(insertedItems).toHaveLength(
      TECHNICAL_ADDITIONAL_SERVICE_CATALOG.length - 1,
    );
    expect(insertedItems.some((item) => item.code === existingCode)).toBe(
      false,
    );
  });

  it("does not write when the tenant catalog is already complete", async () => {
    repository.findAdditionalServiceCatalogCodes.mockResolvedValue(
      TECHNICAL_ADDITIONAL_SERVICE_CATALOG.map((item) => item.code),
    );

    const inserted = await service.bootstrapTenant("tenant-1");

    expect(inserted).toBe(0);
    expect(
      repository.createAdditionalServiceCatalogItems,
    ).not.toHaveBeenCalled();
  });

  it("reuses tenant bootstrap for every existing tenant", async () => {
    repository.findAllTenantIds.mockResolvedValue(["tenant-1", "tenant-2"]);
    repository.findAdditionalServiceCatalogCodes.mockResolvedValue([]);
    repository.createAdditionalServiceCatalogItems.mockResolvedValue(
      TECHNICAL_ADDITIONAL_SERVICE_CATALOG.length,
    );

    const inserted = await service.bootstrapExistingTenants();

    expect(inserted).toBe(TECHNICAL_ADDITIONAL_SERVICE_CATALOG.length * 2);
    expect(repository.findAdditionalServiceCatalogCodes).toHaveBeenCalledTimes(
      2,
    );
  });
});
