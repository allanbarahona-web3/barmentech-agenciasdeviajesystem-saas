import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { validateSync } from "class-validator";
import { PricingEngineService } from "../pricing-engine";
import { CreateAdditionalServiceFiscalProfileDto } from "./dto";
import {
  AdditionalServiceFiscalProfileRecord,
  AdditionalServicesRepository,
} from "./repositories";
import { AdditionalServicesService } from "./additional-services.service";

describe("AdditionalServicesService fiscal profiles", () => {
  const tenantId = "tenant-1";
  const catalogId = "catalog-1";
  const profileId = "fiscal-1";
  const catalog = { id: catalogId, tenantId, code: "TOUR", name: "Tour", isActive: true };
  const profile: AdditionalServiceFiscalProfileRecord = {
    id: profileId,
    tenantId,
    additionalServiceCatalogId: catalogId,
    cabysCode: "1234567890123",
    unitOfMeasureCode: "Sp",
    taxCode: "01",
    taxRateCode: "08",
    taxPercentage: "13.0000",
    isActive: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  let repository: jest.Mocked<AdditionalServicesRepository>;
  let service: AdditionalServicesService;

  beforeEach(() => {
    repository = {
      executeInTransaction: jest.fn(), findTenantById: jest.fn(), findAllTenantIds: jest.fn(),
      findTravelPackageById: jest.fn(), findInternalBookingById: jest.fn(),
      findParticipantsByIds: jest.fn(), findTravelParticipants: jest.fn(), create: jest.fn(),
      findById: jest.fn(), updateOrderDelivery: jest.fn(), findByIdempotencyKey: jest.fn(),
      findByTravel: jest.fn(), findOrderDashboardPage: jest.fn(),
      findAdditionalServiceCatalogById: jest.fn(),
      findAdditionalServiceCatalogByTenantAndId: jest.fn(),
      findAdditionalServiceCatalogByCode: jest.fn(), findAdditionalServiceCatalogsByCodes: jest.fn(),
      findAdditionalServiceCatalogs: jest.fn(), findAdditionalServiceCatalogCodes: jest.fn(),
      createAdditionalServiceCatalogItems: jest.fn(), findPricingConfigurations: jest.fn(),
      findPricingConfigurationById: jest.fn(), findPricingConfigurationByCatalogId: jest.fn(),
      findPricingConfigurationsByCatalogIds: jest.fn(), createPricingConfiguration: jest.fn(),
      updatePricingConfiguration: jest.fn(), findFiscalProfileById: jest.fn(),
      findFiscalProfileByCatalogId: jest.fn(), createFiscalProfile: jest.fn(),
      updateFiscalProfile: jest.fn(), findSuppliers: jest.fn(), findSupplierById: jest.fn(),
      findSuppliersByIds: jest.fn(), findSupplierByName: jest.fn(), createSupplier: jest.fn(),
      updateSupplier: jest.fn(),
    };
    service = new AdditionalServicesService(
      repository,
      { calculate: jest.fn() } as unknown as PricingEngineService,
    );
  });

  const catalogRecord = (fiscalProfile: any) => ({
    ...catalog,
    pricingConfiguration: null,
    fiscalProfile,
  });

  it.each([
    [null, "ABSENT", false],
    [{ ...profile, tenantId: undefined, additionalServiceCatalogId: undefined, createdAt: undefined, updatedAt: undefined }, "INACTIVE", false],
    [{ ...profile, tenantId: undefined, additionalServiceCatalogId: undefined, createdAt: undefined, updatedAt: undefined, isActive: true }, "READY", true],
    [{ ...profile, tenantId: undefined, additionalServiceCatalogId: undefined, createdAt: undefined, updatedAt: undefined, isActive: true, taxRateCode: null }, "INVALID", false],
  ])("derives catalog readiness %s as %s", async (fiscalProfile, status, isReady) => {
    repository.findAdditionalServiceCatalogs.mockResolvedValue([catalogRecord(fiscalProfile)]);
    const [result] = await service.listAdditionalServiceCatalog(tenantId);
    expect(result.fiscalReadiness.status).toBe(status);
    expect(result.fiscalReadiness.isReady).toBe(isReady);
    expect(repository.findFiscalProfileById).not.toHaveBeenCalled();
  });

  it("creates a tenant-owned inactive profile with decimal strings", async () => {
    repository.findAdditionalServiceCatalogByTenantAndId.mockResolvedValue(catalog);
    repository.findFiscalProfileByCatalogId.mockResolvedValue(null);
    repository.createFiscalProfile.mockResolvedValue(profile);
    await expect(service.createFiscalProfile(tenantId, {
      additionalServiceCatalogId: catalogId,
      cabysCode: "1234567890123",
      unitOfMeasureCode: " Sp ",
      taxCode: "01",
      taxRateCode: "08",
      taxPercentage: "0",
    })).resolves.toBe(profile);
    expect(repository.createFiscalProfile).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, unitOfMeasureCode: "Sp", taxPercentage: "0", isActive: false }),
    );
    expect(repository.createPricingConfiguration).not.toHaveBeenCalled();
    expect(repository.updatePricingConfiguration).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing or cross-tenant catalog", async () => {
    repository.findAdditionalServiceCatalogByTenantAndId.mockResolvedValue(null);
    await expect(service.createFiscalProfile(tenantId, {
      additionalServiceCatalogId: catalogId, cabysCode: "1234567890123", unitOfMeasureCode: "Sp",
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns 409 for pre-checked and concurrent duplicates", async () => {
    repository.findAdditionalServiceCatalogByTenantAndId.mockResolvedValue(catalog);
    repository.findFiscalProfileByCatalogId.mockResolvedValueOnce(profile).mockResolvedValueOnce(null);
    const input = { additionalServiceCatalogId: catalogId, cabysCode: "1234567890123", unitOfMeasureCode: "Sp" };
    await expect(service.createFiscalProfile(tenantId, input)).rejects.toBeInstanceOf(ConflictException);
    repository.createFiscalProfile.mockRejectedValue({ code: "P2002" });
    await expect(service.createFiscalProfile(tenantId, input)).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects a partial tuple and activation of an incomplete profile", async () => {
    repository.findAdditionalServiceCatalogByTenantAndId.mockResolvedValue(catalog);
    repository.findFiscalProfileByCatalogId.mockResolvedValue(null);
    await expect(service.createFiscalProfile(tenantId, {
      additionalServiceCatalogId: catalogId, cabysCode: "1234567890123", unitOfMeasureCode: "Sp", taxCode: "01",
    })).rejects.toBeInstanceOf(BadRequestException);
    repository.findFiscalProfileById.mockResolvedValue({ ...profile, taxCode: null, taxRateCode: null, taxPercentage: null });
    await expect(service.updateFiscalProfileStatus(tenantId, profileId, true)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("validates the merged state when an active profile is updated", async () => {
    repository.findFiscalProfileById.mockResolvedValue({ ...profile, isActive: true });
    await expect(service.updateFiscalProfile(tenantId, profileId, { taxCode: null })).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.updateFiscalProfile).not.toHaveBeenCalled();
  });

  it("deactivates idempotently and preserves fiscal values", async () => {
    repository.findFiscalProfileById.mockResolvedValue(profile);
    repository.updateFiscalProfile.mockResolvedValue(profile);
    await service.updateFiscalProfileStatus(tenantId, profileId, false);
    await service.updateFiscalProfileStatus(tenantId, profileId, false);
    expect(repository.updateFiscalProfile).toHaveBeenNthCalledWith(1, tenantId, profileId, { isActive: false });
    expect(repository.updateFiscalProfile).toHaveBeenNthCalledWith(2, tenantId, profileId, { isActive: false });
  });

  it.each([
    ["123", "Sp", "CABYS", undefined],
    ["1234567890123", "   ", "unit", undefined],
    ["1234567890123", "Sp", "decimal", "1000"],
    ["1234567890123", "Sp", "decimal", "1.00000"],
  ] as Array<[string, string, string, string | undefined]>) (
    "DTO rejects invalid %s / %s %s",
    (cabysCode, unitOfMeasureCode, _label, taxPercentage) => {
    const dto = Object.assign(new CreateAdditionalServiceFiscalProfileDto(), {
      additionalServiceCatalogId: catalogId,
      cabysCode,
      unitOfMeasureCode,
      ...(taxPercentage ? { taxPercentage } : {}),
    });
    expect(validateSync(dto).length).toBeGreaterThan(0);
    },
  );
});
