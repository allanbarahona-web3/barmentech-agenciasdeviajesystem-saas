import { Injectable } from "@nestjs/common";
import { Decimal } from "@prisma/client/runtime/library";
import { PrismaService } from "../../prisma/prisma.service";
import {
  AdditionalServiceOrderRecord,
  AdditionalServiceParticipantRecord,
  AdditionalServicesRepository,
  AdditionalServiceTenantRecord,
  AdditionalServiceTravelRecord,
  AdditionalServiceTravelReference,
  CreateAdditionalServiceOrderData,
} from "./additional-services.repository.interface";

interface AdditionalServicesPrismaClient {
  tenant: {
    findUnique(args: unknown): Promise<unknown>;
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

  private scopedRepository(
    client: AdditionalServicesPrismaClient,
  ): AdditionalServicesRepository {
    const repository: AdditionalServicesRepository = {
      executeInTransaction: (work) => work(repository),
      findTenantById: (tenantId) => this.findTenant(client, tenantId),
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
