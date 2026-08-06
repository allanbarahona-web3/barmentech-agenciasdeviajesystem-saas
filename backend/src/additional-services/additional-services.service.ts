import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { PricingEngineService } from "../pricing-engine";
import {
  AdditionalServiceOrderDashboardResponseDto,
  CreateAdditionalServiceOrderDto,
  CreateAdditionalServicePricingConfigurationDto,
  CreateSupplierDto,
  ListAdditionalServicePricingConfigurationsDto,
  ListAdditionalServiceOrdersDto,
  UpdateAdditionalServicePricingConfigurationDto,
  UpdateSupplierDto,
} from "./dto";
import { DateUtils } from "../common/utils/date.utils";
import {
  ADDITIONAL_SERVICES_REPOSITORY,
  AdditionalServiceOrderRecord,
  AdditionalServiceParticipantRecord,
  AdditionalServicePricingConfigurationRecord,
  AdditionalServicesRepository,
  CreateAdditionalServiceOrderData,
  CreateAdditionalServiceOrderLineData,
  SupplierRecord,
  UpdateSupplierData,
} from "./repositories";
import { normalizeAdditionalServiceDetails } from "./service-details";
import { PaymentConditionType } from "./enums";

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
    private readonly pricingEngine: PricingEngineService,
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
    const [catalogs, suppliers] = await Promise.all([
      repository.findAdditionalServiceCatalogsByCodes(
        tenantId,
        [...new Set(normalizedLines.map(({ serviceCode }) => serviceCode))],
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
    const resolvedEntities = normalizedLines.map(
      ({ line, lineIndex, lineParticipantIds, serviceCode, supplierId }) => {
        const catalog = catalogByCode.get(serviceCode);
        if (!catalog?.isActive) {
          throw new NotFoundException(
            `El servicio adicional ${serviceCode} no existe o está inactivo.`,
          );
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
