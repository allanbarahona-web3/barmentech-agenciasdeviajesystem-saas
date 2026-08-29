import {
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { TenantService } from './tenant.service';
import { TenantMiddleware } from './tenant.middleware';

describe('TenantMiddleware error classification', () => {
  it('preserves a genuine UnauthorizedException as HTTP 401', async () => {
    const original = new UnauthorizedException('SESSION_INVALID');
    const context = subject(original);

    const error = await capture(context.middleware.use(context.req, context.res, context.next));

    expect(error).toBe(original);
    expect((error as UnauthorizedException).getStatus()).toBe(401);
    expect(context.next).not.toHaveBeenCalled();
  });

  it.each(['P1001', 'P2024'])(
    'maps Prisma %s to a safe HTTP 503 instead of HTTP 401',
    async (code) => {
      const native = Object.assign(
        new Error('Cannot reach secret-db.example.test:25060 password=secret'),
        { code },
      );
      const context = subject(native);

      const error = await capture(context.middleware.use(context.req, context.res, context.next));

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getStatus()).toBe(503);
      expect(error).not.toBeInstanceOf(UnauthorizedException);
      expect(JSON.stringify((error as ServiceUnavailableException).getResponse())).toBe(
        '{"message":"Servicio temporalmente no disponible","error":"Service Unavailable","statusCode":503}',
      );
      expect(context.logger.error).toHaveBeenCalledWith(
        `Tenant resolution failed category=PRISMA code=${code}`,
      );
      expect(JSON.stringify(context.logger.error.mock.calls)).not.toContain('secret-db');
      expect(JSON.stringify(context.logger.error.mock.calls)).not.toContain('password');
    },
  );

  it('maps a generic infrastructure failure to a safe HTTP 503', async () => {
    const context = subject(new Error('native internal detail'));

    const error = await capture(context.middleware.use(context.req, context.res, context.next));

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getStatus()).toBe(503);
    expect(error).not.toBeInstanceOf(UnauthorizedException);
    expect(JSON.stringify((error as ServiceUnavailableException).getResponse())).not.toContain(
      'native internal detail',
    );
    expect(context.logger.error).toHaveBeenCalledWith(
      'Tenant resolution failed category=INFRASTRUCTURE',
    );
  });

  it('preserves the established unresolved-tenant HTTP 401 contract', async () => {
    const context = subject(new NotFoundException('tenant and domain details'));

    const error = await capture(context.middleware.use(context.req, context.res, context.next));

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).getStatus()).toBe(401);
    expect((error as UnauthorizedException).getResponse()).toEqual({
      message: 'No se pudo identificar el tenant para este dominio',
      error: 'Unauthorized',
      statusCode: 401,
    });
    expect(context.logger.warn).toHaveBeenCalledWith(
      'Tenant resolution failed category=TENANT_NOT_FOUND',
    );
    expect(JSON.stringify(context.logger.warn.mock.calls)).not.toContain(
      'tenant and domain details',
    );
  });
});

function subject(error: unknown) {
  const tenantService = {
    resolveTenant: jest.fn().mockRejectedValue(error),
  } as unknown as TenantService;
  const middleware = new TenantMiddleware(tenantService);
  const logger = { error: jest.fn(), warn: jest.fn() };
  Object.assign(middleware, { logger });
  const req = {
    get: jest.fn((header: string) => {
      if (header === 'origin') return 'https://tenant.example.test';
      return undefined;
    }),
  } as unknown as Request;

  return {
    middleware,
    logger,
    req,
    res: {} as Response,
    next: jest.fn() as unknown as NextFunction,
  };
}

async function capture(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error('Expected middleware to reject');
  } catch (error) {
    return error;
  }
}
