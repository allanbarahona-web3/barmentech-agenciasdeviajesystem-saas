import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { PrismaService } from "../../prisma/prisma.service";
import {
  AdditionalServiceCatalogAdminRecord,
  AdditionalServiceCatalogRecord,
  AdditionalServiceFiscalProfileRecord,
  AdditionalServiceOrderDashboardPageRecord,
  AdditionalServiceOrderDashboardQuery,
  AdditionalServiceOrderRecord,
  AdditionalServiceParticipantRecord,
  AdditionalServicePricingConfigurationFilters,
  AdditionalServicePricingConfigurationRecord,
  AdditionalServicesRepository,
  AdditionalServiceTenantRecord,
  AdditionalServiceTravelParticipantRecord,
  AdditionalServiceTravelRecord,
  AdditionalServiceTravelReference,
  CreateAdditionalServiceOrderData,
  CreateAdditionalServiceCatalogItemData,
  CreateAdditionalServiceFiscalProfileData,
  CreateAdditionalServicePricingConfigurationData,
  CreateSupplierData,
  SupplierRecord,
  UpdateAdditionalServicePricingConfigurationData,
  UpdateAdditionalServiceFiscalProfileData,
  UpdateSupplierData,
} from "./additional-services.repository.interface";

interface AdditionalServicesPrismaClient {
  tenant: {
    findUnique(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown>;
  };
  travelPackage: {
    findUnique(args: unknown): Promise<unknown>;
  };
  internalTourBooking: {
    findUnique(args: unknown): Promise<unknown>;
  };
  client: {
    findMany(args: unknown): Promise<unknown>;
  };
  travelPackageParticipant: {
    findMany(args: unknown): Promise<unknown>;
  };
  internalTourBookingParticipant: {
    findMany(args: unknown): Promise<unknown>;
  };
  additionalServiceCatalog: {
    createMany(args: unknown): Promise<{ count: number }>;
    findFirst(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown>;
  };
  additionalServicePricingConfiguration: {
    create(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  additionalServiceFiscalProfile: {
    create(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  supplier: {
    create(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  additionalServiceOrder: {
    count(args: unknown): Promise<number>;
    create(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  additionalServiceOrderLine: {
    createMany(args: unknown): Promise<{ count: number }>;
  };
  additionalServiceOrderParticipant: {
    createMany(args: unknown): Promise<{ count: number }>;
  };
  salesOrder: {
    findMany(args: unknown): Promise<unknown>;
  };
}

interface AdditionalServicesPrismaRoot extends AdditionalServicesPrismaClient {
  $transaction<T>(
    work: (client: AdditionalServicesPrismaClient) => Promise<T>,
  ): Promise<T>;
}

interface CreateOrderTransactionDebugContext {
  startedAt: number;
  currentStep: string;
}

@Injectable()
export class PrismaAdditionalServicesRepository
  implements AdditionalServicesRepository
{
  private readonly logger = new Logger(
    PrismaAdditionalServicesRepository.name,
  );
  private readonly client: AdditionalServicesPrismaRoot;

  constructor(prisma: PrismaService) {
    // The generated client will expose these delegates after the approved
    // migration is applied and `prisma generate` is run outside this story.
    this.client = prisma as unknown as AdditionalServicesPrismaRoot;
  }

  async executeInTransaction<T>(
    work: (repository: AdditionalServicesRepository) => Promise<T>,
  ): Promise<T> {
    const debugContext: CreateOrderTransactionDebugContext = {
      startedAt: 0,
      currentStep: "Transaction START",
    };

    try {
      const result = await this.client.$transaction(async (client) => {
        debugContext.startedAt = Date.now();
        this.logger.debug("Transaction START - elapsedMs=0");
        return work(
          this.scopedRepository(client, debugContext),
        );
      });
      this.logger.debug(
        `Transaction END - elapsedMs=${Date.now() - debugContext.startedAt}`,
      );
      return result;
    } catch (error) {
      const prismaCode =
        typeof error === "object" &&
        error !== null &&
        "code" in error
          ? String(error.code)
          : "unknown";
      const elapsedMs = debugContext.startedAt
        ? Date.now() - debugContext.startedAt
        : 0;
      this.logger.error({
        message: "Additional Services create-order transaction failed",
        failingStep: debugContext.currentStep,
        elapsedMs,
        prismaCode,
        error,
      });
      throw error;
    }
  }

  findTenantById(
    tenantId: string,
  ): Promise<AdditionalServiceTenantRecord | null> {
    return this.findTenant(this.client, tenantId);
  }

  findAllTenantIds(): Promise<string[]> {
    return this.findTenantIds(this.client);
  }

  findTravelPackageById(
    id: string,
  ): Promise<AdditionalServiceTravelRecord | null> {
    return this.findTravelPackage(this.client, id);
  }

  findInternalBookingById(
    id: string,
  ): Promise<AdditionalServiceTravelRecord | null> {
    return this.findInternalBooking(this.client, id);
  }

  findParticipantsByIds(
    ids: string[],
  ): Promise<AdditionalServiceParticipantRecord[]> {
    return this.findParticipants(this.client, ids);
  }

  findTravelParticipants(
    tenantId: string,
    travel: AdditionalServiceTravelReference,
  ): Promise<AdditionalServiceTravelParticipantRecord[]> {
    return this.loadTravelParticipants(this.client, tenantId, travel);
  }

  create(
    data: CreateAdditionalServiceOrderData,
  ): Promise<AdditionalServiceOrderRecord> {
    return this.createOrder(this.client, data);
  }

  async findById(
    tenantId: string,
    id: string,
  ): Promise<AdditionalServiceOrderRecord | null> {
    const order = await this.client.additionalServiceOrder.findFirst({
      where: { id, tenantId },
      include: this.orderInclude(),
    });

    return order ? this.toOrderRecord(order) : null;
  }

  async updateOrderDelivery(
    tenantId: string,
    id: string,
    data: {
      commercialStatus: NonNullable<
        AdditionalServiceOrderRecord["commercialStatus"]
      >;
      proposalSentAt?: Date | null;
      proposalSentToEmail?: string | null;
    },
  ): Promise<AdditionalServiceOrderRecord> {
    const order = await this.client.additionalServiceOrder.update({
      where: { id_tenantId: { id, tenantId } },
      data,
      include: this.orderInclude(),
    });
    return this.toOrderRecord(order);
  }

  async findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<AdditionalServiceOrderRecord | null> {
    const order = await this.client.additionalServiceOrder.findFirst({
      where: { tenantId, idempotencyKey },
      include: this.orderInclude(),
    });

    return order ? this.toOrderRecord(order) : null;
  }

  async findByTravel(
    tenantId: string,
    travel: AdditionalServiceTravelReference,
  ): Promise<AdditionalServiceOrderRecord[]> {
    const orders = await this.client.additionalServiceOrder.findMany({
      where: {
        tenantId,
        ...(travel.travelPackageId
          ? { travelPackageId: travel.travelPackageId }
          : {}),
        ...(travel.internalBookingId
          ? { internalBookingId: travel.internalBookingId }
          : {}),
      },
      include: this.orderInclude(),
      orderBy: { createdAt: "desc" },
    });

    return (orders as unknown[]).map((order) => this.toOrderRecord(order));
  }

  findOrderDashboardPage(
    tenantId: string,
    query: AdditionalServiceOrderDashboardQuery,
  ): Promise<AdditionalServiceOrderDashboardPageRecord> {
    return this.loadOrderDashboardPage(this.client, tenantId, query);
  }

  findAdditionalServiceCatalogById(
    id: string,
  ): Promise<AdditionalServiceCatalogRecord | null> {
    return this.findCatalogById(this.client, id);
  }

  findAdditionalServiceCatalogByTenantAndId(
    tenantId: string,
    id: string,
  ): Promise<AdditionalServiceCatalogRecord | null> {
    return this.findCatalogByTenantAndId(this.client, tenantId, id);
  }

  findAdditionalServiceCatalogByCode(
    tenantId: string,
    code: string,
  ): Promise<AdditionalServiceCatalogRecord | null> {
    return this.findCatalogByCode(this.client, tenantId, code);
  }

  findAdditionalServiceCatalogsByCodes(
    tenantId: string,
    codes: string[],
  ): Promise<AdditionalServiceCatalogRecord[]> {
    return this.findCatalogsByCodes(this.client, tenantId, codes);
  }

  findAdditionalServiceCatalogs(
    tenantId: string,
  ): Promise<AdditionalServiceCatalogAdminRecord[]> {
    return this.findCatalogs(this.client, tenantId);
  }

  findAdditionalServiceCatalogCodes(tenantId: string): Promise<string[]> {
    return this.findCatalogCodes(this.client, tenantId);
  }

  createAdditionalServiceCatalogItems(
    tenantId: string,
    items: readonly CreateAdditionalServiceCatalogItemData[],
  ): Promise<number> {
    return this.createCatalogItems(this.client, tenantId, items);
  }

  findPricingConfigurations(
    tenantId: string,
    filters?: AdditionalServicePricingConfigurationFilters,
  ): Promise<AdditionalServicePricingConfigurationRecord[]> {
    return this.findPricingConfigurationList(this.client, tenantId, filters);
  }

  findPricingConfigurationById(
    tenantId: string,
    id: string,
  ): Promise<AdditionalServicePricingConfigurationRecord | null> {
    return this.findPricingById(this.client, tenantId, id);
  }

  findPricingConfigurationByCatalogId(
    tenantId: string,
    additionalServiceCatalogId: string,
  ): Promise<AdditionalServicePricingConfigurationRecord | null> {
    return this.findPricingByCatalogId(
      this.client,
      tenantId,
      additionalServiceCatalogId,
    );
  }

  findPricingConfigurationsByCatalogIds(
    tenantId: string,
    additionalServiceCatalogIds: string[],
  ): Promise<AdditionalServicePricingConfigurationRecord[]> {
    return this.findPricingByCatalogIds(
      this.client,
      tenantId,
      additionalServiceCatalogIds,
    );
  }

  createPricingConfiguration(
    data: CreateAdditionalServicePricingConfigurationData,
  ): Promise<AdditionalServicePricingConfigurationRecord> {
    return this.createPricing(this.client, data);
  }

  updatePricingConfiguration(
    tenantId: string,
    id: string,
    data: UpdateAdditionalServicePricingConfigurationData,
  ): Promise<AdditionalServicePricingConfigurationRecord> {
    return this.updatePricing(this.client, tenantId, id, data);
  }

  findFiscalProfileById(
    tenantId: string,
    id: string,
  ): Promise<AdditionalServiceFiscalProfileRecord | null> {
    return this.findFiscalById(this.client, tenantId, id);
  }

  findFiscalProfileByCatalogId(
    tenantId: string,
    additionalServiceCatalogId: string,
  ): Promise<AdditionalServiceFiscalProfileRecord | null> {
    return this.findFiscalByCatalogId(
      this.client,
      tenantId,
      additionalServiceCatalogId,
    );
  }

  createFiscalProfile(
    data: CreateAdditionalServiceFiscalProfileData,
  ): Promise<AdditionalServiceFiscalProfileRecord> {
    return this.createFiscal(this.client, data);
  }

  updateFiscalProfile(
    tenantId: string,
    id: string,
    data: UpdateAdditionalServiceFiscalProfileData,
  ): Promise<AdditionalServiceFiscalProfileRecord> {
    return this.updateFiscal(this.client, tenantId, id, data);
  }

  findSuppliers(tenantId: string): Promise<SupplierRecord[]> {
    return this.findSupplierList(this.client, tenantId);
  }

  findSupplierById(
    tenantId: string,
    id: string,
  ): Promise<SupplierRecord | null> {
    return this.findSupplier(this.client, tenantId, id);
  }

  findSuppliersByIds(
    tenantId: string,
    ids: string[],
  ): Promise<SupplierRecord[]> {
    return this.loadSuppliersByIds(this.client, tenantId, ids);
  }

  findSupplierByName(
    tenantId: string,
    name: string,
    excludeId?: string,
  ): Promise<SupplierRecord | null> {
    return this.findSupplierWithName(
      this.client,
      tenantId,
      name,
      excludeId,
    );
  }

  createSupplier(data: CreateSupplierData): Promise<SupplierRecord> {
    return this.insertSupplier(this.client, data);
  }

  updateSupplier(
    tenantId: string,
    id: string,
    data: UpdateSupplierData,
  ): Promise<SupplierRecord> {
    return this.persistSupplier(this.client, tenantId, id, data);
  }

  private scopedRepository(
    client: AdditionalServicesPrismaClient,
    debugContext?: CreateOrderTransactionDebugContext,
  ): AdditionalServicesRepository {
    const repository: AdditionalServicesRepository = {
      executeInTransaction: (work) => work(repository),
      findTenantById: (tenantId) => this.findTenant(client, tenantId),
      findAllTenantIds: () => this.findTenantIds(client),
      findTravelPackageById: (id) => this.findTravelPackage(client, id),
      findInternalBookingById: (id) =>
        this.findInternalBooking(client, id),
      findParticipantsByIds: (ids) => this.findParticipants(client, ids),
      findTravelParticipants: (tenantId, travel) =>
        this.loadTravelParticipants(client, tenantId, travel),
      create: (data) => this.createOrder(client, data, debugContext),
      findById: async (tenantId, id) => {
        const order = await client.additionalServiceOrder.findFirst({
          where: { id, tenantId },
          include: this.orderInclude(),
        });
        return order ? this.toOrderRecord(order) : null;
      },
      updateOrderDelivery: async (tenantId, id, data) => {
        const order = await client.additionalServiceOrder.update({
          where: { id_tenantId: { id, tenantId } },
          data,
          include: this.orderInclude(),
        });
        return this.toOrderRecord(order);
      },
      findByIdempotencyKey: async (tenantId, idempotencyKey) => {
        this.logTransactionStepBefore(
          debugContext,
          "STEP 1 - Transaction idempotency lookup",
        );
        const order = await client.additionalServiceOrder.findFirst({
          where: { tenantId, idempotencyKey },
          include: this.orderInclude(),
        });
        this.logTransactionStepAfter(
          debugContext,
          "STEP 1 - Transaction idempotency lookup",
        );
        return order ? this.toOrderRecord(order) : null;
      },
      findByTravel: async (tenantId, travel) => {
        const orders = await client.additionalServiceOrder.findMany({
          where: {
            tenantId,
            ...(travel.travelPackageId
              ? { travelPackageId: travel.travelPackageId }
              : {}),
            ...(travel.internalBookingId
              ? { internalBookingId: travel.internalBookingId }
              : {}),
          },
          include: this.orderInclude(),
          orderBy: { createdAt: "desc" },
        });
        return (orders as unknown[]).map((order) =>
          this.toOrderRecord(order),
        );
      },
      findOrderDashboardPage: (tenantId, query) =>
        this.loadOrderDashboardPage(client, tenantId, query),
      findAdditionalServiceCatalogById: (id) =>
        this.findCatalogById(client, id),
      findAdditionalServiceCatalogByTenantAndId: (tenantId, id) =>
        this.findCatalogByTenantAndId(client, tenantId, id),
      findAdditionalServiceCatalogByCode: (tenantId, code) =>
        this.findCatalogByCode(client, tenantId, code),
      findAdditionalServiceCatalogsByCodes: (tenantId, codes) =>
        this.findCatalogsByCodes(client, tenantId, codes),
      findAdditionalServiceCatalogs: (tenantId) =>
        this.findCatalogs(client, tenantId),
      findAdditionalServiceCatalogCodes: (tenantId) =>
        this.findCatalogCodes(client, tenantId),
      createAdditionalServiceCatalogItems: (tenantId, items) =>
        this.createCatalogItems(client, tenantId, items),
      findPricingConfigurations: (tenantId, filters) =>
        this.findPricingConfigurationList(client, tenantId, filters),
      findPricingConfigurationById: (tenantId, id) =>
        this.findPricingById(client, tenantId, id),
      findPricingConfigurationByCatalogId: (
        tenantId,
        additionalServiceCatalogId,
      ) =>
        this.findPricingByCatalogId(
          client,
          tenantId,
          additionalServiceCatalogId,
        ),
      findPricingConfigurationsByCatalogIds: (tenantId, catalogIds) =>
        this.findPricingByCatalogIds(client, tenantId, catalogIds),
      createPricingConfiguration: (data) => this.createPricing(client, data),
      updatePricingConfiguration: (tenantId, id, data) =>
        this.updatePricing(client, tenantId, id, data),
      findFiscalProfileById: (tenantId, id) =>
        this.findFiscalById(client, tenantId, id),
      findFiscalProfileByCatalogId: (tenantId, catalogId) =>
        this.findFiscalByCatalogId(client, tenantId, catalogId),
      createFiscalProfile: (data) => this.createFiscal(client, data),
      updateFiscalProfile: (tenantId, id, data) =>
        this.updateFiscal(client, tenantId, id, data),
      findSuppliers: (tenantId) => this.findSupplierList(client, tenantId),
      findSupplierById: (tenantId, id) =>
        this.findSupplier(client, tenantId, id),
      findSuppliersByIds: (tenantId, ids) =>
        this.loadSuppliersByIds(client, tenantId, ids),
      findSupplierByName: (tenantId, name, excludeId) =>
        this.findSupplierWithName(client, tenantId, name, excludeId),
      createSupplier: (data) => this.insertSupplier(client, data),
      updateSupplier: (tenantId, id, data) =>
        this.persistSupplier(client, tenantId, id, data),
    };

    return repository;
  }

  private async findTenant(
    client: AdditionalServicesPrismaClient,
    tenantId: string,
  ): Promise<AdditionalServiceTenantRecord | null> {
    return (await client.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, contractPrefix: true },
    })) as AdditionalServiceTenantRecord | null;
  }

  private async findTenantIds(
    client: AdditionalServicesPrismaClient,
  ): Promise<string[]> {
    const tenants = (await client.tenant.findMany({
      select: { id: true },
    })) as Array<{ id: string }>;

    return tenants.map((tenant) => tenant.id);
  }

  private async findTravelPackage(
    client: AdditionalServicesPrismaClient,
    id: string,
  ): Promise<AdditionalServiceTravelRecord | null> {
    return (await client.travelPackage.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    })) as AdditionalServiceTravelRecord | null;
  }

  private async findInternalBooking(
    client: AdditionalServicesPrismaClient,
    id: string,
  ): Promise<AdditionalServiceTravelRecord | null> {
    return (await client.internalTourBooking.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    })) as AdditionalServiceTravelRecord | null;
  }

  private async findParticipants(
    client: AdditionalServicesPrismaClient,
    ids: string[],
  ): Promise<AdditionalServiceParticipantRecord[]> {
    if (ids.length === 0) {
      return [];
    }

    return (await client.client.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        tenantId: true,
        fullName: true,
        idNumber: true,
        email: true,
        phone: true,
      },
    })) as AdditionalServiceParticipantRecord[];
  }

  private async loadTravelParticipants(
    client: AdditionalServicesPrismaClient,
    tenantId: string,
    travel: AdditionalServiceTravelReference,
  ): Promise<AdditionalServiceTravelParticipantRecord[]> {
    const participants = travel.travelPackageId
      ? await client.travelPackageParticipant.findMany({
          where: {
            tenantId,
            travelPackageId: travel.travelPackageId,
          },
          select: { clientId: true, role: true },
        })
      : await client.internalTourBookingParticipant.findMany({
          where: {
            tenantId,
            bookingId: travel.internalBookingId,
          },
          select: { clientId: true, role: true },
        });

    return participants as AdditionalServiceTravelParticipantRecord[];
  }

  private async findCatalogById(
    client: AdditionalServicesPrismaClient,
    id: string,
  ): Promise<AdditionalServiceCatalogRecord | null> {
    return (await client.additionalServiceCatalog.findFirst({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        code: true,
        name: true,
        isActive: true,
      },
    })) as AdditionalServiceCatalogRecord | null;
  }

  private async findCatalogByTenantAndId(
    client: AdditionalServicesPrismaClient,
    tenantId: string,
    id: string,
  ): Promise<AdditionalServiceCatalogRecord | null> {
    return (await client.additionalServiceCatalog.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        tenantId: true,
        code: true,
        name: true,
        isActive: true,
      },
    })) as AdditionalServiceCatalogRecord | null;
  }

  private async findCatalogByCode(
    client: AdditionalServicesPrismaClient,
    tenantId: string,
    code: string,
  ): Promise<AdditionalServiceCatalogRecord | null> {
    return (await client.additionalServiceCatalog.findFirst({
      where: { tenantId, code },
      select: {
        id: true,
        tenantId: true,
        code: true,
        name: true,
        isActive: true,
      },
    })) as AdditionalServiceCatalogRecord | null;
  }

  private async findCatalogsByCodes(
    client: AdditionalServicesPrismaClient,
    tenantId: string,
    codes: string[],
  ): Promise<AdditionalServiceCatalogRecord[]> {
    return (await client.additionalServiceCatalog.findMany({
      where: { tenantId, code: { in: codes } },
      select: {
        id: true,
        tenantId: true,
        code: true,
        name: true,
        isActive: true,
      },
    })) as AdditionalServiceCatalogRecord[];
  }

  private async findCatalogs(
    client: AdditionalServicesPrismaClient,
    tenantId: string,
  ): Promise<AdditionalServiceCatalogAdminRecord[]> {
    const catalog = (await client.additionalServiceCatalog.findMany({
      where: { tenantId },
      select: {
        id: true,
        tenantId: true,
        code: true,
        name: true,
        isActive: true,
        pricingConfigurations: {
          where: { tenantId },
          select: {
            id: true,
            marginType: true,
            marginValue: true,
            taxPercentage: true,
            isActive: true,
          },
          take: 1,
        },
        fiscalProfile: {
          select: {
            id: true,
            cabysCode: true,
            unitOfMeasureCode: true,
            taxCode: true,
            taxRateCode: true,
            taxPercentage: true,
            isActive: true,
          },
        },
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    })) as Array<
      AdditionalServiceCatalogRecord & {
        pricingConfigurations: Array<{
          id: string;
          marginType: NonNullable<
            AdditionalServiceCatalogAdminRecord["pricingConfiguration"]
          >["marginType"];
          marginValue: unknown;
          taxPercentage: unknown;
          isActive: boolean;
        }>;
        fiscalProfile: {
          id: string;
          cabysCode: string;
          unitOfMeasureCode: string;
          taxCode: string | null;
          taxRateCode: string | null;
          taxPercentage: unknown | null;
          isActive: boolean;
        } | null;
      }
    >;

    return catalog.map(({ pricingConfigurations, fiscalProfile, ...item }) => {
      const pricingConfiguration = pricingConfigurations[0];

      return {
        ...item,
        pricingConfiguration: pricingConfiguration
          ? {
              ...pricingConfiguration,
              marginValue: String(pricingConfiguration.marginValue),
              taxPercentage: String(pricingConfiguration.taxPercentage),
            }
          : null,
        fiscalProfile: fiscalProfile
          ? {
              ...fiscalProfile,
              taxPercentage:
                fiscalProfile.taxPercentage === null
                  ? null
                  : String(fiscalProfile.taxPercentage),
            }
          : null,
      };
    });
  }

  private async findCatalogCodes(
    client: AdditionalServicesPrismaClient,
    tenantId: string,
  ): Promise<string[]> {
    const catalog = (await client.additionalServiceCatalog.findMany({
      where: { tenantId },
      select: { code: true },
    })) as Array<{ code: string }>;

    return catalog.map((item) => item.code);
  }

  private async createCatalogItems(
    client: AdditionalServicesPrismaClient,
    tenantId: string,
    items: readonly CreateAdditionalServiceCatalogItemData[],
  ): Promise<number> {
    if (items.length === 0) {
      return 0;
    }

    const result = await client.additionalServiceCatalog.createMany({
      data: items.map((item) => ({
        tenantId,
        code: item.code,
        name: item.name,
        displayOrder: item.displayOrder,
        isActive: true,
      })),
      skipDuplicates: true,
    });

    return result.count;
  }

  private async findPricingConfigurationList(
    client: AdditionalServicesPrismaClient,
    tenantId: string,
    filters?: AdditionalServicePricingConfigurationFilters,
  ): Promise<AdditionalServicePricingConfigurationRecord[]> {
    const configurations =
      await client.additionalServicePricingConfiguration.findMany({
        where: {
          tenantId,
          ...(filters?.additionalServiceCatalogId
            ? {
                additionalServiceCatalogId:
                  filters.additionalServiceCatalogId,
              }
            : {}),
          ...(filters?.isActive !== undefined
            ? { isActive: filters.isActive }
            : {}),
        },
        include: this.pricingConfigurationInclude(),
        orderBy: [
          { additionalServiceCatalog: { displayOrder: "asc" } },
          { additionalServiceCatalog: { name: "asc" } },
        ],
      });

    return (configurations as unknown[]).map((configuration) =>
      this.toPricingConfigurationRecord(configuration),
    );
  }

  private async findPricingById(
    client: AdditionalServicesPrismaClient,
    tenantId: string,
    id: string,
  ): Promise<AdditionalServicePricingConfigurationRecord | null> {
    const configuration =
      await client.additionalServicePricingConfiguration.findFirst({
        where: { id, tenantId },
        include: this.pricingConfigurationInclude(),
      });

    return configuration
      ? this.toPricingConfigurationRecord(configuration)
      : null;
  }

  private async findPricingByCatalogId(
    client: AdditionalServicesPrismaClient,
    tenantId: string,
    additionalServiceCatalogId: string,
  ): Promise<AdditionalServicePricingConfigurationRecord | null> {
    const configuration =
      await client.additionalServicePricingConfiguration.findFirst({
        where: { tenantId, additionalServiceCatalogId },
        include: this.pricingConfigurationInclude(),
      });

    return configuration
      ? this.toPricingConfigurationRecord(configuration)
      : null;
  }

  private async findPricingByCatalogIds(
    client: AdditionalServicesPrismaClient,
    tenantId: string,
    additionalServiceCatalogIds: string[],
  ): Promise<AdditionalServicePricingConfigurationRecord[]> {
    const configurations =
      await client.additionalServicePricingConfiguration.findMany({
        where: {
          tenantId,
          additionalServiceCatalogId: {
            in: additionalServiceCatalogIds,
          },
        },
        include: this.pricingConfigurationInclude(),
      });

    return (configurations as unknown[]).map((configuration) =>
      this.toPricingConfigurationRecord(configuration),
    );
  }

  private async createPricing(
    client: AdditionalServicesPrismaClient,
    data: CreateAdditionalServicePricingConfigurationData,
  ): Promise<AdditionalServicePricingConfigurationRecord> {
    const configuration =
      await client.additionalServicePricingConfiguration.create({
        data: {
          tenantId: data.tenantId,
          additionalServiceCatalogId: data.additionalServiceCatalogId,
          marginType: data.marginType,
          marginValue: new Decimal(String(data.marginValue)),
          taxPercentage: new Decimal(String(data.taxPercentage)),
          isActive: data.isActive,
        },
        include: this.pricingConfigurationInclude(),
      });

    return this.toPricingConfigurationRecord(configuration);
  }

  private async updatePricing(
    client: AdditionalServicesPrismaClient,
    tenantId: string,
    id: string,
    data: UpdateAdditionalServicePricingConfigurationData,
  ): Promise<AdditionalServicePricingConfigurationRecord> {
    const configuration =
      await client.additionalServicePricingConfiguration.update({
        where: {
          id,
          tenantId,
        },
        data: {
          ...(data.marginType !== undefined
            ? { marginType: data.marginType }
            : {}),
          ...(data.marginValue !== undefined
            ? { marginValue: new Decimal(String(data.marginValue)) }
            : {}),
          ...(data.taxPercentage !== undefined
            ? { taxPercentage: new Decimal(String(data.taxPercentage)) }
            : {}),
          ...(data.isActive !== undefined
            ? { isActive: data.isActive }
            : {}),
        },
        include: this.pricingConfigurationInclude(),
      });

    return this.toPricingConfigurationRecord(configuration);
  }

  private async findFiscalById(
    client: AdditionalServicesPrismaClient,
    tenantId: string,
    id: string,
  ): Promise<AdditionalServiceFiscalProfileRecord | null> {
    const profile = await client.additionalServiceFiscalProfile.findFirst({
      where: { id, tenantId },
    });
    return profile ? this.toFiscalProfileRecord(profile) : null;
  }

  private async findFiscalByCatalogId(
    client: AdditionalServicesPrismaClient,
    tenantId: string,
    additionalServiceCatalogId: string,
  ): Promise<AdditionalServiceFiscalProfileRecord | null> {
    const profile = await client.additionalServiceFiscalProfile.findFirst({
      where: { tenantId, additionalServiceCatalogId },
    });
    return profile ? this.toFiscalProfileRecord(profile) : null;
  }

  private async createFiscal(
    client: AdditionalServicesPrismaClient,
    data: CreateAdditionalServiceFiscalProfileData,
  ): Promise<AdditionalServiceFiscalProfileRecord> {
    const profile = await client.additionalServiceFiscalProfile.create({
      data: {
        ...data,
        taxPercentage:
          data.taxPercentage === null
            ? null
            : new Decimal(data.taxPercentage),
      },
    });
    return this.toFiscalProfileRecord(profile);
  }

  private async updateFiscal(
    client: AdditionalServicesPrismaClient,
    tenantId: string,
    id: string,
    data: UpdateAdditionalServiceFiscalProfileData,
  ): Promise<AdditionalServiceFiscalProfileRecord> {
    const profile = await client.additionalServiceFiscalProfile.update({
      where: { id, tenantId },
      data: {
        ...data,
        ...(data.taxPercentage !== undefined
          ? {
              taxPercentage:
                data.taxPercentage === null
                  ? null
                  : new Decimal(data.taxPercentage),
            }
          : {}),
      },
    });
    return this.toFiscalProfileRecord(profile);
  }

  private async findSupplierList(
    client: AdditionalServicesPrismaClient,
    tenantId: string,
  ): Promise<SupplierRecord[]> {
    return (await client.supplier.findMany({
      where: { tenantId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    })) as SupplierRecord[];
  }

  private async findSupplier(
    client: AdditionalServicesPrismaClient,
    tenantId: string,
    id: string,
  ): Promise<SupplierRecord | null> {
    return (await client.supplier.findFirst({
      where: { id, tenantId },
    })) as SupplierRecord | null;
  }

  private async loadSuppliersByIds(
    client: AdditionalServicesPrismaClient,
    tenantId: string,
    ids: string[],
  ): Promise<SupplierRecord[]> {
    return (await client.supplier.findMany({
      where: { tenantId, id: { in: ids } },
    })) as SupplierRecord[];
  }

  private async findSupplierWithName(
    client: AdditionalServicesPrismaClient,
    tenantId: string,
    name: string,
    excludeId?: string,
  ): Promise<SupplierRecord | null> {
    return (await client.supplier.findFirst({
      where: {
        tenantId,
        name: { equals: name, mode: "insensitive" },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    })) as SupplierRecord | null;
  }

  private async insertSupplier(
    client: AdditionalServicesPrismaClient,
    data: CreateSupplierData,
  ): Promise<SupplierRecord> {
    return (await client.supplier.create({
      data,
    })) as SupplierRecord;
  }

  private async persistSupplier(
    client: AdditionalServicesPrismaClient,
    tenantId: string,
    id: string,
    data: UpdateSupplierData,
  ): Promise<SupplierRecord> {
    return (await client.supplier.update({
      where: { id, tenantId },
      data,
    })) as SupplierRecord;
  }

  private async createOrder(
    client: AdditionalServicesPrismaClient,
    data: CreateAdditionalServiceOrderData,
    debugContext?: CreateOrderTransactionDebugContext,
  ): Promise<AdditionalServiceOrderRecord> {
    this.logTransactionStepBefore(
      debugContext,
      "STEP 2 - Order INSERT",
    );
    const order = (await client.additionalServiceOrder.create({
      data: {
        tenantId: data.tenantId,
        orderNumber: data.orderNumber,
        idempotencyKey: data.idempotencyKey,
        quoteCustomerId: data.quoteCustomerId,
        travelPackageId: data.travelPackageId ?? null,
        internalBookingId: data.internalBookingId ?? null,
        travelType: data.travelType,
        quotationCurrency: data.quotationCurrency,
        commercialSubtotal: new Decimal(String(data.commercialSubtotal)),
        totalVat: new Decimal(String(data.totalVat)),
        totalSellingPrice: new Decimal(String(data.totalSellingPrice)),
        paymentConditionType: data.paymentConditionType,
        paymentTermValue: data.paymentTermValue,
        paymentTermUnit: data.paymentTermUnit,
        quotationValidUntil: data.quotationValidUntil,
        commercialObservations: data.commercialObservations,
        createdByUserId: data.createdByUserId,
        createdByName: data.createdByName,
      },
      select: { id: true },
    })) as { id: string };
    this.logTransactionStepAfter(
      debugContext,
      "STEP 2 - Order INSERT",
    );
    const lines = data.lines.map((line) => ({
      id: randomUUID(),
      tenantId: data.tenantId,
      orderId: order.id,
      additionalServiceCatalogId: line.additionalServiceCatalogId,
      serviceCode: line.serviceCode,
      serviceName: line.serviceName,
      serviceDetailsVersion: line.serviceDetailsVersion,
      serviceDetails: line.serviceDetails,
      supplierId: line.supplierId,
      supplierName: line.supplierName,
      supplierCostUrl: line.supplierCostUrl ?? null,
      supplierCost: new Decimal(String(line.supplierCost)),
      supplierCostCurrency: line.supplierCostCurrency,
      quotationCurrency: line.quotationCurrency,
      supplierCostInQuotationCurrency: new Decimal(
        String(line.supplierCostInQuotationCurrency),
      ),
      exchangeRateId: line.exchangeRateId,
      exchangeRateDate: line.exchangeRateDate,
      exchangeRateSource: line.exchangeRateSource,
      exchangeRateBuyRate:
        line.exchangeRateBuyRate === null
          ? null
          : new Decimal(String(line.exchangeRateBuyRate)),
      exchangeRateSellRate:
        line.exchangeRateSellRate === null
          ? null
          : new Decimal(String(line.exchangeRateSellRate)),
      exchangeRateType: line.exchangeRateType,
      appliedExchangeRate: new Decimal(String(line.appliedExchangeRate)),
      marginType: line.marginType,
      marginValue: new Decimal(String(line.marginValue)),
      marginAmount: new Decimal(String(line.marginAmount)),
      subtotal: new Decimal(String(line.subtotal)),
      vatPercentage: new Decimal(String(line.vatPercentage)),
      vatAmount: new Decimal(String(line.vatAmount)),
      finalSellingPrice: new Decimal(String(line.finalSellingPrice)),
      commercialNotes: line.commercialNotes ?? null,
      participants: line.participants,
    }));

    this.logTransactionStepBefore(
      debugContext,
      "STEP 3 - Order lines bulk insert",
    );
    await client.additionalServiceOrderLine.createMany({
      data: lines.map(({ participants, ...line }) => line),
    });
    this.logTransactionStepAfter(
      debugContext,
      "STEP 3 - Order lines bulk insert",
    );
    this.logTransactionStepBefore(
      debugContext,
      "STEP 4 - Line participants bulk insert",
    );
    await client.additionalServiceOrderParticipant.createMany({
      data: lines.flatMap((line) =>
        line.participants.map((participant) => ({
          tenantId: data.tenantId,
          lineId: line.id,
          clientId: participant.clientId,
          role: participant.role,
          fullName: participant.fullName,
          identification: participant.identification,
          email: participant.email,
          phone: participant.phone,
        })),
      ),
    });
    this.logTransactionStepAfter(
      debugContext,
      "STEP 4 - Line participants bulk insert",
    );
    this.logTransactionStepBefore(
      debugContext,
      "STEP 5 - Read persisted order",
    );
    const persistedOrder = await client.additionalServiceOrder.findFirst({
      where: { id: order.id, tenantId: data.tenantId },
      include: this.orderInclude(),
    });
    this.logTransactionStepAfter(
      debugContext,
      "STEP 5 - Read persisted order",
    );
    if (!persistedOrder) {
      throw new Error("Persisted additional service order could not be read.");
    }

    return this.toOrderRecord(persistedOrder);
  }

  private logTransactionStepBefore(
    debugContext: CreateOrderTransactionDebugContext | undefined,
    step: string,
  ): void {
    if (!debugContext) {
      return;
    }
    debugContext.currentStep = step;
    this.logger.debug(
      `${step} - before - elapsedMs=${Date.now() - debugContext.startedAt}`,
    );
  }

  private logTransactionStepAfter(
    debugContext: CreateOrderTransactionDebugContext | undefined,
    step: string,
  ): void {
    if (!debugContext) {
      return;
    }
    this.logger.debug(
      `${step} - after - elapsedMs=${Date.now() - debugContext.startedAt}`,
    );
  }

  private async loadOrderDashboardPage(
    client: AdditionalServicesPrismaClient,
    tenantId: string,
    query: AdditionalServiceOrderDashboardQuery,
  ): Promise<AdditionalServiceOrderDashboardPageRecord> {
    const where: Record<string, unknown> = { tenantId };
    const andConditions: Record<string, unknown>[] = [];

    if (query.search) {
      andConditions.push({
        OR: [
          {
            orderNumber: {
              contains: query.search,
              mode: "insensitive",
            },
          },
          {
            quoteCustomer: {
              is: {
                fullName: {
                  contains: query.search,
                  mode: "insensitive",
                },
              },
            },
          },
          {
            quoteCustomer: {
              is: {
                idNumber: {
                  contains: query.search,
                  mode: "insensitive",
                },
              },
            },
          },
        ],
      });
    }
    if (query.travelId) {
      if (query.travelType === "INTERNATIONAL") {
        where.travelPackageId = query.travelId;
        where.travelType = query.travelType;
      } else if (query.travelType === "INTERNAL") {
        where.internalBookingId = query.travelId;
        where.travelType = query.travelType;
      } else {
        andConditions.push({
          OR: [
            { travelPackageId: query.travelId },
            { internalBookingId: query.travelId },
          ],
        });
      }
    } else if (query.travelType) {
      where.travelType = query.travelType;
    }
    if (query.travelNumber) {
      andConditions.push({
        OR: [
          {
            travelPackage: {
              is: {
                OR: [
                  {
                    packageCode: {
                      contains: query.travelNumber,
                      mode: "insensitive",
                    },
                  },
                  {
                    contracts: {
                      some: {
                        contractNumber: {
                          contains: query.travelNumber,
                          mode: "insensitive",
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
          {
            internalBooking: {
              is: {
                bookingCode: {
                  contains: query.travelNumber,
                  mode: "insensitive",
                },
              },
            },
          },
        ],
      });
    }
    if (andConditions.length > 0) {
      where.AND = andConditions;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.createdFrom || query.createdTo) {
      where.createdAt = {
        ...(query.createdFrom ? { gte: query.createdFrom } : {}),
        ...(query.createdTo ? { lte: query.createdTo } : {}),
      };
    }

    const skip = (query.page - 1) * query.pageSize;
    const [rawOrders, total] = await Promise.all([
      client.additionalServiceOrder.findMany({
        where,
        select: {
          id: true,
          orderNumber: true,
          quoteCustomer: {
            select: {
              fullName: true,
            },
          },
          travelPackageId: true,
          internalBookingId: true,
          travelType: true,
          quotationCurrency: true,
          totalSellingPrice: true,
          status: true,
          commercialStatus: true,
          createdAt: true,
          travelPackage: {
            select: {
              id: true,
              name: true,
            },
          },
          internalBooking: {
            select: {
              id: true,
              internalTrip: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: query.pageSize,
      }),
      client.additionalServiceOrder.count({ where }),
    ]);

    const orders = rawOrders as Array<{
      id: string;
      orderNumber: string;
      quoteCustomer: { fullName: string } | null;
      travelPackageId: string | null;
      internalBookingId: string | null;
      travelType: AdditionalServiceOrderDashboardPageRecord["orders"][number]["travelType"];
      quotationCurrency: AdditionalServiceOrderDashboardPageRecord["orders"][number]["currency"];
      totalSellingPrice: unknown;
      status: AdditionalServiceOrderDashboardPageRecord["orders"][number]["status"];
      commercialStatus: AdditionalServiceOrderDashboardPageRecord["orders"][number]["commercialStatus"];
      createdAt: Date;
      travelPackage: {
        id: string;
        name: string;
      } | null;
      internalBooking: {
        id: string;
        internalTrip: {
          name: string;
        };
      } | null;
    }>;
    const salesOrders = orders.length
      ? ((await client.salesOrder.findMany({
          where: {
            tenantId,
            sourceType: "ADDITIONAL_SERVICE_ORDER",
            sourceId: { in: orders.map((order) => order.id) },
          },
          select: {
            id: true,
            orderNumber: true,
            sourceId: true,
          },
        })) as Array<{
          id: string;
          orderNumber: string;
          sourceId: string;
        }>)
      : [];
    const salesOrderBySourceId = new Map(
      salesOrders.map(({ sourceId, id, orderNumber }) => [
        sourceId,
        { id, orderNumber },
      ]),
    );

    return {
      orders: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.quoteCustomer?.fullName ?? null,
        travelId:
          order.travelType === "INTERNATIONAL"
            ? order.travelPackageId
            : order.internalBookingId,
        travelName:
          order.travelType === "INTERNATIONAL"
            ? order.travelPackage?.name ?? null
            : order.internalBooking?.internalTrip.name ?? null,
        travelType: order.travelType,
        createdAt: order.createdAt,
        totalAmount: String(order.totalSellingPrice),
        currency: order.quotationCurrency,
        status: order.status,
        commercialStatus: order.commercialStatus,
        salesOrder: salesOrderBySourceId.get(order.id) ?? null,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  private orderInclude() {
    return {
      quoteCustomer: {
        select: {
          fullName: true,
          email: true,
        },
      },
      travelPackage: {
        select: {
          id: true,
          packageCode: true,
          name: true,
          destination: true,
          departureDate: true,
          returnDate: true,
        },
      },
      internalBooking: {
        select: {
          id: true,
          bookingCode: true,
          internalTrip: {
            select: {
              name: true,
              destination: true,
              departureDate: true,
              returnDate: true,
            },
          },
        },
      },
      lines: {
        include: {
          participants: {
            select: {
              clientId: true,
              fullName: true,
              identification: true,
              email: true,
              phone: true,
            },
          },
        },
      },
    };
  }

  private pricingConfigurationInclude() {
    return {
      additionalServiceCatalog: {
        select: {
          id: true,
          tenantId: true,
          code: true,
          name: true,
          isActive: true,
        },
      },
    };
  }

  private toPricingConfigurationRecord(
    value: unknown,
  ): AdditionalServicePricingConfigurationRecord {
    const configuration = value as Record<string, unknown> & {
      additionalServiceCatalog: AdditionalServiceCatalogRecord;
    };

    return {
      id: String(configuration.id),
      tenantId: String(configuration.tenantId),
      additionalServiceCatalogId: String(
        configuration.additionalServiceCatalogId,
      ),
      marginType:
        configuration.marginType as AdditionalServicePricingConfigurationRecord["marginType"],
      marginValue: String(configuration.marginValue),
      taxPercentage: String(configuration.taxPercentage),
      isActive: Boolean(configuration.isActive),
      createdAt: configuration.createdAt as Date,
      updatedAt: configuration.updatedAt as Date,
      additionalServiceCatalog: configuration.additionalServiceCatalog,
    };
  }

  private toFiscalProfileRecord(
    value: unknown,
  ): AdditionalServiceFiscalProfileRecord {
    const profile = value as Record<string, unknown>;
    return {
      id: String(profile.id),
      tenantId: String(profile.tenantId),
      additionalServiceCatalogId: String(profile.additionalServiceCatalogId),
      cabysCode: String(profile.cabysCode),
      unitOfMeasureCode: String(profile.unitOfMeasureCode),
      taxCode: profile.taxCode === null ? null : String(profile.taxCode),
      taxRateCode:
        profile.taxRateCode === null ? null : String(profile.taxRateCode),
      taxPercentage:
        profile.taxPercentage === null ? null : String(profile.taxPercentage),
      isActive: Boolean(profile.isActive),
      createdAt: profile.createdAt as Date,
      updatedAt: profile.updatedAt as Date,
    };
  }

  private toOrderRecord(value: unknown): AdditionalServiceOrderRecord {
    const order = value as Record<string, unknown> & {
      lines: Array<Record<string, unknown> & {
        participants: Array<{
          clientId: string | null;
          role: AdditionalServiceOrderRecord["lines"][number]["participants"][number]["role"];
          fullName: string;
          identification: string;
          email: string | null;
          phone: string | null;
        }>;
      }>;
      quoteCustomer: {
        fullName: string;
        email: string | null;
      } | null;
      travelPackage: {
        id: string;
        packageCode: string;
        name: string;
        destination: string;
        departureDate: Date;
        returnDate: Date;
      } | null;
      internalBooking: {
        id: string;
        bookingCode: string;
        internalTrip: {
          name: string;
          destination: string;
          departureDate: Date;
          returnDate: Date;
        };
      } | null;
    };

    return {
      id: String(order.id),
      tenantId: String(order.tenantId),
      orderNumber: String(order.orderNumber),
      idempotencyKey: String(order.idempotencyKey),
      quoteCustomerId: this.nullableString(order.quoteCustomerId),
      quoteCustomer: order.quoteCustomer
        ? {
            fullName: order.quoteCustomer.fullName,
            email: order.quoteCustomer.email,
          }
        : null,
      travelPackageId: this.nullableString(order.travelPackageId),
      internalBookingId: this.nullableString(order.internalBookingId),
      travelType:
        order.travelType as AdditionalServiceOrderRecord["travelType"],
      quotationCurrency:
        order.quotationCurrency as AdditionalServiceOrderRecord["quotationCurrency"],
      commercialSubtotal: String(order.commercialSubtotal),
      totalVat: String(order.totalVat),
      totalSellingPrice: String(order.totalSellingPrice),
      paymentConditionType:
        (order.paymentConditionType as AdditionalServiceOrderRecord["paymentConditionType"]) ??
        null,
      paymentTermValue:
        typeof order.paymentTermValue === "number"
          ? order.paymentTermValue
          : null,
      paymentTermUnit:
        (order.paymentTermUnit as AdditionalServiceOrderRecord["paymentTermUnit"]) ??
        null,
      quotationValidUntil:
        order.quotationValidUntil instanceof Date
          ? order.quotationValidUntil
          : null,
      commercialObservations: this.nullableString(
        order.commercialObservations,
      ),
      travel: this.toTravelDetails(
        order.travelPackage,
        order.internalBooking,
      ),
      status: order.status as AdditionalServiceOrderRecord["status"],
      commercialStatus:
        (order.commercialStatus as AdditionalServiceOrderRecord["commercialStatus"]) ??
        null,
      proposalSentAt:
        order.proposalSentAt instanceof Date ? order.proposalSentAt : null,
      proposalSentToEmail: this.nullableString(order.proposalSentToEmail),
      proposalApprovedAt:
        order.proposalApprovedAt instanceof Date
          ? order.proposalApprovedAt
          : null,
      proposalApprovalMethod: this.nullableString(
        order.proposalApprovalMethod,
      ),
      proposalApprovedByUserId: this.nullableString(
        order.proposalApprovedByUserId,
      ),
      proposalApprovedByName: this.nullableString(
        order.proposalApprovedByName,
      ),
      lines: order.lines.map((line) => ({
        id: String(line.id),
        tenantId: String(line.tenantId),
        orderId: String(line.orderId),
        additionalServiceCatalogId: String(
          line.additionalServiceCatalogId,
        ),
        serviceCode: String(line.serviceCode),
        serviceName: String(line.serviceName),
        serviceDetailsVersion:
          typeof line.serviceDetailsVersion === "number"
            ? line.serviceDetailsVersion
            : null,
        serviceDetails:
          line.serviceDetails &&
          typeof line.serviceDetails === "object" &&
          !Array.isArray(line.serviceDetails)
            ? line.serviceDetails as AdditionalServiceOrderRecord["lines"][number]["serviceDetails"]
            : null,
        supplierId: String(line.supplierId),
        supplierName: String(line.supplierName),
        supplierCostUrl: this.nullableString(line.supplierCostUrl),
        supplierCost: String(line.supplierCost),
        supplierCostCurrency:
          line.supplierCostCurrency as AdditionalServiceOrderRecord["lines"][number]["supplierCostCurrency"],
        quotationCurrency:
          line.quotationCurrency as AdditionalServiceOrderRecord["lines"][number]["quotationCurrency"],
        supplierCostInQuotationCurrency: String(
          line.supplierCostInQuotationCurrency,
        ),
        exchangeRateId: this.nullableString(line.exchangeRateId),
        exchangeRateDate:
          line.exchangeRateDate instanceof Date
            ? line.exchangeRateDate
            : null,
        exchangeRateSource: this.nullableString(line.exchangeRateSource),
        exchangeRateBuyRate:
          line.exchangeRateBuyRate === null
            ? null
            : String(line.exchangeRateBuyRate),
        exchangeRateSellRate:
          line.exchangeRateSellRate === null
            ? null
            : String(line.exchangeRateSellRate),
        exchangeRateType:
          line.exchangeRateType as AdditionalServiceOrderRecord["lines"][number]["exchangeRateType"],
        appliedExchangeRate: String(line.appliedExchangeRate),
        marginType:
          line.marginType as AdditionalServiceOrderRecord["lines"][number]["marginType"],
        marginValue: String(line.marginValue),
        marginAmount: String(line.marginAmount),
        subtotal: String(line.subtotal),
        vatPercentage: String(line.vatPercentage),
        vatAmount: String(line.vatAmount),
        finalSellingPrice: String(line.finalSellingPrice),
        commercialNotes: this.nullableString(line.commercialNotes),
        participants: line.participants.map((participant) => ({
          clientId: participant.clientId,
          role: participant.role,
          fullName: participant.fullName,
          identification: participant.identification,
          email: participant.email,
          phone: participant.phone,
        })),
        createdAt: line.createdAt as Date,
        updatedAt: line.updatedAt as Date,
      })),
      createdByUserId: String(order.createdByUserId),
      createdByName: String(order.createdByName),
      createdAt: order.createdAt as Date,
      updatedAt: order.updatedAt as Date,
    };
  }

  private nullableString(value: unknown): string | null {
    return value === null || value === undefined ? null : String(value);
  }

  private toTravelDetails(
    travelPackage: {
      id: string;
      packageCode: string;
      name: string;
      destination: string;
      departureDate: Date;
      returnDate: Date;
    } | null,
    internalBooking: {
      id: string;
      bookingCode: string;
      internalTrip: {
        name: string;
        destination: string;
        departureDate: Date;
        returnDate: Date;
      };
    } | null,
  ): AdditionalServiceOrderRecord["travel"] {
    if (travelPackage) {
      return {
        type: "TRAVEL_PACKAGE",
        id: travelPackage.id,
        code: travelPackage.packageCode,
        name: travelPackage.name,
        destination: travelPackage.destination,
        departureDate: travelPackage.departureDate,
        returnDate: travelPackage.returnDate,
      };
    }

    if (internalBooking) {
      return {
        type: "INTERNAL_TRIP",
        id: internalBooking.id,
        code: internalBooking.bookingCode,
        name: internalBooking.internalTrip.name,
        destination: internalBooking.internalTrip.destination,
        departureDate: internalBooking.internalTrip.departureDate,
        returnDate: internalBooking.internalTrip.returnDate,
      };
    }

    return null;
  }
}
