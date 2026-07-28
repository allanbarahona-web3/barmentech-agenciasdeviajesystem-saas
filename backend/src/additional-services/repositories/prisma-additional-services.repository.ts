import { Injectable } from "@nestjs/common";
import { Decimal } from "@prisma/client/runtime/library";
import { PrismaService } from "../../prisma/prisma.service";
import {
  AdditionalServiceCatalogAdminRecord,
  AdditionalServiceCatalogRecord,
  AdditionalServiceOrderRecord,
  AdditionalServiceParticipantRecord,
  AdditionalServicePricingConfigurationFilters,
  AdditionalServicePricingConfigurationRecord,
  AdditionalServicesRepository,
  AdditionalServiceTenantRecord,
  AdditionalServiceTravelRecord,
  AdditionalServiceTravelReference,
  CreateAdditionalServiceOrderData,
  CreateAdditionalServiceCatalogItemData,
  CreateAdditionalServicePricingConfigurationData,
  CreateSupplierData,
  SupplierRecord,
  UpdateAdditionalServicePricingConfigurationData,
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
  internalTrip: {
    findUnique(args: unknown): Promise<unknown>;
  };
  client: {
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
  supplier: {
    create(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  additionalServiceOrder: {
    create(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown>;
  };
}

interface AdditionalServicesPrismaRoot extends AdditionalServicesPrismaClient {
  $transaction<T>(
    work: (client: AdditionalServicesPrismaClient) => Promise<T>,
  ): Promise<T>;
}

@Injectable()
export class PrismaAdditionalServicesRepository
  implements AdditionalServicesRepository
{
  private readonly client: AdditionalServicesPrismaRoot;

  constructor(prisma: PrismaService) {
    // The generated client will expose these delegates after the approved
    // migration is applied and `prisma generate` is run outside this story.
    this.client = prisma as unknown as AdditionalServicesPrismaRoot;
  }

  executeInTransaction<T>(
    work: (repository: AdditionalServicesRepository) => Promise<T>,
  ): Promise<T> {
    return this.client.$transaction((client) =>
      work(this.scopedRepository(client)),
    );
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

  findInternalTripById(
    id: string,
  ): Promise<AdditionalServiceTravelRecord | null> {
    return this.findInternalTrip(this.client, id);
  }

  findParticipantsByIds(
    ids: string[],
  ): Promise<AdditionalServiceParticipantRecord[]> {
    return this.findParticipants(this.client, ids);
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
        ...(travel.internalTripId
          ? { internalTripId: travel.internalTripId }
          : {}),
      },
      include: this.orderInclude(),
      orderBy: { createdAt: "desc" },
    });

    return (orders as unknown[]).map((order) => this.toOrderRecord(order));
  }

  findAdditionalServiceCatalogById(
    id: string,
  ): Promise<AdditionalServiceCatalogRecord | null> {
    return this.findCatalogById(this.client, id);
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

  findSuppliers(tenantId: string): Promise<SupplierRecord[]> {
    return this.findSupplierList(this.client, tenantId);
  }

  findSupplierById(
    tenantId: string,
    id: string,
  ): Promise<SupplierRecord | null> {
    return this.findSupplier(this.client, tenantId, id);
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
  ): AdditionalServicesRepository {
    const repository: AdditionalServicesRepository = {
      executeInTransaction: (work) => work(repository),
      findTenantById: (tenantId) => this.findTenant(client, tenantId),
      findAllTenantIds: () => this.findTenantIds(client),
      findTravelPackageById: (id) => this.findTravelPackage(client, id),
      findInternalTripById: (id) => this.findInternalTrip(client, id),
      findParticipantsByIds: (ids) => this.findParticipants(client, ids),
      create: (data) => this.createOrder(client, data),
      findById: async (tenantId, id) => {
        const order = await client.additionalServiceOrder.findFirst({
          where: { id, tenantId },
          include: this.orderInclude(),
        });
        return order ? this.toOrderRecord(order) : null;
      },
      findByTravel: async (tenantId, travel) => {
        const orders = await client.additionalServiceOrder.findMany({
          where: {
            tenantId,
            ...(travel.travelPackageId
              ? { travelPackageId: travel.travelPackageId }
              : {}),
            ...(travel.internalTripId
              ? { internalTripId: travel.internalTripId }
              : {}),
          },
          include: this.orderInclude(),
          orderBy: { createdAt: "desc" },
        });
        return (orders as unknown[]).map((order) =>
          this.toOrderRecord(order),
        );
      },
      findAdditionalServiceCatalogById: (id) =>
        this.findCatalogById(client, id),
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
      createPricingConfiguration: (data) => this.createPricing(client, data),
      updatePricingConfiguration: (tenantId, id, data) =>
        this.updatePricing(client, tenantId, id, data),
      findSuppliers: (tenantId) => this.findSupplierList(client, tenantId),
      findSupplierById: (tenantId, id) =>
        this.findSupplier(client, tenantId, id),
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

  private async findInternalTrip(
    client: AdditionalServicesPrismaClient,
    id: string,
  ): Promise<AdditionalServiceTravelRecord | null> {
    return (await client.internalTrip.findUnique({
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
      select: { id: true, tenantId: true },
    })) as AdditionalServiceParticipantRecord[];
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
      }
    >;

    return catalog.map(({ pricingConfigurations, ...item }) => {
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
  ): Promise<AdditionalServiceOrderRecord> {
    const order = await client.additionalServiceOrder.create({
      data: {
        tenantId: data.tenantId,
        orderNumber: data.orderNumber,
        travelPackageId: data.travelPackageId ?? null,
        internalTripId: data.internalTripId ?? null,
        createdByUserId: data.createdByUserId,
        createdByName: data.createdByName,
        lines: {
          create: data.lines.map((line) => ({
            tenantId: data.tenantId,
            serviceType: line.serviceType,
            detail: line.detail,
            notes: line.notes,
            serviceDate: line.serviceDate ?? null,
            quantity: line.quantity,
            currency: line.currency,
            exchangeRate: new Decimal(String(line.exchangeRate)),
            cost: new Decimal(String(line.cost)),
            salePrice: new Decimal(String(line.salePrice)),
            marginType: line.marginType,
            marginValue: new Decimal(String(line.marginValue)),
            taxPercentage: new Decimal(String(line.taxPercentage)),
            taxAmount: new Decimal(String(line.taxAmount)),
            subtotal: new Decimal(String(line.subtotal)),
            total: new Decimal(String(line.total)),
            supplierName: line.supplierName ?? null,
            sourceUrl: line.sourceUrl ?? null,
            participants: {
              create: line.participantClientIds.map((clientId) => ({
                tenantId: data.tenantId,
                clientId,
              })),
            },
          })),
        },
      },
      include: this.orderInclude(),
    });

    return this.toOrderRecord(order);
  }

  private orderInclude() {
    return {
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
      internalTrip: {
        select: {
          id: true,
          tripCode: true,
          name: true,
          destination: true,
          departureDate: true,
          returnDate: true,
        },
      },
      lines: {
        include: {
          participants: {
            select: {
              clientId: true,
              client: {
                select: { fullName: true },
              },
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

  private toOrderRecord(value: unknown): AdditionalServiceOrderRecord {
    const order = value as Record<string, unknown> & {
      lines: Array<Record<string, unknown> & {
        participants: Array<{
          clientId: string;
          client: { fullName: string };
        }>;
      }>;
      travelPackage: {
        id: string;
        packageCode: string;
        name: string;
        destination: string;
        departureDate: Date;
        returnDate: Date;
      } | null;
      internalTrip: {
        id: string;
        tripCode: string;
        name: string;
        destination: string;
        departureDate: Date;
        returnDate: Date;
      } | null;
    };

    return {
      id: String(order.id),
      tenantId: String(order.tenantId),
      orderNumber: String(order.orderNumber),
      travelPackageId: this.nullableString(order.travelPackageId),
      internalTripId: this.nullableString(order.internalTripId),
      travel: this.toTravelDetails(
        order.travelPackage,
        order.internalTrip,
      ),
      status: order.status as AdditionalServiceOrderRecord["status"],
      lines: order.lines.map((line) => ({
        id: String(line.id),
        tenantId: String(line.tenantId),
        orderId: String(line.orderId),
        serviceType:
          line.serviceType as AdditionalServiceOrderRecord["lines"][number]["serviceType"],
        detail: String(line.detail),
        notes: String(line.notes),
        serviceDate:
          line.serviceDate instanceof Date ? line.serviceDate : null,
        quantity: Number(line.quantity),
        currency:
          line.currency as AdditionalServiceOrderRecord["lines"][number]["currency"],
        exchangeRate: String(line.exchangeRate),
        cost: String(line.cost),
        salePrice: String(line.salePrice),
        marginType:
          line.marginType as AdditionalServiceOrderRecord["lines"][number]["marginType"],
        marginValue: String(line.marginValue),
        taxPercentage: String(line.taxPercentage),
        taxAmount: String(line.taxAmount),
        subtotal: String(line.subtotal),
        total: String(line.total),
        supplierName: this.nullableString(line.supplierName),
        sourceUrl: this.nullableString(line.sourceUrl),
        participants: line.participants.map((participant) => ({
          clientId: participant.clientId,
          fullName: participant.client.fullName,
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
    internalTrip: {
      id: string;
      tripCode: string;
      name: string;
      destination: string;
      departureDate: Date;
      returnDate: Date;
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

    if (internalTrip) {
      return {
        type: "INTERNAL_TRIP",
        id: internalTrip.id,
        code: internalTrip.tripCode,
        name: internalTrip.name,
        destination: internalTrip.destination,
        departureDate: internalTrip.departureDate,
        returnDate: internalTrip.returnDate,
      };
    }

    return null;
  }
}
