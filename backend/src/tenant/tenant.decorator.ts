import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { ResolvedTenant } from './tenant.service';

/**
 * Decorador para acceder al tenant resuelto desde el request.
 * 
 * Debe usarse junto con TenantMiddleware (registrado globalmente).
 * 
 * Ejemplo:
 * @Get('config')
 * getTenantConfig(@Tenant() tenant: ResolvedTenant) {
 *   return { name: tenant.name, prefix: tenant.contractPrefix };
 * }
 */
export const Tenant = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): ResolvedTenant => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.tenant as ResolvedTenant;
  },
);
