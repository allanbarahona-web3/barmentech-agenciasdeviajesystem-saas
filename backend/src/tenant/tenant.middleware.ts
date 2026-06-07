import {
  Injectable,
  NestMiddleware,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantService, ResolvedTenant } from './tenant.service';
import { runWithRequestContext } from '../common/request-context';

// Extender Request para incluir tenant
declare global {
  namespace Express {
    interface Request {
      tenant?: ResolvedTenant;
      clientTimeZone?: string;
      clientUtcOffsetMinutes?: number;
    }
  }
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(private tenantService: TenantService) {}

  async use(req: Request, res: Response, next: NextFunction) {
const origin = req.get('origin');

const host = origin
  ? new URL(origin).hostname
  : (req.get('host') || 'localhost');
    //const origin = req.get('origin');
    //const host = req.get('host') || 'localhost';
     this.logger.warn(`HOST RECIBIDO: ${host}`);
  this.logger.warn(`ORIGIN: ${req.get('origin') || 'N/A'}`);
  this.logger.warn(`X-FORWARDED-HOST: ${req.get('x-forwarded-host') || 'N/A'}`);
  console.log('====================');
console.log('HOST:', host);
console.log('ORIGIN:', req.get('origin'));
console.log('XFH:', req.get('x-forwarded-host'));
console.log('====================');

    const clientTimeZone = String(req.get('x-client-timezone') || '').trim();
    const clientUtcOffsetRaw = String(req.get('x-client-utc-offset-minutes') || '').trim();
    const clientUtcOffsetParsed = Number.parseInt(clientUtcOffsetRaw, 10);

    if (clientTimeZone) {
      req.clientTimeZone = clientTimeZone;
    }
    if (Number.isFinite(clientUtcOffsetParsed)) {
      req.clientUtcOffsetMinutes = clientUtcOffsetParsed;
    }

    return runWithRequestContext(
      {
        clientTimeZone: req.clientTimeZone,
        clientUtcOffsetMinutes: req.clientUtcOffsetMinutes,
      },
      async () => {
        try {
          // Resolver tenant desde el dominio
          this.logger.warn('====================');
this.logger.warn(`PATH: ${req.originalUrl}`);
this.logger.warn(`METHOD: ${req.method}`);
this.logger.warn(`HOST: ${req.get('host')}`);
this.logger.warn(`ORIGIN: ${req.get('origin') || 'N/A'}`);
this.logger.warn(`REFERER: ${req.get('referer') || 'N/A'}`);
this.logger.warn(`X-FORWARDED-HOST: ${req.get('x-forwarded-host') || 'N/A'}`);
this.logger.warn(`HOST FINAL USADO: ${host}`);
          const tenant = await this.tenantService.resolveTenant(host);
          

          // Validar si está suspendido (prioridad sobre isActive)
          if (tenant.suspendedAt) {
            this.logger.warn(
              `❌ Intento de acceso a tenant suspendido: ${tenant.name} (razón: ${tenant.suspendReason || 'N/A'})`,
            );
            throw new UnauthorizedException({
              statusCode: 403,
              message: 'TENANT_SUSPENDED',
              details: {
                tenantName: tenant.name,
                suspendedAt: tenant.suspendedAt,
                reason: tenant.suspendReason || 'Suspensión administrativa',
              },
            });
          }

          // Validar que esté activo
          if (!tenant.isActive) {
            this.logger.warn(
              `❌ Intento de acceso a tenant inactivo: ${tenant.name}`,
            );
            throw new UnauthorizedException({
              statusCode: 403,
              message: 'TENANT_INACTIVE',
              details: {
                tenantName: tenant.name,
              },
            });
          }

          // Adjuntar tenant al request
          req.tenant = tenant;

          this.logger.debug(
            `✅ Tenant resuelto: ${tenant.name} (${tenant.subdomain})`,
          );
          next();
        } catch (error) {
          // Si ya es un error de autorización, propagarlo
          if (error instanceof UnauthorizedException) {
            throw error;
          }

          this.logger.error(`❌ Error resolviendo tenant para ${host}:`, error);
          throw new UnauthorizedException(
            `No se pudo identificar el tenant para este dominio`,
          );
        }
      },
    );
  }
}
