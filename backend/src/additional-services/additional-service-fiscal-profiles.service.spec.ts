import { ConflictException, ValidationPipe } from "@nestjs/common";
import { PricingEngineService } from "../pricing-engine";
import { FiscalCatalogService } from "../fiscal-catalogs/fiscal-catalog.service";
import { CreateAdditionalServiceFiscalProfileDto, UpdateAdditionalServiceFiscalProfileDto } from "./dto";
import { AdditionalServicesService } from "./additional-services.service";
import { AdditionalServiceFiscalProfileRecord, AdditionalServicesRepository } from "./repositories";
import { AdditionalServiceMarginType } from "./enums";

describe("AdditionalServicesService authoritative fiscal profiles", () => {
  const tenantId = "tenant-1"; const catalogId = "catalog-1"; const profileId = "profile-1";
  const authoritative = { cabysCode: "1234567890123", unitOfMeasureCode: "Sp", taxCode: "01", taxRateCode: "08", taxPercentage: "13.0000" };
  const profile: AdditionalServiceFiscalProfileRecord = { id: profileId, tenantId, additionalServiceCatalogId: catalogId, ...authoritative, isActive: false, createdAt: new Date(), updatedAt: new Date() };
  const pricing = { id: "pricing", tenantId, additionalServiceCatalogId: catalogId, marginType: AdditionalServiceMarginType.FIXED, marginValue: "1", taxPercentage: "1", isActive: true, createdAt: new Date(), updatedAt: new Date(), additionalServiceCatalog: { id: catalogId, tenantId, code: "TOUR", name: "Tour", isActive: true } };
  let repository: jest.Mocked<AdditionalServicesRepository>;
  let fiscal: jest.Mocked<Pick<FiscalCatalogService, "resolveFiscalSelection" | "evaluateFiscalProfiles">>;
  let service: AdditionalServicesService;

  beforeEach(() => {
    const partial: Partial<jest.Mocked<AdditionalServicesRepository>> = {
      findAdditionalServiceCatalogByTenantAndId: jest.fn().mockResolvedValue({ id: catalogId, tenantId, code: "TOUR", name: "Tour", isActive: true }),
      findFiscalProfileByCatalogId: jest.fn().mockResolvedValue(null), findFiscalProfileById: jest.fn(), createFiscalProfile: jest.fn().mockResolvedValue(profile), updateFiscalProfile: jest.fn().mockResolvedValue(profile),
      findPricingConfigurationByCatalogId: jest.fn(), updatePricingConfiguration: jest.fn(), executeInTransaction: jest.fn(),
    };
    repository = partial as jest.Mocked<AdditionalServicesRepository>;
    repository.executeInTransaction.mockImplementation((work) => work(repository));
    fiscal = { resolveFiscalSelection: jest.fn().mockResolvedValue(authoritative), evaluateFiscalProfiles: jest.fn() };
    service = new AdditionalServicesService(repository, { calculate: jest.fn() } as unknown as PricingEngineService, fiscal as unknown as FiscalCatalogService);
  });

  it("confirms exact CABYS and derives percentage when creating inactive", async () => {
    await service.createFiscalProfile(tenantId, { additionalServiceCatalogId: catalogId, cabysCode: authoritative.cabysCode, unitOfMeasureCode: "Sp", taxCode: "01", taxRateCode: "08" });
    expect(fiscal.resolveFiscalSelection).toHaveBeenCalledWith(tenantId, expect.objectContaining({ cabysCode: authoritative.cabysCode, taxRateCode: "08" }), true);
    expect(repository.createFiscalProfile).toHaveBeenCalledWith(expect.objectContaining({ ...authoritative, isActive: false }));
    expect(repository.updatePricingConfiguration).not.toHaveBeenCalled();
  });

  it("preserves distinct zero-rate identity and treats CABYS reference mismatch as nonblocking", async () => {
    fiscal.resolveFiscalSelection.mockResolvedValue({ ...authoritative, taxRateCode: "11", taxPercentage: "0.0000" });
    await service.createFiscalProfile(tenantId, { additionalServiceCatalogId: catalogId, cabysCode: authoritative.cabysCode, unitOfMeasureCode: "Sp", taxCode: "01", taxRateCode: "11" });
    expect(repository.createFiscalProfile).toHaveBeenCalledWith(expect.objectContaining({ taxRateCode: "11", taxPercentage: "0.0000" }));
  });

  it("keeps duplicate handling", async () => {
    repository.findFiscalProfileByCatalogId.mockResolvedValueOnce(profile);
    await expect(service.createFiscalProfile(tenantId, { additionalServiceCatalogId: catalogId, cabysCode: authoritative.cabysCode, unitOfMeasureCode: "Sp", taxCode: "01", taxRateCode: "08" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("updates an active profile and pricing atomically with the same percentage", async () => {
    repository.findFiscalProfileById.mockResolvedValue({ ...profile, isActive: true }); repository.findPricingConfigurationByCatalogId.mockResolvedValue(pricing);
    await service.updateFiscalProfile(tenantId, profileId, { taxRateCode: "08" });
    expect(repository.executeInTransaction).toHaveBeenCalledTimes(1);
    expect(repository.updateFiscalProfile).toHaveBeenCalledWith(tenantId, profileId, expect.objectContaining({ taxPercentage: "13.0000" }));
    expect(repository.updatePricingConfiguration).toHaveBeenCalledWith(tenantId, "pricing", { taxPercentage: "13.0000" });
  });

  it("activates without pricing and does not invent a pricing configuration", async () => {
    repository.findFiscalProfileById.mockResolvedValue(profile); repository.findPricingConfigurationByCatalogId.mockResolvedValueOnce(null);
    await service.updateFiscalProfileStatus(tenantId, profileId, true);
    expect(repository.updateFiscalProfile).toHaveBeenCalledWith(tenantId, profileId, expect.objectContaining({ isActive: true, taxPercentage: "13.0000" }));
    expect(repository.updatePricingConfiguration).not.toHaveBeenCalled();
    expect(repository.executeInTransaction).not.toHaveBeenCalled();
  });

  it("synchronizes existing pricing transactionally during activation", async () => {
    repository.findFiscalProfileById.mockResolvedValue(profile); repository.findPricingConfigurationByCatalogId.mockResolvedValue(pricing);
    await service.updateFiscalProfileStatus(tenantId, profileId, true);
    expect(repository.executeInTransaction).toHaveBeenCalledTimes(1);
    expect(repository.updateFiscalProfile).toHaveBeenCalledWith(tenantId, profileId, expect.objectContaining({ isActive: true, taxPercentage: "13.0000" }));
    expect(repository.updatePricingConfiguration).toHaveBeenCalledWith(tenantId, "pricing", { taxPercentage: "13.0000" });
  });

  it("updates an active fiscal profile without creating pricing when none exists", async () => {
    repository.findFiscalProfileById.mockResolvedValue({ ...profile, isActive: true });
    repository.findPricingConfigurationByCatalogId.mockResolvedValue(null);
    await service.updateFiscalProfile(tenantId, profileId, { taxRateCode: "08" });
    expect(repository.updateFiscalProfile).toHaveBeenCalledWith(tenantId, profileId, expect.objectContaining({ taxPercentage: "13.0000" }));
    expect(repository.updatePricingConfiguration).not.toHaveBeenCalled();
    expect(repository.executeInTransaction).not.toHaveBeenCalled();
  });

  it("propagates pricing failure so the transaction can roll back", async () => {
    repository.findFiscalProfileById.mockResolvedValue(profile); repository.findPricingConfigurationByCatalogId.mockResolvedValue(pricing); repository.updatePricingConfiguration.mockRejectedValue(new Error("pricing failed"));
    await expect(service.updateFiscalProfileStatus(tenantId, profileId, true)).rejects.toThrow("pricing failed"); expect(repository.executeInTransaction).toHaveBeenCalledTimes(1);
  });

  it("deactivates without changing pricing or fiscal values", async () => {
    repository.findFiscalProfileById.mockResolvedValue({ ...profile, isActive: true }); await service.updateFiscalProfileStatus(tenantId, profileId, false);
    expect(repository.updateFiscalProfile).toHaveBeenCalledWith(tenantId, profileId, { isActive: false }); expect(repository.updatePricingConfiguration).not.toHaveBeenCalled();
  });

  it("rejects taxPercentage and unknown fiscal input through the global validation contract", async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    await expect(pipe.transform({ additionalServiceCatalogId: catalogId, ...authoritative, taxPercentage: "7.0000" }, { type: "body", metatype: CreateAdditionalServiceFiscalProfileDto })).rejects.toBeDefined();
    await expect(pipe.transform({ taxPercentage: "7.0000" }, { type: "body", metatype: UpdateAdditionalServiceFiscalProfileDto })).rejects.toBeDefined();
  });
});
