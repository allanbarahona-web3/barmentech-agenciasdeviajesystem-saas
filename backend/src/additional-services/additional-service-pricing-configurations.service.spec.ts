import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { FiscalCatalogService } from "../fiscal-catalogs/fiscal-catalog.service";
import { PricingEngineService } from "../pricing-engine";
import { AdditionalServiceMarginType } from "./enums";
import { AdditionalServicesService } from "./additional-services.service";
import { CreateAdditionalServicePricingConfigurationDto, UpdateAdditionalServicePricingConfigurationDto } from "./dto";
import { AdditionalServiceFiscalProfileRecord, AdditionalServicePricingConfigurationRecord, AdditionalServicesRepository } from "./repositories";

describe("AdditionalServicesService authoritative pricing", () => {
  const tenantId = "tenant"; const catalogId = "catalog"; const pricingId = "pricing";
  const catalog = { id: catalogId, tenantId, code: "TOUR", name: "Tour", isActive: true };
  const profile: AdditionalServiceFiscalProfileRecord = { id: "profile", tenantId, additionalServiceCatalogId: catalogId, cabysCode: "1234567890123", unitOfMeasureCode: "Sp", taxCode: "01", taxRateCode: "08", taxPercentage: "13.0000", isActive: true, createdAt: new Date(), updatedAt: new Date() };
  const pricing: AdditionalServicePricingConfigurationRecord = { id: pricingId, tenantId, additionalServiceCatalogId: catalogId, marginType: AdditionalServiceMarginType.PERCENTAGE, marginValue: "15", taxPercentage: "13.0000", isActive: true, createdAt: new Date(), updatedAt: new Date(), additionalServiceCatalog: catalog };
  let repository: jest.Mocked<AdditionalServicesRepository>; let fiscal: { resolveFiscalSelection: jest.Mock }; let service: AdditionalServicesService;

  beforeEach(() => {
    const partial: Partial<jest.Mocked<AdditionalServicesRepository>> = { findAdditionalServiceCatalogById: jest.fn().mockResolvedValue(catalog), findPricingConfigurationByCatalogId: jest.fn().mockResolvedValue(null), findPricingConfigurationById: jest.fn(), createPricingConfiguration: jest.fn().mockResolvedValue(pricing), updatePricingConfiguration: jest.fn().mockResolvedValue(pricing), findFiscalProfileByCatalogId: jest.fn().mockResolvedValue(profile) };
    repository = partial as jest.Mocked<AdditionalServicesRepository>; fiscal = { resolveFiscalSelection: jest.fn().mockResolvedValue({ cabysCode: profile.cabysCode, unitOfMeasureCode: "Sp", taxCode: "01", taxRateCode: "08", taxPercentage: "13.0000" }) };
    service = new AdditionalServicesService(repository, { calculate: jest.fn() } as unknown as PricingEngineService, fiscal as unknown as FiscalCatalogService);
  });

  it("creates requested inactive pricing after fiscal activation using the exact authoritative percentage", async () => {
    await service.createPricingConfiguration(tenantId, { additionalServiceCatalogId: catalogId, marginType: AdditionalServiceMarginType.PERCENTAGE, marginValue: 15, isActive: false });
    expect(repository.createPricingConfiguration).toHaveBeenCalledWith(expect.objectContaining({ taxPercentage: "13.0000", isActive: false })); expect(fiscal.resolveFiscalSelection).toHaveBeenCalledWith(tenantId, expect.any(Object), false);
  });

  it("rejects create without active fiscal profile", async () => {
    repository.findFiscalProfileByCatalogId.mockResolvedValue({ ...profile, isActive: false });
    await expect(service.createPricingConfiguration(tenantId, { additionalServiceCatalogId: catalogId, marginType: AdditionalServiceMarginType.FIXED, marginValue: 1 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("re-synchronizes authoritative percentage during margin update", async () => {
    repository.findPricingConfigurationById.mockResolvedValue(pricing);
    await service.updatePricingConfiguration(tenantId, pricingId, { marginValue: 20 });
    expect(repository.updatePricingConfiguration).toHaveBeenCalledWith(tenantId, pricingId, { marginValue: 20, taxPercentage: "13.0000" });
  });

  it("requires readiness for activation but permits deactivation", async () => {
    repository.findPricingConfigurationById.mockResolvedValue(pricing); repository.findFiscalProfileByCatalogId.mockResolvedValue({ ...profile, isActive: false });
    await expect(service.updatePricingConfigurationStatus(tenantId, pricingId, true)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updatePricingConfigurationStatus(tenantId, pricingId, false)).resolves.toBe(pricing);
    expect(repository.updatePricingConfiguration).toHaveBeenLastCalledWith(tenantId, pricingId, { isActive: false });
  });

  it("activates pricing after authoritative fiscal readiness and re-synchronizes percentage", async () => {
    repository.findPricingConfigurationById.mockResolvedValue({ ...pricing, isActive: false });
    await service.updatePricingConfigurationStatus(tenantId, pricingId, true);
    expect(repository.updatePricingConfiguration).toHaveBeenCalledWith(tenantId, pricingId, { isActive: true, taxPercentage: "13.0000" });
  });

  it("rejects caller taxPercentage in create and update DTOs", async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    await expect(pipe.transform({ additionalServiceCatalogId: catalogId, marginType: "FIXED", marginValue: 1, taxPercentage: 99 }, { type: "body", metatype: CreateAdditionalServicePricingConfigurationDto })).rejects.toBeDefined();
    await expect(pipe.transform({ marginValue: 1, taxPercentage: 99 }, { type: "body", metatype: UpdateAdditionalServicePricingConfigurationDto })).rejects.toBeDefined();
  });
});
