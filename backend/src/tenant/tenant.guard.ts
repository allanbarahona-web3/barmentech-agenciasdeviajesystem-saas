import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { ResolvedTenant } from './tenant.service';

/**
 * TenantGuard valida que el tenantId del JWT coincida con el tenant del dominio.
 * 
 * Debe aplicarse DESPUÉS de JwtAuthGuard para que req.user ya esté disponible.
 * 
 * SUPER ADMINS (tenantId = null) bypassean esta validación - pueden acceder a cualquier tenant.
 * 
 * Ejemplo:
 * @UseGuards(JwtAuthGuard, TenantGuard)
 * @Get('profile')
 * getProfile(@Tenant() tenant: ResolvedTenant) { ... }
 */
@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // req.tenant debe estar disponible (desde TenantMiddleware)
    const tenant = request.tenant as ResolvedTenant | undefined;
    if (!tenant) {
      this.logger.error('❌ req.tenant no está disponible. ¿Se registró TenantMiddleware?');
      throw new UnauthorizedException(
        'No se pudo identificar el tenant',
      );
    }

    // req.user debe estar disponible (desde JwtAuthGuard)
    const user = request.user as { tenantId?: string | null; role?: string } | undefined;
    if (!user) {
      this.logger.error('❌ req.user no está disponible. ¿Se aplicó JwtAuthGuard?');
      throw new UnauthorizedException(
        'Token de autenticación inválido',
      );
    }

    // Super admins (tenantId = null) bypassean validación de tenant
    if (user.tenantId === null || user.tenantId === undefined) {
      this.logger.log(
        `🔓 Super admin detectado, bypasseando validación de tenant (dominio: ${tenant.name})`,
      );
      return true;
    }

    // Validar que coincidan (usuarios normales)
    if (user.tenantId !== tenant.id) {
      this.logger.warn(
        `❌ Mismatch de tenant: JWT=${user.tenantId}, Dominio=${tenant.id} (${tenant.name})`,
      );
      throw new UnauthorizedException(
        'El token de autenticación no pertenece a este dominio',
      );
    }

    this.logger.debug(
      `✅ Tenant validado: ${tenant.name} (${user.tenantId})`,
    );
    return true;
  }
}
