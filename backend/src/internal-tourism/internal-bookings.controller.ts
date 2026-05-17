import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Tenant } from '../tenant/tenant.decorator';
import { ResolvedTenant } from '../tenant/tenant.service';
import { InternalBookingsService } from './internal-bookings.service';
import { CreateInternalBookingDto } from './dto';

@Controller('internal-bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'AGENT', 'OPERACIONES')
export class InternalBookingsController {
  constructor(private readonly bookingsService: InternalBookingsService) {}

  /**
   * POST /internal-bookings
   * Crear nueva reserva
   */
  @Post()
  @Roles('AGENT', 'OPERACIONES')
  async createBooking(
    @Req() req: any,
    @Tenant() tenant: ResolvedTenant,
    @Body() createBookingDto: CreateInternalBookingDto,
  ) {
    return this.bookingsService.createBooking(
      tenant.id,
      req.user.id,
      req.user.fullName,
      createBookingDto,
    );
  }

  /**
   * GET /internal-bookings
   * Listar reservas
   */
  @Get()
  async listBookings(
    @Tenant() tenant: ResolvedTenant,
    @Query('internalTripId') internalTripId?: string,
    @Query('clientId') clientId?: string,
    @Query('status') status?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.bookingsService.listBookings(tenant.id, {
      internalTripId,
      clientId,
      status,
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 50,
    });
  }

  /**
   * GET /internal-bookings/:id
   * Obtener detalle de reserva
   */
  @Get(':id')
  async getBooking(@Param('id') id: string, @Tenant() tenant: ResolvedTenant) {
    return this.bookingsService.getBooking(tenant.id, id);
  }

  /**
   * POST /internal-bookings/:id/payment
   * Registrar pago
   */
  @Post(':id/payment')
  @Roles('ADMIN', 'CONTADOR', 'FACTURACION_COBROS', 'OPERACIONES')
  async recordPayment(
    @Param('id') id: string,
    @Req() req: any,
    @Tenant() tenant: ResolvedTenant,
    @Body('amount') amount: number,
  ) {
    return this.bookingsService.recordPayment(
      tenant.id,
      id,
      amount,
      req.user.id,
      req.user.fullName,
    );
  }

  /**
   * DELETE /internal-bookings/:id
   * Cancelar reserva
   */
  @Delete(':id')
  @Roles('ADMIN', 'AGENT', 'OPERACIONES')
  async cancelBooking(
    @Param('id') id: string,
    @Req() req: any,
    @Tenant() tenant: ResolvedTenant,
  ) {
    return this.bookingsService.cancelBooking(
      tenant.id,
      id,
      req.user.id,
      req.user.fullName,
    );
  }
}
