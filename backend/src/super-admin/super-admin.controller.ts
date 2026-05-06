import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { CreateTenantDto, UpdateTenantStatusDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

/**
 * 🔐 Super Admin Controller
 * 
 * Endpoints exclusivos para SUPER_ADMIN (role = SUPER_ADMIN, tenantId = null)
 * 
 * Estos usuarios:
 * - NO pertenecen a ningún tenant
 * - Pueden crear y gestionar tenants
 * - Pueden operar cross-tenant
 * - Bypassean RLS de forma controlada en el service
 * 
 * Seguridad:
 * - Requiere JWT válido (JwtAuthGuard)
 * - Requiere role = SUPER_ADMIN (RolesGuard)
 * - RLSInterceptor detecta tenantId = null y NO setea contexto
 * - Service usa bypassRLS() explícitamente
 */
@Controller('super-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  /**
   * 📋 GET /super-admin/tenants
   * Listar todos los tenants de la plataforma
   */
  @Get('tenants')
  async getAllTenants() {
    return this.superAdminService.getAllTenants();
  }

  /**
   * 🔍 GET /super-admin/tenants/:id
   * Obtener detalles completos de un tenant
   */
  @Get('tenants/:id')
  async getTenantById(@Param('id') tenantId: string) {
    return this.superAdminService.getTenantById(tenantId);
  }

  /**
   * 🏢 POST /super-admin/tenants
   * Crear un nuevo tenant con su admin inicial
   */
  @Post('tenants')
  @HttpCode(HttpStatus.CREATED)
  async createTenant(@Body() dto: CreateTenantDto) {
    return this.superAdminService.createTenant(dto);
  }

  /**
   * 🔒 PATCH /super-admin/tenants/:id/status
   * Activar o suspender un tenant
   */
  @Patch('tenants/:id/status')
  async updateTenantStatus(
    @Param('id') tenantId: string,
    @Body() dto: UpdateTenantStatusDto,
  ) {
    return this.superAdminService.updateTenantStatus(tenantId, dto);
  }

  /**
   * 📊 GET /super-admin/stats
   * Obtener estadísticas de la plataforma
   */
  @Get('stats')
  async getPlatformStats() {
    return this.superAdminService.getPlatformStats();
  }
}
