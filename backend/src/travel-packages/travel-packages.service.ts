import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Prisma, TravelPackageType } from '@prisma/client';
import { randomBytes } from 'crypto';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTravelPackageDto } from './dto/create-travel-package.dto';
import { UpdateTravelPackageDto } from './dto/update-travel-package.dto';
import { ClientActiveTravelPackageDto } from './dto/client-active-travel-package.dto';
import {
  TravelPackageParticipantRead,
  TravelPackageParticipantsRepository,
} from './repositories/travel-package-participants.repository';
import {
  TravelContextDto,
  TravelContextType,
} from '../travel-context/dto/travel-context.dto';
import { mapTravelContext } from '../travel-context/travel-context.mapper';

@Injectable()
export class TravelPackagesService {
  private readonly logger = new Logger(TravelPackagesService.name);

  constructor(
    private prisma: PrismaService,
    private readonly travelPackageParticipantsRepository: TravelPackageParticipantsRepository,
  ) {}

  getParticipantRoster(
    tenantId: string,
    travelPackageId: string,
  ): Promise<TravelPackageParticipantRead[]> {
    return this.travelPackageParticipantsRepository.findRosterByTravelPackage(
      tenantId,
      travelPackageId,
    );
  }

  async getActiveTravelPackagesByClient(
    tenantId: string,
    clientId: string,
  ): Promise<ClientActiveTravelPackageDto[]> {
    const participations =
      await this.travelPackageParticipantsRepository.findActiveTravelPackagesByClient(
        tenantId,
        clientId,
      );

    return participations.map(({ role, travelPackage }) => ({
      travelId: travelPackage.id,
      travelType: TravelContextType.INTERNATIONAL,
      name: travelPackage.name,
      destination: travelPackage.destination,
      departureDate: travelPackage.departureDate,
      returnDate: travelPackage.returnDate,
      status: travelPackage.status,
      participantRole: role,
    }));
  }

  async getTravelContext(
    tenantId: string,
    travelPackageId: string,
  ): Promise<TravelContextDto | null> {
    const travelPackage = await this.prisma.travelPackage.findFirst({
      where: {
        id: travelPackageId,
        tenantId,
      },
      select: {
        id: true,
        name: true,
        destination: true,
        departureDate: true,
        returnDate: true,
        status: true,
      },
    });

    if (!travelPackage) {
      return null;
    }

    const participants = await this.getParticipantRoster(
      tenantId,
      travelPackageId,
    );

    return mapTravelContext({
      travelId: travelPackage.id,
      travelType: TravelContextType.INTERNATIONAL,
      displayName: travelPackage.name,
      destination: travelPackage.destination,
      startDate: travelPackage.departureDate,
      endDate: travelPackage.returnDate,
      status: travelPackage.status,
      participants,
    });
  }

  private generateAlphaNumeric(length = 6): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i += 1) {
      out += alphabet[bytes[i] % alphabet.length];
    }
    return out;
  }

  /**
   * Genera código único para paquetes internacionales.
   * Formato: TP-XXXXXX (alfanumérico, 6+ caracteres)
   */
  private async generatePackageCode(): Promise<string> {
    const maxLocalAttempts = 20;
    for (let attempt = 1; attempt <= maxLocalAttempts; attempt += 1) {
      const candidate = `TP-${this.generateAlphaNumeric(6)}`;
      const exists = await this.prisma.travelPackage.findUnique({
        where: { packageCode: candidate },
        select: { id: true },
      });
      if (!exists) {
        return candidate;
      }
    }

    throw new BadRequestException('No se pudo generar un código único para el paquete. Intenta de nuevo.');
  }

  async create(dto: CreateTravelPackageDto, createdByUserId: string, tenantId: string) {
    // Validar que la fecha de retorno sea posterior a la de salida
    const departure = new Date(dto.departureDate);
    const returnDate = new Date(dto.returnDate);

    if (returnDate <= departure) {
      throw new BadRequestException(
        'Return date must be after departure date',
      );
    }

    // Generar código con reintentos para manejar colisiones concurrentes (P2002)
    let travelPackage: any = null;
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const packageCode = await this.generatePackageCode();

      try {
        travelPackage = await this.prisma.travelPackage.create({
          data: {
            packageCode,
            name: dto.name,
            destination: dto.destination,
            departureDate: departure,
            returnDate: returnDate,
            capacity: dto.capacity,
            occupiedSlots: 0,
            status: dto.status || 'OPEN',
            packagePrice: dto.packagePrice,
            priceCurrency: dto.priceCurrency || 'USD',
            travelType: (dto.travelType || 'INTERNATIONAL') as TravelPackageType,
            minReservation: dto.minReservation ? new Decimal(String(dto.minReservation)) : null,
            createdByUserId,
            tenantId,
          },
        });
        break;
      } catch (error) {
        const isUniqueCodeCollision =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          Array.isArray(error.meta?.target) &&
          error.meta.target.includes('packageCode');

        if (isUniqueCodeCollision && attempt < maxAttempts) {
          this.logger.warn(
            `packageCode duplicado (${packageCode}) en intento ${attempt}/${maxAttempts}. Reintentando...`,
          );
          continue;
        }

        throw error;
      }
    }

    if (!travelPackage) {
      throw new BadRequestException('No se pudo generar un código único para el viaje. Intenta de nuevo.');
    }

    this.logger.log(
      `Created travel package: ${travelPackage.packageCode} - ${travelPackage.name}`,
    );

    return travelPackage;
  }

  async findAll(tenantId: string, travelType?: string) {
    const packages = await this.prisma.travelPackage.findMany({
      where: { 
        tenantId, // 🔒 SEGURIDAD: Filtrar por tenant
        ...(travelType && { travelType: travelType as TravelPackageType }), // Filtrar por travelType si se proporciona
      },
      orderBy: { departureDate: 'asc' },
    });

    // Auto-marcar como COMPLETED si returnDate ya pasó
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const pkg of packages) {
      if (pkg.returnDate < today && pkg.status !== 'COMPLETED' && pkg.status !== 'CANCELLED') {
        await this.prisma.travelPackage.update({
          where: { id: pkg.id },
          data: { status: 'COMPLETED' },
        });
        pkg.status = 'COMPLETED';
      }
    }

    return packages;
  }

  async findAvailable(tenantId: string, travelType?: string) {
    return await this.prisma.travelPackage.findMany({
      where: {
        tenantId, // 🔒 SEGURIDAD: Filtrar por tenant
        status: 'OPEN',
        ...(travelType && { travelType: travelType as TravelPackageType }), // Filtrar por travelType si se proporciona
      },
      orderBy: { departureDate: 'asc' },
    });
  }

  async findById(id: string, tenantId: string) {
    const travelPackage = await this.prisma.travelPackage.findUnique({
      where: { id },
    });

    if (!travelPackage) {
      throw new NotFoundException(`Travel package ${id} not found`);
    }

    // 🔒 SEGURIDAD: Validar que el paquete pertenece al tenant
    if (travelPackage.tenantId !== tenantId) {
      throw new NotFoundException(`Travel package ${id} not found`);
    }

    return travelPackage;
  }

  async findByCode(packageCode: string, tenantId: string) {
    const travelPackage = await this.prisma.travelPackage.findUnique({
      where: { packageCode },
    });

    if (!travelPackage) {
      throw new NotFoundException(`Travel package ${packageCode} not found`);
    }

    // 🔒 SEGURIDAD: Validar que el paquete pertenece al tenant
    if (travelPackage.tenantId !== tenantId) {
      throw new NotFoundException(`Travel package ${packageCode} not found`);
    }

    return travelPackage;
  }

  async update(id: string, dto: UpdateTravelPackageDto, tenantId: string) {
    const travelPackage = await this.findById(id, tenantId);

    // Validar si está cancelado o completado (no editable)
    if (travelPackage.status === 'CANCELLED') {
      throw new BadRequestException('Cannot update a cancelled travel package');
    }

    if (travelPackage.status === 'COMPLETED') {
      throw new BadRequestException('Cannot update a completed travel package (trip already occurred)');
    }

    // Si se intenta cambiar capacidad, validar que no sea menor a ocupados
    if (dto.capacity !== undefined && dto.capacity < travelPackage.occupiedSlots) {
      throw new BadRequestException(
        `Cannot reduce capacity below occupied slots (${travelPackage.occupiedSlots} people already assigned)`,
      );
    }

    // Validar fechas si se proporcionan
    if (dto.departureDate && dto.returnDate) {
      const departure = new Date(dto.departureDate);
      const returnDate = new Date(dto.returnDate);

      if (returnDate <= departure) {
        throw new BadRequestException(
          'Return date must be after departure date',
        );
      }
    }

    // Si capacidad = occupiedSlots y se está actualizando, cerrar automáticamente
    const updatedCapacity = dto.capacity ?? travelPackage.capacity;
    const newStatus =
      updatedCapacity === travelPackage.occupiedSlots ? 'CLOSED' : dto.status;

    const updated = await this.prisma.travelPackage.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.destination && { destination: dto.destination }),
        ...(dto.departureDate && { departureDate: new Date(dto.departureDate) }),
        ...(dto.returnDate && { returnDate: new Date(dto.returnDate) }),
        ...(dto.capacity !== undefined && { capacity: dto.capacity }),
        ...(dto.packagePrice !== undefined && { packagePrice: dto.packagePrice }),
        ...(dto.priceCurrency && { priceCurrency: dto.priceCurrency }),
        ...(dto.minReservation !== undefined && { minReservation: dto.minReservation ? new Decimal(String(dto.minReservation)) : null }),
        ...(dto.travelType && { travelType: dto.travelType as TravelPackageType }),
        ...(newStatus && { status: newStatus }),
      },
    });

    this.logger.log(`Updated travel package: ${id}`);

    return updated;
  }

  async delete(id: string, tenantId: string) {
    const travelPackage = await this.findById(id, tenantId);

    // Soft delete: marcar como CANCELLED
    const deleted = await this.prisma.travelPackage.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    this.logger.log(`Cancelled travel package: ${id}`);

    return deleted;
  }

  /**
   * Incrementar occupiedSlots cuando se vincule un contrato
   * @param travelPackageId ID del viaje
   * @param participantCount Número de participantes a agregar
   * @param tenantId ID del tenant (validación de seguridad)
   */
  async incrementOccupiedSlots(
    travelPackageId: string,
    participantCount: number,
    tenantId: string,
  ) {
    const travelPackage = await this.findById(travelPackageId, tenantId);

    // Validar que hay cupo disponible
    if (travelPackage.occupiedSlots + participantCount > travelPackage.capacity) {
      throw new BadRequestException(
        `Not enough capacity. Available: ${
          travelPackage.capacity - travelPackage.occupiedSlots
        }, Requested: ${participantCount}`,
      );
    }

    const newOccupiedSlots = travelPackage.occupiedSlots + participantCount;

    // Cerrar automáticamente si se alcanza la capacidad
    const newStatus =
      newOccupiedSlots === travelPackage.capacity ? 'CLOSED' : travelPackage.status;

    return await this.prisma.travelPackage.update({
      where: { id: travelPackageId },
      data: {
        occupiedSlots: newOccupiedSlots,
        ...(newStatus !== travelPackage.status && { status: newStatus }),
      },
    });
  }

  /**
   * Decrementar occupiedSlots cuando se elimine/cancele un contrato
   * @param travelPackageId ID del viaje
   * @param participantCount Número de participantes a restar
   * @param tenantId ID del tenant (validación de seguridad)
   */
  async decrementOccupiedSlots(
    travelPackageId: string,
    participantCount: number,
    tenantId: string,
  ) {
    const travelPackage = await this.findById(travelPackageId, tenantId);

    const newOccupiedSlots = Math.max(0, travelPackage.occupiedSlots - participantCount);

    // Reabrir viaje si se libera cupo
    const newStatus =
      newOccupiedSlots < travelPackage.capacity && travelPackage.status === 'CLOSED'
        ? 'OPEN'
        : travelPackage.status;

    return await this.prisma.travelPackage.update({
      where: { id: travelPackageId },
      data: {
        occupiedSlots: newOccupiedSlots,
        ...(newStatus !== travelPackage.status && { status: newStatus }),
      },
    });
  }
}
