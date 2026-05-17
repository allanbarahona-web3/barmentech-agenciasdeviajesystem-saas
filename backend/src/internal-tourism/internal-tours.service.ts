import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { TransportType } from '@prisma/client';
import { CreateInternalTripDto, UpdateInternalTripDto } from './dto';
import { TripGenerationResult } from './types';

@Injectable()
export class InternalToursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Genera código único para viaje interno
   * Formato: IT-YYYY-MM-XXX (ej: IT-2026-05-001)
   */
  private async generateTripCode(departureDate: Date, tenantId: string): Promise<string> {
    const year = departureDate.getFullYear();
    const month = String(departureDate.getMonth() + 1).padStart(2, '0');

    // Contar viajes existentes en ese mes para este tenant
    const startOfMonth = new Date(year, departureDate.getMonth(), 1);
    const endOfMonth = new Date(year, departureDate.getMonth() + 1, 1);

    const count = await this.prisma.internalTrip.count({
      where: {
        tenantId,
        departureDate: {
          gte: startOfMonth,
          lt: endOfMonth,
        },
      },
    });

    const sequential = String(count + 1).padStart(3, '0');
    const tripCode = `IT-${year}-${month}-${sequential}`;

    return tripCode;
  }

  /**
   * Crear nuevo viaje interno
   */
  async createTrip(
    tenantId: string,
    userId: string,
    userName: string,
    dto: CreateInternalTripDto,
    tenantConfig?: { preferredCurrency: string },
  ) {
    // Validar fechas
    const departureDate = new Date(dto.departureDate);
    const returnDate = new Date(dto.returnDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (departureDate <= today) {
      throw new BadRequestException('La fecha de salida debe ser en el futuro');
    }

    if (returnDate <= departureDate) {
      throw new BadRequestException('La fecha de regreso debe ser después de la salida');
    }

    if (dto.capacity <= 0) {
      throw new BadRequestException('La capacidad debe ser mayor a 0');
    }

    if (dto.price <= 0) {
      throw new BadRequestException('El precio debe ser mayor a 0');
    }

    // Usar moneda especificada o default del tenant
    const currency = dto.currency || tenantConfig?.preferredCurrency || 'CRC';

    const tripCode = await this.generateTripCode(departureDate, tenantId);

    const trip = await this.prisma.internalTrip.create({
      data: {
        tripCode,
        name: dto.name,
        destination: dto.destination,
        description: dto.description || null,
        departureDate,
        returnDate,
        departureTime: dto.departureTime || null,
        returnTime: dto.returnTime || null,
        capacity: dto.capacity,
        price: new Decimal(String(dto.price)),
        currency,
        minReservation: dto.minReservation ? new Decimal(String(dto.minReservation)) : null,
        transportType: dto.transportType,
        itinerary: dto.itinerary,
        status: dto.status || 'OPEN',
        createdByUserId: userId,
        createdByName: userName,
        tenantId,
      },
    });

    return trip;
  }

  /**
   * Listar viajes internos activos
   */
  async listTrips(
    tenantId: string,
    options?: {
      status?: string;
      destination?: string;
      skip?: number;
      take?: number;
    },
  ) {
    const where: any = {
      tenantId,
    };

    if (options?.status) {
      where.status = options.status;
    }

    if (options?.destination) {
      where.destination = {
        contains: options.destination,
        mode: 'insensitive',
      };
    }

    const trips = await this.prisma.internalTrip.findMany({
      where,
      include: {
        bookings: {
          where: { status: 'PAID' }, // Solo contar pagadas
        },
      },
      skip: options?.skip || 0,
      take: options?.take || 50,
      orderBy: { departureDate: 'asc' },
    });

    // Auto-marcar como COMPLETED si returnDate ya pasó
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const trip of trips) {
      if (trip.returnDate < today && trip.status !== 'COMPLETED' && trip.status !== 'CANCELLED') {
        await this.prisma.internalTrip.update({
          where: { id: trip.id },
          data: { status: 'COMPLETED' },
        });
        trip.status = 'COMPLETED';
      }
    }

    return trips.map((trip) => ({
      ...trip,
      availableSlots: trip.capacity - trip.bookings.length,
      isFull: trip.bookings.length >= trip.capacity,
    }));
  }

  /**
   * Obtener detalles de un viaje
   */
  async getTrip(tenantId: string, tripId: string) {
    const trip = await this.prisma.internalTrip.findFirst({
      where: {
        id: tripId,
        tenantId,
      },
      include: {
        bookings: {
          include: {
            client: true,
            invoice: true,
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    return {
      ...trip,
      totalBookings: trip.bookings.length,
      paidBookings: trip.bookings.filter((b) => b.status === 'PAID').length,
      pendingBookings: trip.bookings.filter((b) => b.status === 'PENDING').length,
    };
  }

  /**
   * Actualizar viaje
   */
  async updateTrip(tenantId: string, tripId: string, dto: UpdateInternalTripDto) {
    const trip = await this.prisma.internalTrip.findFirst({
      where: { id: tripId, tenantId },
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    // No permitir ediciones de viajes cancelados o completados
    if (trip.status === 'CANCELLED') {
      throw new BadRequestException('No se puede editar un viaje cancelado');
    }

    if (trip.status === 'COMPLETED') {
      throw new BadRequestException('No se puede editar un viaje que ya ocurrió');
    }

    // No permitir cambios si hay reservas
    const hasBookings = await this.prisma.internalTourBooking.findFirst({
      where: { internalTripId: tripId },
    });

    if (hasBookings && (dto.departureDate || dto.returnDate || dto.capacity || dto.price)) {
      throw new BadRequestException('No se puede modificar un viaje con reservas existentes');
    }

    const updateData: any = {};

    if (dto.name) updateData.name = dto.name;
    if (dto.destination) updateData.destination = dto.destination;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.departureDate) updateData.departureDate = new Date(dto.departureDate);
    if (dto.returnDate) updateData.returnDate = new Date(dto.returnDate);
    if (dto.departureTime) updateData.departureTime = dto.departureTime;
    if (dto.returnTime) updateData.returnTime = dto.returnTime;
    if (dto.capacity) updateData.capacity = dto.capacity;
    if (dto.price) updateData.price = new Decimal(String(dto.price));
    if (dto.currency) updateData.currency = dto.currency;
    if (dto.minReservation !== undefined) updateData.minReservation = dto.minReservation ? new Decimal(String(dto.minReservation)) : null;
    if (dto.transportType) updateData.transportType = dto.transportType;
    if (dto.itinerary) updateData.itinerary = dto.itinerary;
    if (dto.status) updateData.status = dto.status;

    return this.prisma.internalTrip.update({
      where: { id: tripId },
      data: updateData,
    });
  }

  /**
   * Cancelar viaje
   */
  async cancelTrip(tenantId: string, tripId: string) {
    const trip = await this.prisma.internalTrip.findFirst({
      where: { id: tripId, tenantId },
      include: {
        bookings: {
          where: { status: { not: 'CANCELLED' } },
          include: { client: true },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    if (trip.status === 'CANCELLED') {
      throw new BadRequestException('El viaje ya fue cancelado');
    }

    // Actualizar estado del viaje
    const cancelledTrip = await this.prisma.internalTrip.update({
      where: { id: tripId },
      data: { status: 'CANCELLED' },
    });

    // Enviar email de cancelación a todos los clientes con reservas activas
    try {
      const formattedDepartureDate = new Date(trip.departureDate).toLocaleDateString(
        'es-CR',
        { year: 'numeric', month: 'short', day: 'numeric' },
      );
      const formattedReturnDate = new Date(trip.returnDate).toLocaleDateString(
        'es-CR',
        { year: 'numeric', month: 'short', day: 'numeric' },
      );

      // Enviar email a cada cliente con reserva activa
      for (const booking of trip.bookings) {
        try {
          await this.emailService.sendEmail({
            tenantId,
            to: booking.client.email,
            subject: `Viaje Cancelado: ${trip.name}`,
            template: 'trip-cancelled',
            templateData: {
              recipientName: booking.client.fullName,
              tripName: trip.name,
              destination: trip.destination,
              departureDate: formattedDepartureDate,
              returnDate: formattedReturnDate,
              reason: 'El viaje ha sido cancelado por razones administrativas.',
            },
            triggeredBy: {
              userId: 'system',
              email: 'system@internal-tourism',
              fullName: 'Sistema',
            },
          });
        } catch (emailError) {
          // Log pero continuar con otros clientes
          console.error(
            `Error sending trip cancellation email to ${booking.client.email}:`,
            emailError,
          );
        }
      }
    } catch (error) {
      // Log pero no fallar - el viaje ya fue cancelado
      console.error('Error sending trip cancellation emails:', error);
    }

    return cancelledTrip;
  }

  /**
   * Obtener estatísticas de un viaje
   */
  async getTripStats(tenantId: string, tripId: string) {
    const trip = await this.prisma.internalTrip.findFirst({
      where: { id: tripId, tenantId },
      include: {
        bookings: true,
      },
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    const totalIncome = trip.bookings
      .filter((b) => b.status === 'PAID')
      .reduce((sum, b) => sum + Number(b.totalAmount), 0);

    const pendingIncome = trip.bookings
      .filter((b) => b.status === 'PENDING')
      .reduce((sum, b) => sum + Number(b.pendingAmount), 0);

    return {
      tripCode: trip.tripCode,
      totalBookings: trip.bookings.length,
      paidBookings: trip.bookings.filter((b) => b.status === 'PAID').length,
      pendingBookings: trip.bookings.filter((b) => b.status === 'PENDING').length,
      totalParticipants: trip.bookings.reduce((sum, b) => sum + b.participantCount, 0),
      occupancy: (trip.bookings.length / trip.capacity) * 100,
      totalIncome,
      pendingIncome,
      currency: 'CRC',
    };
  }

  /**
   * Incrementar occupiedSlots cuando se confirme un pago de reserva
   * @param tripId ID del viaje
   * @param participantCount Número de participantes a agregar
   * @param tenantId ID del tenant (validación de seguridad)
   */
  async incrementOccupiedSlots(
    tripId: string,
    participantCount: number,
    tenantId: string,
  ) {
    const trip = await this.prisma.internalTrip.findFirst({
      where: { id: tripId, tenantId },
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    // Validar que hay cupo disponible
    if (trip.occupiedSlots + participantCount > trip.capacity) {
      throw new BadRequestException(
        `No hay suficiente cupo. Disponible: ${
          trip.capacity - trip.occupiedSlots
        }, Solicitado: ${participantCount}`,
      );
    }

    const newOccupiedSlots = trip.occupiedSlots + participantCount;

    // Cerrar automáticamente si se alcanza la capacidad
    const newStatus =
      newOccupiedSlots === trip.capacity ? 'CLOSED' : trip.status;

    return await this.prisma.internalTrip.update({
      where: { id: tripId },
      data: {
        occupiedSlots: newOccupiedSlots,
        ...(newStatus !== trip.status && { status: newStatus }),
      },
    });
  }

  /**
   * Decrementar occupiedSlots cuando se cancele una reserva
   * @param tripId ID del viaje
   * @param participantCount Número de participantes a restar
   * @param tenantId ID del tenant (validación de seguridad)
   */
  async decrementOccupiedSlots(
    tripId: string,
    participantCount: number,
    tenantId: string,
  ) {
    const trip = await this.prisma.internalTrip.findFirst({
      where: { id: tripId, tenantId },
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    const newOccupiedSlots = Math.max(0, trip.occupiedSlots - participantCount);

    // Re-abrir si había estado CLOSED por capacidad y ahora hay cupos
    const newStatus =
      newOccupiedSlots < trip.capacity && trip.status === 'CLOSED'
        ? 'OPEN'
        : trip.status;

    return await this.prisma.internalTrip.update({
      where: { id: tripId },
      data: {
        occupiedSlots: newOccupiedSlots,
        ...(newStatus !== trip.status && { status: newStatus }),
      },
    });
  }
}
