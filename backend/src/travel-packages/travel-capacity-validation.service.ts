import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TravelCapacityValidationService {
  private readonly logger = new Logger(TravelCapacityValidationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async validateTripCapacity(
    tenantId: string,
    travelPackageId: string | null,
    internalTripId: string | null,
    participantCount: number,
    context: string,
  ): Promise<void> {
    if (travelPackageId) {
      const travelPackage = await this.prisma.travelPackage.findFirst({
        where: { id: travelPackageId, tenantId },
        select: { capacity: true, occupiedSlots: true, name: true },
      });

      if (!travelPackage) {
        throw new NotFoundException(`Paquete de viaje ${travelPackageId} no encontrado.`);
      }

      this.validateCapacity({
        capacity: travelPackage.capacity,
        occupiedSlots: travelPackage.occupiedSlots,
        name: travelPackage.name,
        participantCount,
        context,
      });
    }

    if (internalTripId) {
      const internalTrip = await this.prisma.internalTrip.findFirst({
        where: { id: internalTripId, tenantId },
        select: { capacity: true, occupiedSlots: true, name: true },
      });

      if (!internalTrip) {
        throw new NotFoundException(`Viaje interno ${internalTripId} no encontrado.`);
      }

      this.validateCapacity({
        capacity: internalTrip.capacity,
        occupiedSlots: internalTrip.occupiedSlots,
        name: internalTrip.name,
        participantCount,
        context,
      });
    }
  }

  private validateCapacity(input: {
    capacity: number;
    occupiedSlots: number;
    name: string;
    participantCount: number;
    context: string;
  }): void {
    const availableSlots = input.capacity - input.occupiedSlots;

    if (input.participantCount > availableSlots) {
      this.logger.warn(
        `[${input.context}] ⚠️ Capacidad insuficiente: "${input.name}" tiene ${availableSlots} cupos disponibles, se solicitan ${input.participantCount}`,
      );
      throw new BadRequestException(
        `Capacidad insuficiente. El viaje "${input.name}" solo tiene ${availableSlots} cupos disponibles de ${input.capacity} totales. No se puede procesar la solicitud para ${input.participantCount} personas.`,
      );
    }

    this.logger.log(
      `[${input.context}] ✅ Validación de capacidad OK: ${input.participantCount} cupos solicitados, ${availableSlots} disponibles en "${input.name}"`,
    );
  }
}
