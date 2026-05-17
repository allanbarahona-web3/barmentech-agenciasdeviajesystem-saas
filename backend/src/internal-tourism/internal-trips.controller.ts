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
import { InternalToursService } from './internal-tours.service';
import { InternalBookingsService } from './internal-bookings.service';
import { CreateInternalTripDto, UpdateInternalTripDto, CreateInternalBookingDto } from './dto';

@Controller('internal-trips')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'AGENT', 'OPERACIONES')
export class InternalTripsController {
  constructor(private readonly toursService: InternalToursService) {}

  /**
   * POST /internal-trips
   * Crear nuevo viaje interno
   */
  @Post()
  @Roles('ADMIN', 'OPERACIONES')
  async createTrip(
    @Req() req: any,
    @Tenant() tenant: ResolvedTenant,
    @Body() createTripDto: CreateInternalTripDto,
  ) {
    return this.toursService.createTrip(
      tenant.id,
      req.user.id,
      req.user.fullName,
      createTripDto,
      { preferredCurrency: tenant.preferredCurrency },
    );
  }

  /**
   * GET /internal-trips
   * Listar viajes internos
   */
  @Get()
  async listTrips(
    @Tenant() tenant: ResolvedTenant,
    @Query('status') status?: string,
    @Query('destination') destination?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.toursService.listTrips(tenant.id, {
      status,
      destination,
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 50,
    });
  }

  /**
   * GET /internal-trips/:id
   * Obtener detalle de viaje
   */
  @Get(':id')
  async getTrip(@Param('id') id: string, @Tenant() tenant: ResolvedTenant) {
    return this.toursService.getTrip(tenant.id, id);
  }

  /**
   * PUT /internal-trips/:id
   * Actualizar viaje
   */
  @Put(':id')
  @Roles('ADMIN', 'OPERACIONES')
  async updateTrip(
    @Param('id') id: string,
    @Tenant() tenant: ResolvedTenant,
    @Body() updateTripDto: UpdateInternalTripDto,
  ) {
    return this.toursService.updateTrip(tenant.id, id, updateTripDto);
  }

  /**
   * DELETE /internal-trips/:id
   * Cancelar viaje
   */
  @Delete(':id')
  @Roles('ADMIN')
  async cancelTrip(@Param('id') id: string, @Tenant() tenant: ResolvedTenant) {
    return this.toursService.cancelTrip(tenant.id, id);
  }

  /**
   * GET /internal-trips/:id/stats
   * Obtener estadísticas de viaje
   */
  @Get(':id/stats')
  async getTripStats(@Param('id') id: string, @Tenant() tenant: ResolvedTenant) {
    return this.toursService.getTripStats(tenant.id, id);
  }
}
