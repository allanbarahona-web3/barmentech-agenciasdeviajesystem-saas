import { INestApplication, Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    
    // 🔒 RLS ya está habilitado en las tablas (ENABLE ROW LEVEL SECURITY en migraciones)
    // No necesitamos hacer nada aquí, solo verificar que la conexión funciona
    this.logger.log('✅ PrismaService conectado - RLS habilitado en tablas');
  }

  async enableShutdownHooks(app: INestApplication) {
    this.$on("beforeExit" as never, async () => {
      await app.close();
    });
  }

  /**
   * 🔒 SET TENANT CONTEXT FOR RLS (Row Level Security)
   * 
   * MUST be called at the start of EVERY request that accesses tenant data.
   * Sets the PostgreSQL session variable that RLS policies use to filter data.
   * 
   * @param tenantId - The tenant ID from the authenticated user (req.user.tenantId)
   * 
   * @example
   * // In a service method:
   * await this.prisma.setTenantContext(user.tenantId);
   * const contracts = await this.prisma.contract.findMany(); // Automatically filtered by RLS
   */
  async setTenantContext(tenantId: string): Promise<void> {
    if (!tenantId || typeof tenantId !== 'string') {
      this.logger.error('❌ RLS: Invalid tenantId provided to setTenantContext');
      throw new Error('setTenantContext requires a valid tenantId');
    }

    try {
      // Usar $executeRawUnsafe con la sintaxis correcta de PostgreSQL
      await this.$executeRawUnsafe(`SET LOCAL app.current_tenant_id TO '${tenantId}'`);
      this.logger.debug(`🔒 RLS: Tenant context set to ${tenantId}`);
    } catch (error) {
      this.logger.error('❌ RLS: Failed to set tenant context', error);
      throw error;
    }
  }

  /**
   * 🔓 BYPASS RLS FOR SYSTEM OPERATIONS
   * 
   * WARNING: Use ONLY for:
   * - Seeds (creating initial tenants/users)
   * - Migrations (data transformations)
   * - System-level operations (not user requests)
   * 
   * This disables Row Level Security for the current transaction.
   * 
   * @example
   * // In seed.ts:
   * await prisma.bypassRLS();
   * await prisma.tenant.create({ data: { ... } }); // RLS bypassed
   */
  async bypassRLS(): Promise<void> {
    try {
      await this.$executeRaw`SET LOCAL row_security = off`;
      this.logger.warn('🔓 RLS: Row Level Security DISABLED for this transaction');
    } catch (error) {
      this.logger.error('❌ RLS: Failed to bypass RLS', error);
      throw error;
    }
  }

  /**
   * 🔒 RE-ENABLE RLS AFTER BYPASS
   * 
   * Manually re-enables RLS if it was bypassed.
   * Note: RLS is automatically re-enabled when the transaction ends.
   */
  async enableRLS(): Promise<void> {
    try {
      await this.$executeRaw`SET LOCAL row_security = on`;
      this.logger.debug('🔒 RLS: Row Level Security re-enabled');
    } catch (error) {
      this.logger.error('❌ RLS: Failed to enable RLS', error);
      throw error;
    }
  }
}
