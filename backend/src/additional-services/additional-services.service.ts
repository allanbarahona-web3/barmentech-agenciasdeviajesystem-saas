import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { PricingEngineService } from "../pricing-engine";
import {
  AdditionalServiceOrderDashboardResponseDto,
  CreateAdditionalServiceOrderDto,
  CreateAdditionalServicePricingConfigurationDto,
  CreateAdditionalServiceFiscalProfileDto,
  CreateSupplierDto,
  ListAdditionalServicePricingConfigurationsDto,
  ListAdditionalServiceOrdersDto,
  UpdateAdditionalServicePricingConfigurationDto,
  UpdateAdditionalServiceFiscalProfileDto,
  UpdateSupplierDto,
} from "./dto";
import { DateUtils } from "../common/utils/date.utils";
import {
  ADDITIONAL_SERVICES_REPOSITORY,
  AdditionalServiceOrderRecord,
  AdditionalServiceParticipantRecord,
  AdditionalServicePricingConfigurationRecord,
  AdditionalServiceFiscalProfileRecord,
  AdditionalServicesRepository,
  CreateAdditionalServiceOrderData,
  CreateAdditionalServiceOrderLineData,
  SupplierRecord,
  UpdateSupplierData,
} from "./repositories";
import { normalizeAdditionalServiceDetails } from "./service-details";
import { PaymentConditionType } from "./enums";
import { FiscalCatalogService } from "../fiscal-catalogs/fiscal-catalog.service";

export interface AdditionalServiceOrderActor {
  id: string;
  fullName: string;
}

export interface AdditionalServiceCatalogAdminItem {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  pricingConfiguration: {
    id: string;
    marginType: AdditionalServicePricingConfigurationRecord["marginType"];
    marginValue: string;
    taxPercentage: string;
    isActive: boolean;
  } | null;
  fiscalProfile: {
    id: string;
    cabysCode: string;
    unitOfMeasureCode: string;
    taxCode: string | null;
    taxRateCode: string | null;
    taxPercentage: string | null;
    isActive: boolean;
  } | null;
  fiscalReadiness: AdditionalServiceFiscalReadiness;
}

export type AdditionalServiceFiscalReadinessStatus =
  | "ABSENT"
  | "INACTIVE"
  | "READY"
  | "INVALID";

export interface AdditionalServiceFiscalReadiness {
  status: AdditionalServiceFiscalReadinessStatus;
  isReady: boolean;
  issues: string[];
}

export interface SupplierListFilters {
  activeOnly?: boolean;
  travelType?: "INTERNATIONAL" | "INTERNAL";
}

@Injectable()
export class AdditionalServicesService {
  private readonly logger = new Logger(AdditionalServicesService.name);
  private readonly maxOrderNumberAttempts = 6;

  constructor(
    @Inject(ADDITIONAL_SERVICES_REPOSITORY)
    private readonly repository: AdditionalServicesRepository,
    private readonly pricingEngine: PricingEngineService,
    @Optional() private readonly fiscalCatalogService?: FiscalCatalogService,
  ) {}

  private fiscalCatalog(): FiscalCatalogService {
    if (!this.fiscalCatalogService) throw new Error("FiscalCatalogService is required for fiscal operations");
    return this.fiscalCatalogService;
  }

  async listAdditionalServiceCatalog(
    tenantId: string,
  ): Promise<AdditionalServiceCatalogAdminItem[]> {
    const catalog =
      await this.repository.findAdditionalServiceCatalogs(tenantId);

    const profiles = catalog.flatMap((item) => item.fiscalProfile ? [{ ...item.fiscalProfile, tenantId, additionalServiceCatalogId: item.id, createdAt: new Date(0), updatedAt: new Date(0) }] : []);
    const readiness = await this.fiscalCatalog().evaluateFiscalProfiles(tenantId, profiles);

    return catalog.map(
      ({ id, code, name, isActive, pricingConfiguration, fiscalProfile }) => ({
        id,
        code,
        name,
        isActive,
        pricingConfiguration,
        fiscalProfile,
        fiscalReadiness: fiscalProfile ? readiness.get(id) ?? { status: "INVALID", isReady: false, issues: ["FISCAL_CATALOG_NOT_READY"] } : { status: "ABSENT", isReady: false, issues: [] },
      }),
    );
  }

  listPricingConfigurations(
    tenantId: string,
    filters: ListAdditionalServicePricingConfigurationsDto,
  ): Promise<AdditionalServicePricingConfigurationRecord[]> {
    return this.repository.findPricingConfigurations(tenantId, {
      additionalServiceCatalogId: filters.additionalServiceCatalogId,
      ...(filters.isActive && filters.isActive !== "all"
        ? { isActive: filters.isActive === "true" }
        : {}),
    });
  }

  async getPricingConfiguration(
    tenantId: string,
    configurationId: string,
  ): Promise<AdditionalServicePricingConfigurationRecord> {
    const configuration =
      await this.repository.findPricingConfigurationById(
        tenantId,
        configurationId,
      );

    if (!configuration) {
      throw new NotFoundException(
        "Configuración de precios no encontrada.",
      );
    }

    return configuration;
  }

  async createPricingConfiguration(
    tenantId: string,
    dto: CreateAdditionalServicePricingConfigurationDto,
  ): Promise<AdditionalServicePricingConfigurationRecord> {
    await this.validatePricingValues(dto.marginValue);
    await this.validateCatalogOwnership(
      tenantId,
      dto.additionalServiceCatalogId,
    );

    const existing =
      await this.repository.findPricingConfigurationByCatalogId(
        tenantId,
        dto.additionalServiceCatalogId,
      );

    if (existing) {
      throw new ConflictException(
        "Ya existe una configuración de precios para este servicio adicional.",
      );
    }

    const profile = await this.repository.findFiscalProfileByCatalogId(tenantId, dto.additionalServiceCatalogId);
    if (!profile?.isActive || !profile.taxCode || !profile.taxRateCode) throw new BadRequestException({ code: "ADDITIONAL_SERVICE_NOT_FISCALLY_READY" });
    const authoritative = await this.fiscalCatalog().resolveFiscalSelection(tenantId, { cabysCode: profile.cabysCode, unitOfMeasureCode: profile.unitOfMeasureCode, taxCode: profile.taxCode, taxRateCode: profile.taxRateCode }, false);

    try {
      return await this.repository.createPricingConfiguration({
        tenantId,
        additionalServiceCatalogId: dto.additionalServiceCatalogId,
        marginType: dto.marginType,
        marginValue: dto.marginValue,
        taxPercentage: authoritative.taxPercentage,
        isActive: dto.isActive ?? true,
      });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          "Ya existe una configuración de precios para este servicio adicional.",
        );
      }

      throw error;
    }
  }

  async updatePricingConfiguration(
    tenantId: string,
    configurationId: string,
    dto: UpdateAdditionalServicePricingConfigurationDto,
  ): Promise<AdditionalServicePricingConfigurationRecord> {
    const configuration = await this.getPricingConfiguration(tenantId, configurationId);
    await this.validatePricingValues(dto.marginValue);
    const profile = await this.repository.findFiscalProfileByCatalogId(tenantId, configuration.additionalServiceCatalogId);
    if (!profile?.isActive || !profile.taxCode || !profile.taxRateCode) throw new BadRequestException({ code: "ADDITIONAL_SERVICE_NOT_FISCALLY_READY" });
    const authoritative = await this.fiscalCatalog().resolveFiscalSelection(tenantId, { cabysCode: profile.cabysCode, unitOfMeasureCode: profile.unitOfMeasureCode, taxCode: profile.taxCode, taxRateCode: profile.taxRateCode }, false);

    return this.repository.updatePricingConfiguration(
      tenantId,
      configurationId,
      { ...dto, taxPercentage: authoritative.taxPercentage },
    );
  }

  async updatePricingConfigurationStatus(
    tenantId: string,
    configurationId: string,
    isActive: boolean,
  ): Promise<AdditionalServicePricingConfigurationRecord> {
    const configuration = await this.getPricingConfiguration(tenantId, configurationId);

    if (isActive) {
      const profile = await this.repository.findFiscalProfileByCatalogId(tenantId, configuration.additionalServiceCatalogId);
      if (!profile?.isActive || !profile.taxCode || !profile.taxRateCode) throw new BadRequestException({ code: "ADDITIONAL_SERVICE_NOT_FISCALLY_READY" });
      const authoritative = await this.fiscalCatalog().resolveFiscalSelection(tenantId, { cabysCode: profile.cabysCode, unitOfMeasureCode: profile.unitOfMeasureCode, taxCode: profile.taxCode, taxRateCode: profile.taxRateCode }, false);
      return this.repository.updatePricingConfiguration(tenantId, configurationId, { isActive, taxPercentage: authoritative.taxPercentage });
    }

    return this.repository.updatePricingConfiguration(
      tenantId,
      configurationId,
      { isActive },
    );
  }

  async createFiscalProfile(
    tenantId: string,
    dto: CreateAdditionalServiceFiscalProfileDto,
  ): Promise<AdditionalServiceFiscalProfileRecord> {
    const catalogId = dto.additionalServiceCatalogId.trim();
    await this.validateTenantCatalogExists(tenantId, catalogId);

    const existing = await this.repository.findFiscalProfileByCatalogId(
      tenantId,
      catalogId,
    );
    if (existing) {
      throw new ConflictException(
        "Ya existe un perfil fiscal para este servicio adicional.",
      );
    }

    const data = await this.fiscalCatalog().resolveFiscalSelection(tenantId, { cabysCode: dto.cabysCode.trim(), unitOfMeasureCode: dto.unitOfMeasureCode.trim(), taxCode: dto.taxCode.trim(), taxRateCode: dto.taxRateCode.trim() }, true);

    try {
      const create = (repository: AdditionalServicesRepository) => repository.createFiscalProfile({
        tenantId,
        additionalServiceCatalogId: catalogId,
        ...data,
        isActive: dto.isActive ?? false,
      });
      if (!(dto.isActive ?? false)) return await create(this.repository);
      const pricing = await this.repository.findPricingConfigurationByCatalogId(tenantId, catalogId);
      if (!pricing) return await create(this.repository);
      return await this.repository.executeInTransaction(async (repository) => {
        const created = await create(repository);
        await repository.updatePricingConfiguration(tenantId, pricing.id, { taxPercentage: data.taxPercentage });
        return created;
      });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          "Ya existe un perfil fiscal para este servicio adicional.",
        );
      }
      throw error;
    }
  }

  async updateFiscalProfile(
    tenantId: string,
    profileId: string,
    dto: UpdateAdditionalServiceFiscalProfileDto,
  ): Promise<AdditionalServiceFiscalProfileRecord> {
    const existing = await this.getFiscalProfile(tenantId, profileId);
    const changes = this.normalizeFiscalUpdate(dto);
    const merged = {
      cabysCode: changes.cabysCode ?? existing.cabysCode,
      unitOfMeasureCode:
        changes.unitOfMeasureCode ?? existing.unitOfMeasureCode,
      taxCode: changes.taxCode !== undefined ? changes.taxCode : existing.taxCode,
      taxRateCode:
        changes.taxRateCode !== undefined
          ? changes.taxRateCode
          : existing.taxRateCode,
      taxPercentage: existing.taxPercentage,
    };
    if (!merged.taxCode || !merged.taxRateCode) throw new BadRequestException({ code: "FISCAL_CATALOG_ENTRY_NOT_FOUND" });
    const authoritative = await this.fiscalCatalog().resolveFiscalSelection(tenantId, { cabysCode: merged.cabysCode, unitOfMeasureCode: merged.unitOfMeasureCode, taxCode: merged.taxCode, taxRateCode: merged.taxRateCode }, changes.cabysCode !== undefined && changes.cabysCode !== existing.cabysCode);
    const update = { ...changes, ...authoritative };
    if (!existing.isActive) return this.repository.updateFiscalProfile(tenantId, profileId, update);
    const pricing = await this.repository.findPricingConfigurationByCatalogId(tenantId, existing.additionalServiceCatalogId);
    if (!pricing) return this.repository.updateFiscalProfile(tenantId, profileId, update);
    return this.repository.executeInTransaction(async (repository) => {
      const profile = await repository.updateFiscalProfile(tenantId, profileId, update);
      await repository.updatePricingConfiguration(tenantId, pricing.id, { taxPercentage: authoritative.taxPercentage });
      return profile;
    });
  }

  async updateFiscalProfileStatus(
    tenantId: string,
    profileId: string,
    isActive: boolean,
  ): Promise<AdditionalServiceFiscalProfileRecord> {
    const existing = await this.getFiscalProfile(tenantId, profileId);
    if (!isActive) return this.repository.updateFiscalProfile(tenantId, profileId, { isActive: false });
    if (!existing.taxCode || !existing.taxRateCode) throw new BadRequestException({ code: "FISCAL_CATALOG_ENTRY_NOT_FOUND" });
    const authoritative = await this.fiscalCatalog().resolveFiscalSelection(tenantId, { cabysCode: existing.cabysCode, unitOfMeasureCode: existing.unitOfMeasureCode, taxCode: existing.taxCode, taxRateCode: existing.taxRateCode }, false);
    const pricing = await this.repository.findPricingConfigurationByCatalogId(tenantId, existing.additionalServiceCatalogId);
    if (!pricing) return this.repository.updateFiscalProfile(tenantId, profileId, { ...authoritative, isActive: true });
    return this.repository.executeInTransaction(async (repository) => {
      const profile = await repository.updateFiscalProfile(tenantId, profileId, { ...authoritative, isActive: true });
      await repository.updatePricingConfiguration(tenantId, pricing.id, { taxPercentage: authoritative.taxPercentage });
      return profile;
    });
  }

  async listSuppliers(
    tenantId: string,
    filters: SupplierListFilters = {},
  ): Promise<SupplierRecord[]> {
    const suppliers = await this.repository.findSuppliers(tenantId);
    const matchingSupplierTypes =
      filters.travelType === "INTERNATIONAL"
        ? new Set(["INTERNATIONAL"])
        : filters.travelType === "INTERNAL"
          ? new Set(["INTERNAL", "NATIONAL"])
          : null;

    return suppliers.filter(
      (supplier) =>
        (!filters.activeOnly || supplier.isActive) &&
        (!matchingSupplierTypes ||
          (supplier.supplierType !== null &&
            matchingSupplierTypes.has(
              supplier.supplierType.trim().toUpperCase(),
            ))),
    );
  }

  async getSupplier(
    tenantId: string,
    supplierId: string,
  ): Promise<SupplierRecord> {
    const supplier = await this.repository.findSupplierById(
      tenantId,
      supplierId,
    );

    if (!supplier) {
      throw new NotFoundException("Proveedor no encontrado.");
    }

    return supplier;
  }

  async createSupplier(
    tenantId: string,
    dto: CreateSupplierDto,
  ): Promise<SupplierRecord> {
    const name = this.normalizeSupplierName(dto.name);
    const duplicate = await this.repository.findSupplierByName(
      tenantId,
      name,
    );

    if (duplicate) {
      throw new ConflictException(
        "Ya existe un proveedor con este nombre.",
      );
    }

    try {
      return await this.repository.createSupplier({
        tenantId,
        name,
        website: this.toNullableText(dto.website),
        supplierType: this.toNullableText(dto.supplierType),
        supplierCategory: this.toNullableText(dto.supplierCategory),
        notes: this.toNullableText(dto.notes),
        isActive: dto.isActive ?? true,
      });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          "Ya existe un proveedor con este nombre.",
        );
      }

      throw error;
    }
  }

  async updateSupplier(
    tenantId: string,
    supplierId: string,
    dto: UpdateSupplierDto,
  ): Promise<SupplierRecord> {
    await this.getSupplier(tenantId, supplierId);

    const data: UpdateSupplierData = {};
    if (dto.name !== undefined) {
      const name = this.normalizeSupplierName(dto.name);
      const duplicate = await this.repository.findSupplierByName(
        tenantId,
        name,
        supplierId,
      );

      if (duplicate) {
        throw new ConflictException(
          "Ya existe un proveedor con este nombre.",
        );
      }
      data.name = name;
    }
    if (dto.website !== undefined) {
      data.website = this.toNullableText(dto.website);
    }
    if (dto.supplierType !== undefined) {
      data.supplierType = this.toNullableText(dto.supplierType);
    }
    if (dto.supplierCategory !== undefined) {
      data.supplierCategory = this.toNullableText(dto.supplierCategory);
    }
    if (dto.notes !== undefined) {
      data.notes = this.toNullableText(dto.notes);
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    try {
      return await this.repository.updateSupplier(
        tenantId,
        supplierId,
        data,
      );
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          "Ya existe un proveedor con este nombre.",
        );
      }

      throw error;
    }
  }

  async deleteSupplier(
    tenantId: string,
    supplierId: string,
  ): Promise<SupplierRecord> {
    await this.getSupplier(tenantId, supplierId);

    return this.repository.updateSupplier(tenantId, supplierId, {
      isActive: false,
    });
  }

  async getOrder(
    tenantId: string,
    orderId: string,
  ): Promise<AdditionalServiceOrderRecord> {
    const order = await this.repository.findById(tenantId, orderId);

    if (!order) {
      throw new NotFoundException(
        "Orden de servicios adicionales no encontrada.",
      );
    }

    return order;
  }

  async listOrderDashboard(
    tenantId: string,
    dto: ListAdditionalServiceOrdersDto,
  ): Promise<AdditionalServiceOrderDashboardResponseDto> {
    const createdFrom = dto.createdFrom
      ? DateUtils.getCostaRicaStartOfDay(dto.createdFrom)
      : undefined;
    const createdTo = dto.createdTo
      ? DateUtils.getCostaRicaEndOfDay(dto.createdTo)
      : undefined;

    if (createdFrom && createdTo && createdFrom > createdTo) {
      throw new BadRequestException(
        "La fecha inicial no puede ser posterior a la fecha final.",
      );
    }

    return this.repository.findOrderDashboardPage(tenantId, {
      page: dto.page ?? 1,
      pageSize: dto.pageSize ?? 20,
      search: this.toNullableText(dto.search) ?? undefined,
      travelId: this.toNullableText(dto.travelId) ?? undefined,
      travelNumber: this.toNullableText(dto.travelNumber) ?? undefined,
      travelType: dto.travelType,
      createdFrom,
      createdTo,
      status: dto.status,
    });
  }

  async createOrder(
    tenantId: string,
    actor: AdditionalServiceOrderActor,
    dto: CreateAdditionalServiceOrderDto,
  ): Promise<AdditionalServiceOrderRecord> {
    this.logger.debug("CREATE ORDER START");
    const idempotencyKey = dto.idempotencyKey.trim();
    const [tenant, existingOrder] = await Promise.all([
      this.repository.findTenantById(tenantId),
      this.repository.findByIdempotencyKey(tenantId, idempotencyKey),
    ]);
    if (!tenant) {
      throw new NotFoundException("Tenant no encontrado.");
    }
    if (existingOrder) {
      this.logger.debug("CREATE ORDER END");
      return existingOrder;
    }

    const travel = await this.validateTravelReference(
      this.repository,
      tenantId,
      dto,
    );
    const resolvedLines = await this.validateAndResolveLines(
      this.repository,
      tenantId,
      dto,
    );
    const { lines, participantIds } = resolvedLines;
    const quoteCustomerId = dto.quoteCustomerId.trim();
    const customerAndParticipantIds = [
      ...new Set([...participantIds, quoteCustomerId]),
    ];
    const [participants, travelParticipantRoles] = await Promise.all([
      this.validateParticipants(
        this.repository,
        tenantId,
        customerAndParticipantIds,
      ),
      this.validateTravelParticipants(
        this.repository,
        tenantId,
        travel,
        customerAndParticipantIds,
      ),
    ]);
    if (!travelParticipantRoles.has(quoteCustomerId)) {
      throw new BadRequestException(
        "El cliente de la cotización no pertenece al viaje seleccionado.",
      );
    }
    const participantById = new Map(
      participants.map((participant) => [
        participant.id,
        participant,
      ]),
    );
    const snapshotLines: CreateAdditionalServiceOrderLineData[] =
      lines.map(({ participantClientIds, ...line }) => ({
        ...line,
        participants: participantClientIds.map((clientId) => {
          const participant = participantById.get(clientId)!;
          return {
            clientId: participant.id,
            role: travelParticipantRoles.get(clientId)!,
            fullName: participant.fullName,
            identification: participant.idNumber,
            email: participant.email,
            phone: participant.phone,
          };
        }),
      }));

    for (
      let attempt = 1;
      attempt <= this.maxOrderNumberAttempts;
      attempt += 1
    ) {
      try {
        const order = await this.repository.executeInTransaction(
          async (repository) => {
            const existing = await repository.findByIdempotencyKey(
              tenantId,
              idempotencyKey,
            );
            if (existing) {
              return existing;
            }

            return repository.create(
              this.toCreateData(
                tenantId,
                actor,
                dto,
                travel,
                snapshotLines,
                this.buildOrderNumber(tenant.contractPrefix),
              ),
            );
          },
        );

        this.logger.log(
          `Additional service order created: ${order.orderNumber}`,
        );
        this.logger.debug("CREATE ORDER END");
        return order;
      } catch (error) {
        if (this.isIdempotencyCollision(error)) {
          const existing = await this.repository.findByIdempotencyKey(
            tenantId,
            dto.idempotencyKey.trim(),
          );
          if (existing) {
            this.logger.debug("CREATE ORDER END");
            return existing;
          }
        }

        if (
          this.isOrderNumberCollision(error) &&
          attempt < this.maxOrderNumberAttempts
        ) {
          this.logger.warn(
            `Additional service order number collision on attempt ${attempt}/${this.maxOrderNumberAttempts}. Retrying.`,
          );
          continue;
        }

        if (this.isOrderNumberCollision(error)) {
          throw new ConflictException(
            "No se pudo generar un número único para la orden de servicios adicionales.",
          );
        }

        throw error;
      }
    }

    throw new ConflictException(
      "No se pudo generar un número único para la orden de servicios adicionales.",
    );
  }

  private async validateCatalogOwnership(
    tenantId: string,
    additionalServiceCatalogId: string,
  ): Promise<void> {
    const catalog =
      await this.repository.findAdditionalServiceCatalogById(
        additionalServiceCatalogId,
      );

    if (!catalog) {
      throw new NotFoundException(
        "El servicio adicional seleccionado no existe.",
      );
    }

    if (catalog.tenantId !== tenantId) {
      throw new BadRequestException(
        "El servicio adicional seleccionado no pertenece al tenant actual.",
      );
    }
  }

  private async validateTenantCatalogExists(
    tenantId: string,
    additionalServiceCatalogId: string,
  ): Promise<void> {
    const catalog =
      await this.repository.findAdditionalServiceCatalogByTenantAndId(
        tenantId,
        additionalServiceCatalogId,
      );
    if (!catalog) {
      throw new NotFoundException(
        "El servicio adicional seleccionado no existe.",
      );
    }
  }

  private async getFiscalProfile(
    tenantId: string,
    profileId: string,
  ): Promise<AdditionalServiceFiscalProfileRecord> {
    const profile = await this.repository.findFiscalProfileById(
      tenantId,
      profileId,
    );
    if (!profile) {
      throw new NotFoundException("Perfil fiscal no encontrado.");
    }
    return profile;
  }

  private normalizeOptionalFiscalCode(value: string | null): string | null {
    return value === null ? null : value.trim();
  }

  private normalizeFiscalFields(fields: {
    cabysCode: string;
    unitOfMeasureCode: string;
    taxCode: string | null;
    taxRateCode: string | null;
    taxPercentage: string | null;
  }) {
    return {
      cabysCode: fields.cabysCode.trim(),
      unitOfMeasureCode: fields.unitOfMeasureCode.trim(),
      taxCode: this.normalizeOptionalFiscalCode(fields.taxCode),
      taxRateCode: this.normalizeOptionalFiscalCode(fields.taxRateCode),
      taxPercentage:
        fields.taxPercentage === null ? null : fields.taxPercentage.trim(),
    };
  }

  private normalizeFiscalUpdate(dto: UpdateAdditionalServiceFiscalProfileDto) {
    return {
      ...(dto.cabysCode !== undefined
        ? { cabysCode: dto.cabysCode.trim() }
        : {}),
      ...(dto.unitOfMeasureCode !== undefined
        ? { unitOfMeasureCode: dto.unitOfMeasureCode.trim() }
        : {}),
      ...(dto.taxCode !== undefined
        ? { taxCode: this.normalizeOptionalFiscalCode(dto.taxCode) }
        : {}),
      ...(dto.taxRateCode !== undefined
        ? { taxRateCode: this.normalizeOptionalFiscalCode(dto.taxRateCode) }
        : {}),
    };
  }

  private fiscalValidationIssues(
    profile: Pick<
      AdditionalServiceFiscalProfileRecord,
      | "cabysCode"
      | "unitOfMeasureCode"
      | "taxCode"
      | "taxRateCode"
      | "taxPercentage"
    >,
    requireTaxTuple: boolean,
  ): string[] {
    const issues: string[] = [];
    if (!/^\d{13}$/.test(profile.cabysCode)) issues.push("CABYS_INVALID");
    if (
      profile.unitOfMeasureCode.trim().length === 0 ||
      profile.unitOfMeasureCode.length > 20
    ) {
      issues.push("UNIT_OF_MEASURE_CODE_INVALID");
    }

    const supplied = [
      profile.taxCode !== null,
      profile.taxRateCode !== null,
      profile.taxPercentage !== null,
    ];
    const tuplePresent = supplied.every(Boolean);
    const tupleAbsent = supplied.every((value) => !value);
    if (!tuplePresent && !tupleAbsent) issues.push("TAX_TUPLE_INCOMPLETE");
    if ((!tupleAbsent || requireTaxTuple) && profile.taxCode === null) {
      issues.push("TAX_CODE_REQUIRED");
    }
    if ((!tupleAbsent || requireTaxTuple) && profile.taxRateCode === null) {
      issues.push("TAX_RATE_CODE_REQUIRED");
    }
    if ((!tupleAbsent || requireTaxTuple) && profile.taxPercentage === null) {
      issues.push("TAX_PERCENTAGE_REQUIRED");
    }
    if (profile.taxCode !== null && (profile.taxCode.trim().length === 0 || profile.taxCode.length > 4)) {
      issues.push("TAX_CODE_INVALID");
    }
    if (profile.taxRateCode !== null && (profile.taxRateCode.trim().length === 0 || profile.taxRateCode.length > 4)) {
      issues.push("TAX_RATE_CODE_INVALID");
    }
    if (
      profile.taxPercentage !== null &&
      !/^\d{1,3}(?:\.\d{1,4})?$/.test(profile.taxPercentage)
    ) {
      issues.push("TAX_PERCENTAGE_INVALID");
    }
    return issues;
  }

  private validateFiscalState(
    profile: Pick<
      AdditionalServiceFiscalProfileRecord,
      | "cabysCode"
      | "unitOfMeasureCode"
      | "taxCode"
      | "taxRateCode"
      | "taxPercentage"
    >,
    isActive: boolean,
  ): void {
    const issues = this.fiscalValidationIssues(profile, isActive);
    if (issues.length > 0) {
      throw new BadRequestException({
        message: "El perfil fiscal no es estructuralmente válido.",
        issues,
      });
    }
  }

  private deriveFiscalReadiness(
    profile: AdditionalServiceCatalogAdminItem["fiscalProfile"],
  ): AdditionalServiceFiscalReadiness {
    if (!profile) return { status: "ABSENT", isReady: false, issues: [] };
    const issues = this.fiscalValidationIssues(profile, profile.isActive);
    if (issues.length > 0) {
      return { status: "INVALID", isReady: false, issues };
    }
    return profile.isActive
      ? { status: "READY", isReady: true, issues: [] }
      : { status: "INACTIVE", isReady: false, issues: [] };
  }

  private async validatePricingValues(
    marginValue?: number,
  ): Promise<void> {
    if (
      marginValue !== undefined &&
      (!Number.isFinite(marginValue) || marginValue < 0)
    ) {
      throw new BadRequestException(
        "El valor del margen no puede ser negativo.",
      );
    }

  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    );
  }

  private toNullableText(value?: string | null): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private normalizeSupplierName(value: string): string {
    const name = value.trim();
    if (!name) {
      throw new BadRequestException(
        "El nombre del proveedor es requerido.",
      );
    }

    return name;
  }

  private async validateTravelReference(
    repository: AdditionalServicesRepository,
    tenantId: string,
    dto: CreateAdditionalServiceOrderDto,
  ): Promise<{
    travelPackageId?: string;
    internalBookingId?: string;
  }> {
    const travelId = dto.travelId.trim();
    const travel =
      dto.travelType === "INTERNATIONAL"
        ? await repository.findTravelPackageById(travelId)
        : await repository.findInternalBookingById(travelId);

    if (!travel) {
      throw new NotFoundException("El viaje referenciado no existe.");
    }

    if (travel.tenantId !== tenantId) {
      throw new BadRequestException(
        "El viaje referenciado no pertenece al tenant actual.",
      );
    }

    return dto.travelType === "INTERNATIONAL"
      ? { travelPackageId: travelId }
      : { internalBookingId: travelId };
  }

  private async validateAndResolveLines(
    repository: AdditionalServicesRepository,
    tenantId: string,
    dto: CreateAdditionalServiceOrderDto,
  ): Promise<{
    lines: Array<
      Omit<CreateAdditionalServiceOrderLineData, "participants"> & {
        participantClientIds: string[];
      }
    >;
    participantIds: string[];
  }> {
    if (!Array.isArray(dto.lines) || dto.lines.length === 0) {
      throw new BadRequestException(
        "La orden debe contener al menos una línea.",
      );
    }

    const participantIds = new Set<string>();
    const normalizedLines = dto.lines.map((line, lineIndex) => {
      if (
        !Array.isArray(line.participantIds) ||
        line.participantIds.length === 0
      ) {
        throw new BadRequestException(
          `La línea ${lineIndex + 1} debe contener al menos un participante.`,
        );
      }

      const lineParticipantIds = line.participantIds.map((id) => id.trim());

      if (
        lineParticipantIds.some(
          (clientId) =>
            typeof clientId !== "string" || clientId.trim().length === 0,
        )
      ) {
        throw new BadRequestException(
          `La línea ${lineIndex + 1} contiene una referencia de participante inválida.`,
        );
      }

      const uniqueLineParticipantIds = new Set(lineParticipantIds);

      if (uniqueLineParticipantIds.size !== lineParticipantIds.length) {
        throw new BadRequestException(
          `La línea ${lineIndex + 1} contiene participantes duplicados.`,
        );
      }

      lineParticipantIds.forEach((clientId) => participantIds.add(clientId));

      return {
        line,
        lineIndex,
        lineParticipantIds,
        serviceCode: line.serviceCode.trim().toUpperCase(),
        supplierId: line.supplierId.trim(),
      };
    });
    const serviceCodes = [...new Set(normalizedLines.map(({ serviceCode }) => serviceCode))];
    const [catalogs, suppliers] = await Promise.all([
      repository.findAdditionalServiceCatalogsByCodes(
        tenantId,
        serviceCodes,
      ),
      repository.findSuppliersByIds(
        tenantId,
        [...new Set(normalizedLines.map(({ supplierId }) => supplierId))],
      ),
    ]);
    const catalogByCode = new Map(
      catalogs.map((catalog) => [catalog.code, catalog]),
    );
    const supplierById = new Map(
      suppliers.map((supplier) => [supplier.id, supplier]),
    );
    const catalogIds = catalogs.map((catalog) => catalog.id);
    const [fiscalProfiles, pricingConfigurations] = await Promise.all([
      repository.findFiscalProfilesByCatalogIds(tenantId, catalogIds),
      repository.findPricingConfigurationsByCatalogIds(tenantId, catalogIds),
    ]);
    const fiscalReadiness = await this.fiscalCatalog().evaluateFiscalProfiles(tenantId, fiscalProfiles);
    const pricingByCatalogId = new Map(pricingConfigurations.map((configuration) => [configuration.additionalServiceCatalogId, configuration]));
    const resolvedEntities = normalizedLines.map(
      ({ line, lineIndex, lineParticipantIds, serviceCode, supplierId }) => {
        const catalog = catalogByCode.get(serviceCode);
        if (!catalog?.isActive) {
          throw new NotFoundException(
            `El servicio adicional ${serviceCode} no existe o está inactivo.`,
          );
        }
        const pricing = pricingByCatalogId.get(catalog.id);
        if (!pricing?.isActive || !fiscalReadiness.get(catalog.id)?.isReady) {
          throw new BadRequestException({ code: "ADDITIONAL_SERVICE_NOT_FISCALLY_READY" });
        }

        const supplier = supplierById.get(supplierId);
        if (!supplier?.isActive) {
          throw new NotFoundException(
            `El proveedor de la línea ${lineIndex + 1} no existe o está inactivo.`,
          );
        }

        return { line, catalog, supplier, lineParticipantIds };
      },
    );
    const pricingResults = await this.pricingEngine.calculateMany(
      resolvedEntities.map(({ line, catalog }) => ({
        tenantId,
        additionalServiceId: catalog.id,
        supplierCost: line.supplierCost,
        costCurrency: line.supplierCostCurrency,
        quotationCurrency: dto.quotationCurrency,
      })),
    );

    const lines = resolvedEntities.map((resolved, index) => {
      const { line, catalog, supplier, lineParticipantIds } = resolved;
      const pricing = pricingResults[index];
      return {
        additionalServiceCatalogId: catalog.id,
        serviceCode: catalog.code,
        serviceName: catalog.name,
        serviceDetailsVersion: line.serviceDetailsVersion,
        serviceDetails: normalizeAdditionalServiceDetails(
          catalog.code,
          line.serviceDetails,
        ),
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierCostUrl: this.toNullableText(line.supplierCostUrl) ?? undefined,
        supplierCost: pricing.supplierCost,
        supplierCostCurrency:
          pricing.costCurrency as CreateAdditionalServiceOrderLineData["supplierCostCurrency"],
        quotationCurrency:
          pricing.quotationCurrency as CreateAdditionalServiceOrderLineData["quotationCurrency"],
        supplierCostInQuotationCurrency:
          pricing.supplierCostInQuotationCurrency,
        exchangeRateId: pricing.exchangeRateId,
        exchangeRateDate: pricing.exchangeRateDate,
        exchangeRateSource: pricing.exchangeRateSource,
        exchangeRateBuyRate: pricing.exchangeRateBuyRate,
        exchangeRateSellRate: pricing.exchangeRateSellRate,
        exchangeRateType: pricing.exchangeRateType,
        appliedExchangeRate: pricing.appliedExchangeRate,
        marginType:
          pricing.marginType as CreateAdditionalServiceOrderLineData["marginType"],
        marginValue: pricing.marginValue,
        marginAmount: pricing.marginAmount,
        subtotal: pricing.subtotal,
        vatPercentage: pricing.vatPercentage,
        vatAmount: pricing.vatAmount,
        finalSellingPrice: pricing.finalSellingPrice,
        commercialNotes:
          this.toNullableText(line.commercialNotes) ?? undefined,
        participantClientIds: lineParticipantIds,
      };
    });

    return { lines, participantIds: [...participantIds] };
  }

  private async validateParticipants(
    repository: AdditionalServicesRepository,
    tenantId: string,
    participantIds: string[],
  ): Promise<AdditionalServiceParticipantRecord[]> {
    const participants =
      await repository.findParticipantsByIds(participantIds);
    const foundIds = new Set(participants.map((participant) => participant.id));
    const missingIds = participantIds.filter((id) => !foundIds.has(id));

    if (missingIds.length > 0) {
      throw new NotFoundException(
        `Participantes no encontrados: ${missingIds.join(", ")}.`,
      );
    }

    const foreignTenantIds = participants
      .filter((participant) => participant.tenantId !== tenantId)
      .map((participant) => participant.id);

    if (foreignTenantIds.length > 0) {
      throw new BadRequestException(
        `Los siguientes participantes no pertenecen al tenant actual: ${foreignTenantIds.join(", ")}.`,
      );
    }

    return participants;
  }

  private async validateTravelParticipants(
    repository: AdditionalServicesRepository,
    tenantId: string,
    travel: {
      travelPackageId?: string;
      internalBookingId?: string;
    },
    participantIds: string[],
  ) {
    const travelParticipants =
      await repository.findTravelParticipants(
        tenantId,
        travel,
      );
    const travelParticipantRoles = new Map(
      travelParticipants.map((participant) => [
        participant.clientId,
        participant.role,
      ]),
    );
    const unrelatedParticipantIds = participantIds.filter(
      (id) => !travelParticipantRoles.has(id),
    );

    if (unrelatedParticipantIds.length > 0) {
      throw new BadRequestException(
        `Los siguientes participantes no pertenecen al viaje seleccionado: ${unrelatedParticipantIds.join(", ")}.`,
      );
    }

    return travelParticipantRoles;
  }

  private toCreateData(
    tenantId: string,
    actor: AdditionalServiceOrderActor,
    dto: CreateAdditionalServiceOrderDto,
    travel: {
      travelPackageId?: string;
      internalBookingId?: string;
    },
    lines: CreateAdditionalServiceOrderLineData[],
    orderNumber: string,
  ): CreateAdditionalServiceOrderData {
    return {
      tenantId,
      orderNumber,
      idempotencyKey: dto.idempotencyKey.trim(),
      quoteCustomerId: dto.quoteCustomerId.trim(),
      ...travel,
      travelType: dto.travelType,
      quotationCurrency: dto.quotationCurrency,
      commercialSubtotal: this.sumMoney(lines, (line) => line.subtotal),
      totalVat: this.sumMoney(lines, (line) => line.vatAmount),
      totalSellingPrice: this.sumMoney(
        lines,
        (line) => line.finalSellingPrice,
      ),
      paymentConditionType: dto.paymentConditionType ?? null,
      paymentTermValue:
        dto.paymentConditionType === PaymentConditionType.CREDIT
          ? (dto.paymentTermValue ?? null)
          : null,
      paymentTermUnit:
        dto.paymentConditionType === PaymentConditionType.CREDIT
          ? (dto.paymentTermUnit ?? null)
          : null,
      quotationValidUntil: dto.quotationValidUntil
        ? new Date(dto.quotationValidUntil)
        : null,
      commercialObservations: this.toNullableText(
        dto.commercialObservations,
      ),
      createdByUserId: actor.id,
      createdByName: actor.fullName,
      lines,
    };
  }

  private buildOrderNumber(prefix: string): string {
    const now = new Date();
    const date = [
      now.getFullYear(),
      this.pad(now.getMonth() + 1),
      this.pad(now.getDate()),
    ].join("");
    const time = [
      this.pad(now.getHours()),
      this.pad(now.getMinutes()),
      this.pad(now.getSeconds()),
      this.pad(now.getMilliseconds(), 3),
    ].join("");
    const unique = randomBytes(2).toString("hex").toUpperCase();

    return `${prefix}-AS-${date}-${time}-${unique}`;
  }

  private sumMoney(
    lines: CreateAdditionalServiceOrderLineData[],
    select: (line: CreateAdditionalServiceOrderLineData) => number,
  ): number {
    const cents = lines.reduce(
      (total, line) => total + Math.round(select(line) * 100),
      0,
    );
    return cents / 100;
  }

  private pad(value: number, size = 2): string {
    return String(value).padStart(size, "0");
  }

  private isOrderNumberCollision(error: unknown): boolean {
    if (typeof error !== "object" || error === null || !("code" in error)) {
      return false;
    }

    const prismaError = error as {
      code?: string;
      meta?: { target?: unknown };
    };

    if (String(prismaError.code) !== "P2002") {
      return false;
    }

    const target = prismaError.meta?.target;
    return (
      target === undefined ||
      String(target).toLowerCase().includes("ordernumber")
    );
  }

  private isIdempotencyCollision(error: unknown): boolean {
    if (typeof error !== "object" || error === null || !("code" in error)) {
      return false;
    }

    const prismaError = error as {
      code?: string;
      meta?: { target?: unknown };
    };

    return (
      String(prismaError.code) === "P2002" &&
      String(prismaError.meta?.target)
        .toLowerCase()
        .includes("idempotencykey")
    );
  }
}
