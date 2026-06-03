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
  private static readonly DEFAULT_COMPANY_NAME = 'Empresa';
  
  constructor(private readonly prisma: PrismaService) {}

  private normalizeAccountValue(value: string) {
    return String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[\s\-]/g, '');
  }

  private async getTenantCompanyName(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    const tenantName = String(tenant?.name || '').trim();
    return tenantName || CompanyBankAccountsService.DEFAULT_COMPANY_NAME;
  }

  async create(
    dto: CreateBankAccountDto,
    userId: string,
    userName: string,
    tenantId: string,
  ) {
    const trimmedAccountNumber = String(dto.accountNumber || '').trim();
    const normalizedInput = this.normalizeAccountValue(trimmedAccountNumber);
    if (!normalizedInput) {
      throw new BadRequestException('El número de cuenta es requerido');
    }

    const tenantAccounts = await this.prisma.companyBankAccount.findMany({
      where: { tenantId },
      select: { id: true, accountNumber: true },
    });

    // 🔒 SEGURIDAD: Unicidad por tenant usando normalización (espacios/guiones/case-insensitive)
    const existing = tenantAccounts.find(
      (account) => this.normalizeAccountValue(account.accountNumber) === normalizedInput,
    );

    if (existing) {
      throw new ConflictException(
        `Ya existe una cuenta bancaria con el número: ${trimmedAccountNumber}`,
      );
    }

    const companyName =
      String(dto.companyName || '').trim() ||
      (await this.getTenantCompanyName(tenantId));

    return this.prisma.companyBankAccount.create({
      data: {
        ...dto,
        accountNumber: trimmedAccountNumber,
        companyName,
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

  async findByAccountNumber(accountNumber: string, tenantId: string) {
    const original = String(accountNumber || '');
    const normalized = this.normalizeAccountValue(original); // Eliminar espacios y guiones
    
    this.logger.log(`🔎 findByAccountNumber [tenant=${tenantId}]: "${original}" → normalizado: "${normalized}"`);
    
    if (!normalized) {
      this.logger.warn('⚠️ Búsqueda vacía, retornando null');
      return null;
    }

    // Buscar únicamente dentro del tenant actual
    const allAccounts = await this.prisma.companyBankAccount.findMany({
      where: { tenantId },
    });

    this.logger.log(`📋 Total cuentas en DB: ${allAccounts.length}`);

    // Buscar con normalización (quitar espacios, guiones, mayúsculas)
    const found = allAccounts.find((acc) => {
      const accNum = this.normalizeAccountValue(acc.accountNumber);
      const sinpeNum = this.normalizeAccountValue(acc.sinpeNumber || '');
      
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

    const updateData: UpdateBankAccountDto = { ...dto };

    if (dto.accountNumber !== undefined) {
      const trimmedAccountNumber = String(dto.accountNumber || '').trim();
      const normalizedInput = this.normalizeAccountValue(trimmedAccountNumber);
      if (!normalizedInput) {
        throw new BadRequestException('El número de cuenta es requerido');
      }

      const tenantAccounts = await this.prisma.companyBankAccount.findMany({
        where: {
          tenantId,
          NOT: { id },
        },
        select: { id: true, accountNumber: true },
      });

      const existing = tenantAccounts.find(
        (account) => this.normalizeAccountValue(account.accountNumber) === normalizedInput,
      );

      if (existing) {
        throw new ConflictException(
          `Ya existe otra cuenta con el número: ${trimmedAccountNumber}`,
        );
      }

      updateData.accountNumber = trimmedAccountNumber;
    }

    if (dto.companyName !== undefined) {
      updateData.companyName =
        String(dto.companyName || '').trim() ||
        (await this.getTenantCompanyName(tenantId));
    }

    return this.prisma.companyBankAccount.update({
      where: { id },
      data: updateData,
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
