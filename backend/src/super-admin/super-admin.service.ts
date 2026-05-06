import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto, UpdateTenantStatusDto, TenantStatusAction } from './dto';
import { hash } from 'bcryptjs';
import { UserRole } from '@prisma/client';

@Injectable()
export class SuperAdminService {
  private readonly logger = new Logger(SuperAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 📋 Listar todos los tenants de la plataforma
   * Super admin puede ver todos los tenants sin filtro de RLS
   */
  async getAllTenants() {
    this.logger.log('📋 Super admin: listando todos los tenants');
    
    // Bypass RLS para operar cross-tenant
    await this.prisma.bypassRLS();

    const tenants = await this.prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        subdomain: true,
        customDomain: true,
        contractPrefix: true,
        isActive: true,
        suspendedAt: true,
        suspendReason: true,
        planType: true,
        planExpiresAt: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            users: true,
            clients: true,
            contracts: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Re-habilitar RLS después de la operación
    await this.prisma.enableRLS();

    return tenants;
  }

  /**
   * 🔍 Obtener detalles completos de un tenant específico
   * Incluye información del admin inicial y estadísticas
   */
  async getTenantById(tenantId: string) {
    this.logger.log(`🔍 Super admin: obteniendo detalles de tenant ${tenantId}`);
    
    // Bypass RLS para operar cross-tenant
    await this.prisma.bypassRLS();

    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        include: {
          users: {
            where: { role: UserRole.ADMIN },
            select: {
              id: true,
              email: true,
              fullName: true,
              role: true,
              isActive: true,
              createdAt: true,
            },
          },
          _count: {
            select: {
              users: true,
              clients: true,
              contracts: true,
            },
          },
        },
      });

      if (!tenant) {
        throw new NotFoundException(`Tenant con ID ${tenantId} no encontrado`);
      }

      // Re-habilitar RLS después de la operación
      await this.prisma.enableRLS();

      return {
        id: tenant.id,
        name: tenant.name,
        subdomain: tenant.subdomain,
        customDomain: tenant.customDomain,
        contractPrefix: tenant.contractPrefix,
        isActive: tenant.isActive,
        suspendedAt: tenant.suspendedAt,
        suspendReason: tenant.suspendReason,
        planType: tenant.planType,
        planExpiresAt: tenant.planExpiresAt,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
        // Branding
        logoUrl: tenant.logoUrl,
        signatureUrl: tenant.signatureUrl,
        emailLogoUrl: tenant.emailLogoUrl,
        primaryColor: tenant.primaryColor,
        secondaryColor: tenant.secondaryColor,
        // Legal info
        legalName: tenant.legalName,
        legalId: tenant.legalId,
        representativeName: tenant.representativeName,
        representativeId: tenant.representativeId,
        representativeTitle: tenant.representativeTitle,
        representativeMaritalStatus: tenant.representativeMaritalStatus,
        representativeAddress: tenant.representativeAddress,
        representativePowers: tenant.representativePowers,
        // Admin users
        admins: tenant.users,
        // Counts
        counts: {
          users: tenant._count.users,
          clients: tenant._count.clients,
          contracts: tenant._count.contracts,
        },
      };
    } catch (error) {
      // Asegurarse de re-habilitar RLS en caso de error
      await this.prisma.enableRLS();
      throw error;
    }
  }

  /**
   * 🏢 Crear un nuevo tenant con su usuario admin inicial
   * Solo super admins pueden crear tenants
   */
  async createTenant(dto: CreateTenantDto) {
    this.logger.log(`🏢 Super admin: creando tenant "${dto.name}"`);

    // Bypass RLS para crear tenant
    await this.prisma.bypassRLS();

    try {
      // Validar que el subdomain no exista
      const existingSubdomain = await this.prisma.tenant.findUnique({
        where: { subdomain: dto.subdomain },
      });

      if (existingSubdomain) {
        throw new ConflictException(`El subdomain "${dto.subdomain}" ya está en uso`);
      }

      // Validar que el contractPrefix no exista
      const existingPrefix = await this.prisma.tenant.findFirst({
        where: { contractPrefix: dto.contractPrefix },
      });

      if (existingPrefix) {
        throw new ConflictException(
          `El contractPrefix "${dto.contractPrefix}" ya está en uso`,
        );
      }

      // Validar que el email del admin no exista
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: dto.adminEmail },
      });

      if (existingEmail) {
        throw new ConflictException(`El email "${dto.adminEmail}" ya está en uso`);
      }

      // Crear tenant y admin en una transacción
      const result = await this.prisma.$transaction(async (tx) => {
        // Dentro de la transacción también necesitamos bypass RLS
        await tx.$executeRawUnsafe(`SET LOCAL row_security = off`);

        // Crear el tenant (sin logos, el tenant los configurará después)
        const tenant = await tx.tenant.create({
          data: {
            name: dto.name,
            subdomain: dto.subdomain,
            contractPrefix: dto.contractPrefix,
            customDomain: dto.customDomain,
            isActive: true,
            planType: 'FREE',
            // Branding vacío - el tenant lo configura después
            primaryColor: null,
            secondaryColor: null,
            logoUrl: null,
            emailLogoUrl: null,
            signatureUrl: null,
          },
        });

        // Crear el usuario admin para este tenant
        const passwordHash = await hash(dto.adminPassword, 10);
        const admin = await tx.user.create({
          data: {
            email: dto.adminEmail,
            fullName: dto.adminFullName,
            passwordHash,
            role: UserRole.ADMIN,
            tenantId: tenant.id,
            isActive: true,
          },
        });

        return { tenant, admin };
      });

      this.logger.log(
        `✅ Tenant "${result.tenant.name}" creado exitosamente con admin ${result.admin.email}`,
      );

      return {
        tenant: {
          id: result.tenant.id,
          name: result.tenant.name,
          subdomain: result.tenant.subdomain,
          contractPrefix: result.tenant.contractPrefix,
          isActive: result.tenant.isActive,
        },
        admin: {
          id: result.admin.id,
          email: result.admin.email,
          fullName: result.admin.fullName,
        },
      };
    } finally {
      // Re-habilitar RLS después de la operación
      await this.prisma.enableRLS();
    }
  }

  /**
   * 🔒 Activar o suspender un tenant
   * Solo super admins pueden cambiar el status de tenants
   */
  async updateTenantStatus(tenantId: string, dto: UpdateTenantStatusDto) {
    this.logger.log(`🔒 Super admin: ${dto.action} tenant ${tenantId}`);

    // Bypass RLS para operar cross-tenant
    await this.prisma.bypassRLS();

    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });

      if (!tenant) {
        throw new NotFoundException(`Tenant con ID ${tenantId} no encontrado`);
      }

      if (dto.action === TenantStatusAction.SUSPEND) {
        // Suspender tenant
        if (tenant.suspendedAt) {
          throw new BadRequestException('El tenant ya está suspendido');
        }

        const updated = await this.prisma.tenant.update({
          where: { id: tenantId },
          data: {
            isActive: false,
            suspendedAt: new Date(),
            suspendReason: dto.reason || 'Sin razón especificada',
          },
        });

        this.logger.log(`⛔ Tenant "${tenant.name}" suspendido`);
        return updated;
      } else {
        // Activar tenant
        if (!tenant.suspendedAt) {
          throw new BadRequestException('El tenant ya está activo');
        }

        const updated = await this.prisma.tenant.update({
          where: { id: tenantId },
          data: {
            isActive: true,
            suspendedAt: null,
            suspendReason: null,
          },
        });

        this.logger.log(`✅ Tenant "${tenant.name}" activado`);
        return updated;
      }
    } finally {
      // Re-habilitar RLS después de la operación
      await this.prisma.enableRLS();
    }
  }

  /**
   * 📊 Obtener estadísticas de la plataforma
   */
  async getPlatformStats() {
    this.logger.log('📊 Super admin: obteniendo estadísticas de la plataforma');

    await this.prisma.bypassRLS();

    try {
      const [
        totalTenants,
        activeTenants,
        suspendedTenants,
        totalUsers,
        totalClients,
        totalContracts,
      ] = await Promise.all([
        this.prisma.tenant.count(),
        this.prisma.tenant.count({ where: { isActive: true, suspendedAt: null } }),
        this.prisma.tenant.count({ where: { isActive: false } }),
        this.prisma.user.count({ where: { tenantId: { not: null } } }), // Usuarios que no son super admins
        this.prisma.client.count(),
        this.prisma.contract.count(),
      ]);

      return {
        tenants: {
          total: totalTenants,
          active: activeTenants,
          suspended: suspendedTenants,
        },
        users: totalUsers,
        clients: totalClients,
        contracts: totalContracts,
      };
    } finally {
      await this.prisma.enableRLS();
    }
  }
}
