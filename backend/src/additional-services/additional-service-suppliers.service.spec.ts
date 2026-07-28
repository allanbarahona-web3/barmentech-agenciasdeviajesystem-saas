import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import {
  AdditionalServicesRepository,
  SupplierRecord,
} from "./repositories";
import { AdditionalServicesService } from "./additional-services.service";

describe("AdditionalServicesService suppliers", () => {
  const tenantId = "tenant-1";
  const supplierId = "supplier-1";

  let repository: jest.Mocked<AdditionalServicesRepository>;
  let service: AdditionalServicesService;

  const supplier: SupplierRecord = {
    id: supplierId,
    tenantId,
    name: "Proveedor Uno",
    website: "https://supplier.example",
    supplierType: "HOTEL",
    supplierCategory: "Hospedaje",
    notes: null,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  beforeEach(() => {
    repository = {
      executeInTransaction: jest.fn(),
      findTenantById: jest.fn(),
      findAllTenantIds: jest.fn(),
      findTravelPackageById: jest.fn(),
      findInternalTripById: jest.fn(),
      findParticipantsByIds: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      findByTravel: jest.fn(),
      findAdditionalServiceCatalogById: jest.fn(),
      findAdditionalServiceCatalogs: jest.fn(),
      findAdditionalServiceCatalogCodes: jest.fn(),
      createAdditionalServiceCatalogItems: jest.fn(),
      findPricingConfigurations: jest.fn(),
      findPricingConfigurationById: jest.fn(),
      findPricingConfigurationByCatalogId: jest.fn(),
      createPricingConfiguration: jest.fn(),
      updatePricingConfiguration: jest.fn(),
      findSuppliers: jest.fn(),
      findSupplierById: jest.fn(),
      findSupplierByName: jest.fn(),
      createSupplier: jest.fn(),
      updateSupplier: jest.fn(),
    };
    service = new AdditionalServicesService(repository);
  });

  it("lists suppliers for the authenticated tenant", async () => {
    repository.findSuppliers.mockResolvedValue([supplier]);

    await expect(service.listSuppliers(tenantId)).resolves.toEqual([
      supplier,
    ]);
    expect(repository.findSuppliers).toHaveBeenCalledWith(tenantId);
  });

  it("rejects access to a supplier outside the tenant scope", async () => {
    repository.findSupplierById.mockResolvedValue(null);

    await expect(
      service.getSupplier(tenantId, supplierId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.findSupplierById).toHaveBeenCalledWith(
      tenantId,
      supplierId,
    );
  });

  it("normalizes and creates a supplier for the tenant", async () => {
    repository.findSupplierByName.mockResolvedValue(null);
    repository.createSupplier.mockResolvedValue(supplier);

    await service.createSupplier(tenantId, {
      name: "  Proveedor Uno  ",
      website: "https://supplier.example",
      supplierType: " HOTEL ",
      supplierCategory: " Hospedaje ",
      notes: " ",
    });

    expect(repository.createSupplier).toHaveBeenCalledWith({
      tenantId,
      name: "Proveedor Uno",
      website: "https://supplier.example",
      supplierType: "HOTEL",
      supplierCategory: "Hospedaje",
      notes: null,
      isActive: true,
    });
  });

  it("rejects a duplicate supplier name within the tenant", async () => {
    repository.findSupplierByName.mockResolvedValue(supplier);

    await expect(
      service.createSupplier(tenantId, { name: supplier.name }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.createSupplier).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only supplier name", async () => {
    await expect(
      service.createSupplier(tenantId, { name: "   " }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.findSupplierByName).not.toHaveBeenCalled();
  });

  it("excludes the current supplier from duplicate checks on update", async () => {
    repository.findSupplierById.mockResolvedValue(supplier);
    repository.findSupplierByName.mockResolvedValue(null);
    repository.updateSupplier.mockResolvedValue({
      ...supplier,
      name: "Proveedor Actualizado",
    });

    await service.updateSupplier(tenantId, supplierId, {
      name: " Proveedor Actualizado ",
    });

    expect(repository.findSupplierByName).toHaveBeenCalledWith(
      tenantId,
      "Proveedor Actualizado",
      supplierId,
    );
    expect(repository.updateSupplier).toHaveBeenCalledWith(
      tenantId,
      supplierId,
      { name: "Proveedor Actualizado" },
    );
  });

  it("soft deletes a supplier without removing its record", async () => {
    repository.findSupplierById.mockResolvedValue(supplier);
    repository.updateSupplier.mockResolvedValue({
      ...supplier,
      isActive: false,
    });

    const result = await service.deleteSupplier(tenantId, supplierId);

    expect(repository.updateSupplier).toHaveBeenCalledWith(
      tenantId,
      supplierId,
      { isActive: false },
    );
    expect(result.isActive).toBe(false);
  });
});
