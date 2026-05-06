import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 🔒 RLS (Row Level Security) Interceptor
 * 
 * Automatically sets the PostgreSQL tenant context for EVERY authenticated request.
 * This ensures RLS policies filter data by tenantId at the database level.
 * 
 * HOW IT WORKS:
 * 1. Extracts tenantId from req.user (set by JWT strategy)
 * 2. For normal users: calls prisma.setTenantContext(tenantId)
 * 3. For super admins (tenantId = null): skips tenant context (bypasses RLS naturally)
 * 4. PostgreSQL RLS policies automatically filter all queries by this tenantId
 * 
 * WHEN IT RUNS:
 * - On every HTTP request (after authentication)
 * - Before any service/controller logic executes
 * - Only if user is authenticated (has req.user)
 * 
 * SKIP CONDITIONS:
 * - Public endpoints (no req.user)
 * - Super admins (tenantId = null) - they operate cross-tenant
 * - Endpoints that explicitly bypass RLS (seeds, migrations)
 */
@Injectable()
export class RLSInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RLSInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Skip if no user (public endpoint)
    if (!user) {
      return next.handle();
    }

    // Skip tenant context for super admins (tenantId = null)
    // Super admins operate cross-tenant and use bypassRLS() explicitly in services
    if (!user.tenantId) {
      this.logger.log(`🔓 RLS: Super admin detected (${user.email}), skipping tenant context`);
      return next.handle();
    }

    // 🔒 SET TENANT CONTEXT FOR RLS (normal users)
    try {
      await this.prisma.setTenantContext(user.tenantId);
      this.logger.debug(`🔒 RLS: Tenant context set to ${user.tenantId} for user ${user.email}`);
    } catch (error) {
      this.logger.error('❌ RLS: Failed to set tenant context in interceptor', error);
      // Continue anyway - let the request fail naturally if RLS blocks it
    }

    return next.handle();
  }
}
