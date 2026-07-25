import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { CreateAdditionalServiceOrderDto } from "./dto";
import {
  ADDITIONAL_SERVICES_REPOSITORY,
  AdditionalServiceOrderRecord,
  AdditionalServicesRepository,
  CreateAdditionalServiceOrderData,
} from "./repositories";

export interface AdditionalServiceOrderActor {
  id: string;
  fullName: string;
}

@Injectable()
export class AdditionalServicesService {
  private readonly logger = new Logger(AdditionalServicesService.name);
  private readonly maxOrderNumberAttempts = 6;

  constructor(
    @Inject(ADDITIONAL_SERVICES_REPOSITORY)
    private readonly repository: AdditionalServicesRepository,
  ) {}

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
