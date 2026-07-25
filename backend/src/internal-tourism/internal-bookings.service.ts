import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { InternalToursService } from './internal-tours.service';
import { CreateInternalBookingDto } from './dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class InternalBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly internalToursService: InternalToursService,
  ) {}

  /**
   * Genera código único para reserva
   * Formato: IT-YYYYMM-NNN (ej: IT-202605-001)
   */
  private async generateBookingCode(tenantId: string): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    // Contar reservas del mes actual
    const count = await this.prisma.internalTourBooking.count({
      where: {
        tenantId,
        createdAt: {
          gte: new Date(year, now.getMonth(), 1),
          lt: new Date(year, now.getMonth() + 1, 1),
        },
      },
    });

    const sequence = String(count + 1).padStart(3, '0');
    return `IT-${year}${month}-${sequence}`;
  }

  /**
   * Generar número de factura
   * Formato: IT-INV-YYYYMM-NNN
   */
  private async generateInvoiceNumber(tenantId: string): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    const count = await this.prisma.internalTourInvoice.count({
      where: {
        tenantId,
        createdAt: {
          gte: new Date(year, now.getMonth(), 1),
          lt: new Date(year, now.getMonth() + 1, 1),
        },
      },
    });

    const sequence = String(count + 1).padStart(3, '0');
    return `IT-INV-${year}${month}-${sequence}`;
  }

  /**
   * Crear nueva reserva de viaje interno
   */
  async createBooking(
    tenantId: string,
    userId: string,
    userName: string,
    dto: CreateInternalBookingDto,
  ) {
    if (!Array.isArray(dto.participants) || dto.participants.length === 0) {
      throw new BadRequestException('La reserva debe incluir al menos un participante');
    }

    const holderParticipants = dto.participants.filter(
      (participant) => participant.role === 'HOLDER',
    );
    if (holderParticipants.length !== 1) {
      throw new BadRequestException(
        'La reserva debe incluir exactamente un participante HOLDER',
      );
    }

    const participantClientIds = dto.participants.map(
      (participant) => participant.clientId,
    );
    if (new Set(participantClientIds).size !== participantClientIds.length) {
      throw new BadRequestException(
        'No se permiten participantes duplicados en la reserva',
      );
    }

    const holderClientId = holderParticipants[0].clientId;
    const participantCount = dto.participants.length;

    // Validar viaje
    const trip = await this.prisma.internalTrip.findFirst({
      where: {
        id: dto.internalTripId,
        tenantId,
      },
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    if (trip.status !== 'OPEN') {
      throw new BadRequestException('El viaje no está disponible para reservas');
    }

    // Validar todos los participantes en una sola consulta
    const participants = await this.prisma.client.findMany({
      where: {
        id: { in: participantClientIds },
        tenantId,
      },
    });

    if (participants.length !== participantClientIds.length) {
      const foundClientIds = new Set(
        participants.map((participant) => participant.id),
      );
      const missingClientIds = participantClientIds.filter(
        (clientId) => !foundClientIds.has(clientId),
      );
      throw new NotFoundException(
        `Participantes no encontrados o fuera del tenant: ${missingClientIds.join(', ')}`,
      );
    }

    const client = participants.find(
      (participant) => participant.id === holderClientId,
    )!;

    // Verificar que cliente no tenga reserva activa en este viaje
    const existingBooking = await this.prisma.internalTourBooking.findFirst({
      where: {
        internalTripId: dto.internalTripId,
        clientId: holderClientId,
        tenantId,
        status: { not: 'CANCELLED' },
      },
    });

    if (existingBooking) {
      throw new BadRequestException('El cliente ya tiene una reserva en este viaje');
    }

    // Verificar disponibilidad de cupos
    const bookingCount = await this.prisma.internalTourBooking.count({
      where: {
        internalTripId: dto.internalTripId,
        status: 'PAID', // Solo contar las pagadas
      },
    });

    const availableSlots = trip.capacity - bookingCount;
    if (participantCount > availableSlots) {
      throw new BadRequestException(
        `Solo hay ${availableSlots} cupos disponibles (solicitaste ${participantCount})`,
      );
    }

    // Calcular monto total
    const totalAmount = new Decimal(String(trip.price)).times(new Decimal(participantCount));

    // Generar códigos
    const bookingCode = await this.generateBookingCode(tenantId);
    const invoiceNumber = await this.generateInvoiceNumber(tenantId);

    // Crear reserva y factura en transacción
    const booking = await this.prisma.$transaction(async (tx) => {
      // Crear reserva (heredar moneda del viaje)
      const newBooking = await (tx as any).internalTourBooking.create({
        data: {
          bookingCode,
          internalTripId: dto.internalTripId,
          clientId: holderClientId,
          participantCount,
          totalAmount,
          currency: trip.currency,
          paidAmount: new Decimal(0),
          pendingAmount: totalAmount,
          status: 'PENDING',
          notes: dto.notes || null,
          createdByUserId: userId,
          createdByName: userName,
          tenantId,
          participants: {
            create: dto.participants.map((participant) => ({
              tenantId,
              clientId: participant.clientId,
              role: participant.role,
            })),
          },
        },
        include: {
          participants: {
            select: {
              id: true,
              clientId: true,
              role: true,
              client: {
                select: {
                  id: true,
                  fullName: true,
                },
              },
            },
          },
        },
      });

      // Crear factura
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7); // 7 días para pagar

      await tx.internalTourInvoice.create({
        data: {
          bookingId: newBooking.id,
          invoiceNumber,
          totalAmount,
          paidAmount: new Decimal(0),
          pendingAmount: totalAmount,
          issuedAt: new Date(),
          paymentDueDate: dueDate,
          tenantId,
        },
      });

      return newBooking;
    });

    // Enviar email de confirmación de reserva
    try {
      const formattedDepartureDate = new Date(trip.departureDate).toLocaleDateString(
        'es-CR',
        { year: 'numeric', month: 'short', day: 'numeric' },
      );
      const formattedReturnDate = new Date(trip.returnDate).toLocaleDateString(
        'es-CR',
        { year: 'numeric', month: 'short', day: 'numeric' },
      );

      await this.emailService.sendEmail({
        tenantId,
        to: client.email,
        subject: `Reserva Confirmada: ${trip.name}`,
        template: 'booking-confirmation',
        templateData: {
          recipientName: client.fullName,
          clientEmail: client.email,
          tripCode: trip.tripCode,
          tripName: trip.name,
          destination: trip.destination,
          departureDate: formattedDepartureDate,
          returnDate: formattedReturnDate,
          participantCount: booking.participantCount,
          totalAmount: Number(booking.totalAmount),
          currency: booking.currency,
          bookingCode: booking.bookingCode,
        },
        triggeredBy: {
          userId,
          email: 'system@internal-tourism',
          fullName: userName,
        },
      });
    } catch (emailError) {
      // Log pero no fallar - la reserva ya fue creada
      console.error('Error sending booking confirmation email:', emailError);
    }

    return {
      ...booking,
      totalAmount: Number(booking.totalAmount),
      paidAmount: Number(booking.paidAmount),
      pendingAmount: Number(booking.pendingAmount),
    };
  }

  /**
   * Listar reservas
   */
  async listBookings(
    tenantId: string,
    options?: {
      internalTripId?: string;
      clientId?: string;
      status?: string;
      skip?: number;
      take?: number;
    },
  ) {
    const where: any = { tenantId };

    if (options?.internalTripId) {
      where.internalTripId = options.internalTripId;
    }
    if (options?.clientId) {
      where.clientId = options.clientId;
    }
    if (options?.status) {
      where.status = options.status;
    }

    const bookings = await this.prisma.internalTourBooking.findMany({
      where,
      include: {
        internalTrip: true,
        client: true,
        invoice: true,
      },
      skip: options?.skip || 0,
      take: options?.take || 50,
      orderBy: { createdAt: 'desc' },
    });

    return bookings.map((b) => ({
      ...b,
      totalAmount: Number(b.totalAmount),
      paidAmount: Number(b.paidAmount),
      pendingAmount: Number(b.pendingAmount),
    }));
  }

  /**
   * Obtener detalle de reserva
   */
  async getBooking(tenantId: string, bookingId: string) {
    const booking = await (this.prisma as any).internalTourBooking.findFirst({
      where: {
        id: bookingId,
        tenantId,
      },
      include: {
        internalTrip: true,
        client: true,
        invoice: true,
        payments: true,
        participants: {
          select: {
            id: true,
            clientId: true,
            role: true,
            client: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Reserva no encontrada');
    }

    return {
      ...booking,
      totalAmount: Number(booking.totalAmount),
      paidAmount: Number(booking.paidAmount),
      pendingAmount: Number(booking.pendingAmount),
    };
  }

  /**
   * Registrar pago para reserva
   */
  async recordPayment(
    tenantId: string,
    bookingId: string,
    amount: number,
    userId: string,
    userName: string,
  ) {
    const booking = await this.prisma.internalTourBooking.findFirst({
      where: { id: bookingId, tenantId },
      include: { invoice: true },
    });

    if (!booking) {
      throw new NotFoundException('Reserva no encontrada');
    }

    if (booking.status === 'CANCELLED') {
      throw new BadRequestException('No se puede pagar una reserva cancelada');
    }

    const amountDecimal = new Decimal(String(amount));

    // Validar que no se sobrepague
    if (amountDecimal.plus(booking.paidAmount).greaterThan(booking.totalAmount)) {
      throw new BadRequestException(
        `El monto excede el total. Total: ${booking.totalAmount}, Ya pagado: ${booking.paidAmount}`,
      );
    }

    const newPaidAmount = booking.paidAmount.plus(amountDecimal);
    const newPendingAmount = booking.totalAmount.minus(newPaidAmount);
    const newStatus = newPendingAmount.equals(0) ? 'PAID' : 'PENDING';

    // Actualizar en transacción
    const updated = await this.prisma.$transaction(async (tx) => {
      // Actualizar reserva
      const updatedBooking = await tx.internalTourBooking.update({
        where: { id: bookingId },
        data: {
          paidAmount: newPaidAmount,
          pendingAmount: newPendingAmount,
          status: newStatus,
        },
      });

      // Actualizar factura
      await tx.internalTourInvoice.update({
        where: { bookingId },
        data: {
          paidAmount: newPaidAmount,
          pendingAmount: newPendingAmount,
          paidAt: newStatus === 'PAID' ? new Date() : null,
        },
      });

      // Crear registro de pago
      await tx.billingPayment.create({
        data: {
          invoiceId: booking.invoice!.id,
          type: 'INTERNAL_TOUR',
          amount: amountDecimal,
          currency: 'CRC',
          status: 'ABONO_REPORTADO',
          internalTourBookingId: bookingId,
          createdByUserId: userId,
          createdByName: userName,
          tenantId,
        },
      });

      return updatedBooking;
    });

    // Enviar email de pago registrado
    try {
      // Obtener datos adicionales para el email
      const bookingWithRelations = await this.prisma.internalTourBooking.findFirst({
        where: { id: bookingId },
        include: {
          client: true,
          internalTrip: true,
        },
      });

      if (bookingWithRelations) {
        const formattedDepartureDate = new Date(
          bookingWithRelations.internalTrip.departureDate,
        ).toLocaleDateString('es-CR', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
        const formattedReturnDate = new Date(
          bookingWithRelations.internalTrip.returnDate,
        ).toLocaleDateString('es-CR', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });

        await this.emailService.sendEmail({
          tenantId,
          to: bookingWithRelations.client.email,
          subject: `Pago Registrado: ${bookingWithRelations.internalTrip.name}`,
          template: 'payment-received',
          templateData: {
            recipientName: bookingWithRelations.client.fullName,
            bookingCode: bookingWithRelations.bookingCode,
            tripName: bookingWithRelations.internalTrip.name,
            destination: bookingWithRelations.internalTrip.destination,
            departureDate: formattedDepartureDate,
            returnDate: formattedReturnDate,
            amountPaid: Number(newPaidAmount),
            pendingAmount: Number(newPendingAmount),
            currency: bookingWithRelations.currency,
            isPaid: newStatus === 'PAID',
          },
          triggeredBy: {
            userId,
            email: 'system@internal-tourism',
            fullName: userName,
          },
        });
      }
    } catch (emailError) {
      // Log pero no fallar - el pago ya fue registrado
      console.error('Error sending payment received email:', emailError);
    }

    return {
      ...updated,
      totalAmount: Number(updated.totalAmount),
      paidAmount: Number(updated.paidAmount),
      pendingAmount: Number(updated.pendingAmount),
    };
  }

  /**
   * Cancelar reserva
   */
  async cancelBooking(tenantId: string, bookingId: string, userId?: string, userName?: string) {
    const booking = await this.prisma.internalTourBooking.findFirst({
      where: { id: bookingId, tenantId },
      include: { client: true, internalTrip: true },
    });

    if (!booking) {
      throw new NotFoundException('Reserva no encontrada');
    }

    if (booking.status === 'CANCELLED') {
      throw new BadRequestException('La reserva ya fue cancelada');
    }

    // TODO: Gestionar reembolso si hay pagos

    const updated = await this.prisma.internalTourBooking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED' },
    });

    // Liberar cupos del viaje si la reserva estaba pagada
    if (booking.status === 'PAID') {
      try {
        await this.internalToursService.decrementOccupiedSlots(
          booking.internalTripId,
          booking.participantCount,
          tenantId,
        );
        console.log(
          `[cancelBooking] ✅ Liberados ${booking.participantCount} cupos del viaje ${booking.internalTripId}`,
        );
      } catch (decrementError) {
        // Log pero no fallar - la cancelación ya fue realizada
        console.error(
          `[cancelBooking] ⚠️ No se pudieron liberar cupos: ${decrementError instanceof Error ? decrementError.message : String(decrementError)}`,
        );
      }
    }

    // Enviar email de cancelación
    try {
      const formattedDepartureDate = new Date(booking.internalTrip.departureDate).toLocaleDateString(
        'es-CR',
        { year: 'numeric', month: 'short', day: 'numeric' },
      );
      const formattedReturnDate = new Date(booking.internalTrip.returnDate).toLocaleDateString(
        'es-CR',
        { year: 'numeric', month: 'short', day: 'numeric' },
      );

      await this.emailService.sendEmail({
        tenantId,
        to: booking.client.email,
        subject: `Reserva Cancelada: ${booking.internalTrip.name}`,
        template: 'trip-cancelled',
        templateData: {
          recipientName: booking.client.fullName,
          bookingCode: booking.bookingCode,
          tripName: booking.internalTrip.name,
          destination: booking.internalTrip.destination,
          departureDate: formattedDepartureDate,
          returnDate: formattedReturnDate,
          totalAmount: Number(booking.totalAmount),
          paidAmount: Number(booking.paidAmount),
          refundAmount: Number(booking.paidAmount), // A reembolsar
          currency: booking.currency,
        },
        triggeredBy: {
          userId: userId || 'system',
          email: 'system@internal-tourism',
          fullName: userName || 'Sistema',
        },
      });
    } catch (emailError) {
      // Log pero no fallar - la cancelación ya fue realizada
      console.error('Error sending booking cancellation email:', emailError);
    }

    return {
      ...updated,
      totalAmount: Number(updated.totalAmount),
      paidAmount: Number(updated.paidAmount),
      pendingAmount: Number(updated.pendingAmount),
    };
  }
}
