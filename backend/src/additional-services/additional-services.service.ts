import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import {
  CreateAdditionalServiceOrderDto,
  CreateAdditionalServicePricingConfigurationDto,
  CreateSupplierDto,
  ListAdditionalServicePricingConfigurationsDto,
  UpdateAdditionalServicePricingConfigurationDto,
  UpdateSupplierDto,
} from "./dto";
import {
  ADDITIONAL_SERVICES_REPOSITORY,
  AdditionalServiceOrderRecord,
  AdditionalServicePricingConfigurationRecord,
  AdditionalServicesRepository,
  CreateAdditionalServiceOrderData,
  SupplierRecord,
  UpdateSupplierData,
} from "./repositories";

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
  ) {}

  async listAdditionalServiceCatalog(
    tenantId: string,
  ): Promise<AdditionalServiceCatalogAdminItem[]> {
    const catalog =
      await this.repository.findAdditionalServiceCatalogs(tenantId);

    return catalog.map(
      ({ id, code, name, isActive, pricingConfiguration }) => ({
        id,
        code,
        name,
        isActive,
        pricingConfiguration,
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
    await this.validatePricingValues(dto.marginValue, dto.taxPercentage);
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

    try {
      return await this.repository.createPricingConfiguration({
        tenantId,
        additionalServiceCatalogId: dto.additionalServiceCatalogId,
        marginType: dto.marginType,
        marginValue: dto.marginValue,
        taxPercentage: dto.taxPercentage,
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
    await this.getPricingConfiguration(tenantId, configurationId);
    await this.validatePricingValues(dto.marginValue, dto.taxPercentage);

    return this.repository.updatePricingConfiguration(
      tenantId,
      configurationId,
      dto,
    );
  }

  async updatePricingConfigurationStatus(
    tenantId: string,
    configurationId: string,
    isActive: boolean,
  ): Promise<AdditionalServicePricingConfigurationRecord> {
    await this.getPricingConfiguration(tenantId, configurationId);

    return this.repository.updatePricingConfiguration(
      tenantId,
      configurationId,
      { isActive },
    );
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

  async createOrder(
    tenantId: string,
    actor: AdditionalServiceOrderActor,
    dto: CreateAdditionalServiceOrderDto,
  ): Promise<AdditionalServiceOrderRecord> {
    for (
      let attempt = 1;
      attempt <= this.maxOrderNumberAttempts;
      attempt += 1
    ) {
      try {
        const order = await this.repository.executeInTransaction(
          async (repository) => {
            const tenant = await repository.findTenantById(tenantId);
            if (!tenant) {
              throw new NotFoundException("Tenant no encontrado.");
            }

            await this.validateTravelReference(repository, tenantId, dto);
            const participantIds = await this.validateLines(dto);
            await this.validateParticipants(
              repository,
              tenantId,
              participantIds,
            );

            return repository.create(
              this.toCreateData(
                tenantId,
                actor,
                dto,
                this.buildOrderNumber(tenant.contractPrefix),
              ),
            );
          },
        );

        this.logger.log(
          `Additional service order created: ${order.orderNumber}`,
        );
        return order;
      } catch (error) {
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

  private async validatePricingValues(
    marginValue?: number,
    taxPercentage?: number,
  ): Promise<void> {
    if (
      marginValue !== undefined &&
      (!Number.isFinite(marginValue) || marginValue < 0)
    ) {
      throw new BadRequestException(
        "El valor del margen no puede ser negativo.",
      );
    }

    if (
      taxPercentage !== undefined &&
      (!Number.isFinite(taxPercentage) || taxPercentage < 0)
    ) {
      throw new BadRequestException(
        "El porcentaje de impuesto no puede ser negativo.",
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
  ): Promise<void> {
    const hasTravelPackage = Boolean(dto.travelPackageId?.trim());
    const hasInternalTrip = Boolean(dto.internalTripId?.trim());

    if (hasTravelPackage === hasInternalTrip) {
      throw new BadRequestException(
        "Debe indicar exactamente una referencia de viaje: TravelPackage o InternalTrip.",
      );
    }

    const travel = hasTravelPackage
      ? await repository.findTravelPackageById(dto.travelPackageId!)
      : await repository.findInternalTripById(dto.internalTripId!);

    if (!travel) {
      throw new NotFoundException("El viaje referenciado no existe.");
    }

    if (travel.tenantId !== tenantId) {
      throw new BadRequestException(
        "El viaje referenciado no pertenece al tenant actual.",
      );
    }
  }

  private async validateLines(
    dto: CreateAdditionalServiceOrderDto,
  ): Promise<string[]> {
    if (!Array.isArray(dto.lines) || dto.lines.length === 0) {
      throw new BadRequestException(
        "La orden debe contener al menos una línea.",
      );
    }

    const participantIds = new Set<string>();

    dto.lines.forEach((line, lineIndex) => {
      if (
        !Array.isArray(line.participants) ||
        line.participants.length === 0
      ) {
        throw new BadRequestException(
          `La línea ${lineIndex + 1} debe contener al menos un participante.`,
        );
      }

      const lineParticipantIds = line.participants.map(
        (participant) => participant.clientId,
      );

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
    });

    return [...participantIds];
  }

  private async validateParticipants(
    repository: AdditionalServicesRepository,
    tenantId: string,
    participantIds: string[],
  ): Promise<void> {
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
  }

  private toCreateData(
    tenantId: string,
    actor: AdditionalServiceOrderActor,
    dto: CreateAdditionalServiceOrderDto,
    orderNumber: string,
  ): CreateAdditionalServiceOrderData {
    return {
      tenantId,
      orderNumber,
      travelPackageId: dto.travelPackageId,
      internalTripId: dto.internalTripId,
      createdByUserId: actor.id,
      createdByName: actor.fullName,
      lines: dto.lines.map((line) => ({
        serviceType: line.serviceType,
        detail: line.detail,
        notes: line.notes,
        serviceDate: line.serviceDate
          ? new Date(line.serviceDate)
          : undefined,
        quantity: line.quantity,
        currency: line.currency,
        exchangeRate: line.exchangeRate,
        cost: line.cost,
        salePrice: line.salePrice,
        marginType: line.marginType,
        marginValue: line.marginValue,
        taxPercentage: line.taxPercentage,
        taxAmount: line.taxAmount,
        subtotal: line.subtotal,
        total: line.total,
        supplierName: line.supplierName,
        sourceUrl: line.sourceUrl,
        participantClientIds: line.participants.map(
          (participant) => participant.clientId,
        ),
      })),
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
}
