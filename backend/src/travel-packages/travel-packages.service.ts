import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTravelPackageDto } from './dto/create-travel-package.dto';
import { UpdateTravelPackageDto } from './dto/update-travel-package.dto';

@Injectable()
export class TravelPackagesService {
  private readonly logger = new Logger(TravelPackagesService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Genera un código único para el viaje basado en la fecha de salida.
   * Formato: TP-YYYY-MM-XXX (ej: TP-2026-05-001)
   */
  private async generatePackageCode(departureDate: Date): Promise<string> {
    const year = departureDate.getFullYear();
    const month = String(departureDate.getMonth() + 1).padStart(2, '0');

    // Contar viajes existentes en ese mes
    const startOfMonth = new Date(year, departureDate.getMonth(), 1);
    const endOfMonth = new Date(year, departureDate.getMonth() + 1, 1);

    const count = await this.prisma.travelPackage.count({
      where: {
        departureDate: {
          gte: startOfMonth,
          lt: endOfMonth,
        },
      },
    });

    const sequential = String(count + 1).padStart(3, '0');
    const packageCode = `TP-${year}-${month}-${sequential}`;

    // No es necesario validar unicidad aquí porque packageCode tiene @unique en schema
    // y cada tenant genera códigos independientes por mes

    return packageCode;
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

    // Generar código automáticamente
    const packageCode = await this.generatePackageCode(departure);

    const travelPackage = await this.prisma.travelPackage.create({
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
        minReservation: dto.minReservation ? new Decimal(String(dto.minReservation)) : null,
        createdByUserId,
        tenantId,
      },
    });

    this.logger.log(
      `Created travel package: ${travelPackage.packageCode} - ${travelPackage.name}`,
    );

    return travelPackage;
  }

  async findAll(tenantId: string) {
    const packages = await this.prisma.travelPackage.findMany({
      where: { tenantId }, // 🔒 SEGURIDAD: Filtrar por tenant
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

  async findAvailable(tenantId: string) {
    return await this.prisma.travelPackage.findMany({
      where: {
        tenantId, // 🔒 SEGURIDAD: Filtrar por tenant
        status: 'OPEN',
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
