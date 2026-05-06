import {
  Injectable,
  NestMiddleware,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantService, ResolvedTenant } from './tenant.service';

// Extender Request para incluir tenant
declare global {
  namespace Express {
    interface Request {
      tenant?: ResolvedTenant;
    }
  }
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(private tenantService: TenantService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const host = req.get('host') || 'localhost';

    try {
      // Resolver tenant desde el dominio
      const tenant = await this.tenantService.resolveTenant(host);

      // Validar que esté activo
      if (!tenant.isActive) {
        this.logger.warn(
          `❌ Intento de acceso a tenant inactivo: ${tenant.name}`,
        );
        throw new UnauthorizedException(
          `El servicio para ${tenant.name} no está disponible`,
        );
      }

      // Adjuntar tenant al request
      req.tenant = tenant;

      this.logger.debug(
        `✅ Tenant resuelto: ${tenant.name} (${tenant.subdomain})`,
      );
      next();
    } catch (error) {
      this.logger.error(`❌ Error resolviendo tenant para ${host}:`, error);
      throw new UnauthorizedException(
        `No se pudo identificar el tenant para este dominio`,
      );
    }
  }
}
