import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { ListBankAccountsDto } from './dto/list-bank-accounts.dto';

@Injectable()
export class CompanyBankAccountsService {
  private readonly logger = new Logger(CompanyBankAccountsService.name);
  
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateBankAccountDto,
    userId: string,
    userName: string,
    tenantId: string,
  ) {
    // 🔒 SEGURIDAD: Verificar unicidad DENTRO del tenant (dos tenants pueden tener mismo número)
    const existing = await this.prisma.companyBankAccount.findFirst({
      where: { 
        accountNumber: dto.accountNumber,
        tenantId: tenantId,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe una cuenta bancaria con el número: ${dto.accountNumber}`,
      );
    }

    return this.prisma.companyBankAccount.create({
      data: {
        ...dto,
        isActive: dto.isActive ?? true,
        createdByUserId: userId,
        createdByName: userName,
        tenantId,
      },
    });
  }

  async findAll(filters: ListBankAccountsDto, tenantId: string) {
    const where: any = {
      tenantId,
    };

    if (filters.bankName) {
      where.bankName = { contains: filters.bankName, mode: 'insensitive' };
    }

    if (filters.currency) {
      where.currency = filters.currency;
    }

    if (filters.isActive && filters.isActive !== 'all') {
      where.isActive = filters.isActive === 'true';
    }

    const accounts = await this.prisma.companyBankAccount.findMany({
      where,
      orderBy: [
        { isActive: 'desc' },
        { bankName: 'asc' },
        { currency: 'asc' },
      ],
    });

    return accounts;
  }

  async findOne(id: string, tenantId: string) {
    const account = await this.prisma.companyBankAccount.findUnique({
      where: { id },
      include: {
        _count: {
          select: { payments: true },
        },
      },
    });

    if (!account) {
      throw new NotFoundException(
        `Cuenta bancaria con ID ${id} no encontrada`,
      );
    }

    // 🔒 SEGURIDAD: Validar que la cuenta pertenece al tenant
    if (account.tenantId !== tenantId) {
      throw new NotFoundException(
        `Cuenta bancaria con ID ${id} no encontrada`,
      );
    }

    return account;
  }

  async findByAccountNumber(accountNumber: string) {
    const original = String(accountNumber || '');
    const normalized = original
      .trim()
      .toUpperCase()
      .replace(/[\s\-]/g, ''); // Eliminar espacios y guiones
    
    this.logger.log(`🔎 findByAccountNumber: "${original}" → normalizado: "${normalized}"`);
    
    if (!normalized) {
      this.logger.warn('⚠️ Búsqueda vacía, retornando null');
      return null;
    }

    // Buscar en todas las cuentas activas e inactivas
    const allAccounts = await this.prisma.companyBankAccount.findMany();

    this.logger.log(`📋 Total cuentas en DB: ${allAccounts.length}`);

    // Buscar con normalización (quitar espacios, guiones, mayúsculas)
    const found = allAccounts.find((acc) => {
      const accNum = String(acc.accountNumber || '')
        .trim()
        .toUpperCase()
        .replace(/[\s\-]/g, '');
      const sinpeNum = String(acc.sinpeNumber || '')
        .trim()
        .toUpperCase()
        .replace(/[\s\-]/g, '');
      
      const matchAccNum = accNum === normalized;
      const matchSinpe = sinpeNum === normalized;
      
      if (matchAccNum || matchSinpe) {
        this.logger.log(
          `✅ Match encontrado: "${acc.accountNumber}" (${acc.bankName}, ${acc.currency})`,
        );
      }
      
      return matchAccNum || matchSinpe;
    });

    if (!found) {
      this.logger.warn(`❌ No se encontró cuenta para: "${normalized}"`);
      this.logger.debug(`Cuentas disponibles: ${allAccounts.map(a => 
        `${a.accountNumber} (${a.bankName})`
      ).join(', ')}`);
    }

    return found || null;
  }

  async update(id: string, dto: UpdateBankAccountDto, tenantId: string) {
    // Verificar que existe
    await this.findOne(id, tenantId);

    // Si está cambiando el número de cuenta, verificar que no exista
    if (dto.accountNumber) {
      const existing = await this.prisma.companyBankAccount.findFirst({
        where: {
          accountNumber: dto.accountNumber,
          tenantId: tenantId, // 🔒 SEGURIDAD: Validar dentro del tenant
          NOT: { id },
        },
      });

      if (existing) {
        throw new ConflictException(
          `Ya existe otra cuenta con el número: ${dto.accountNumber}`,
        );
      }
    }

    return this.prisma.companyBankAccount.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, tenantId: string) {
    const account = await this.findOne(id, tenantId);

    // Verificar que no tenga pagos asociados
    if ((account as any)._count.payments > 0) {
      throw new BadRequestException(
        `No se puede eliminar esta cuenta porque tiene ${(account as any)._count.payments} pagos asociados. Considera desactivarla en su lugar.`,
      );
    }

    return this.prisma.companyBankAccount.delete({
      where: { id },
    });
  }

  async toggleActive(id: string, tenantId: string) {
    const account = await this.findOne(id, tenantId);

    return this.prisma.companyBankAccount.update({
      where: { id },
      data: { isActive: !account.isActive },
    });
  }
}
