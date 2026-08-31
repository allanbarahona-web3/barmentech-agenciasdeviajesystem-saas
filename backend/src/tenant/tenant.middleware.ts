import {
  Injectable,
  NestMiddleware,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantService, ResolvedTenant } from './tenant.service';
import { runWithRequestContext } from '../common/request-context';

const safePrismaErrorCode = (error: unknown): string | null => {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && /^P\d{4}$/.test(code) ? code : null;
};

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
          next();
        } catch (error) {
          // Preserve explicit tenant authorization failures.
          if (error instanceof UnauthorizedException) {
            throw error;
          }

          // Preserve the established invalid-domain contract without conflating
          // it with database or infrastructure availability.
          if (error instanceof NotFoundException) {
            this.logger.warn('Tenant resolution failed category=TENANT_NOT_FOUND');
            throw new UnauthorizedException(
              'No se pudo identificar el tenant para este dominio',
            );
          }

          const prismaCode = safePrismaErrorCode(error);
          this.logger.error(
            prismaCode
              ? `Tenant resolution failed category=PRISMA code=${prismaCode}`
              : 'Tenant resolution failed category=INFRASTRUCTURE',
          );
          throw new ServiceUnavailableException(
            'Servicio temporalmente no disponible',
          );
        }
      },
    );
  }
}
