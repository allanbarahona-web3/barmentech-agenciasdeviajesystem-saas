import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminSummaryQueryDto,
  CheckInDto,
  ConfigAttendanceDto,
  CorrectionEntryDto,
  FilterEntriesDto,
  PeriodFilterDto,
} from './dto';
import { AttendanceState } from './constants/attendance-state.constant';

interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  tenantId: string | null;
}

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminConfig(user: AuthUser, tenantId?: string) {
    const scope = this.resolveAdminTenantScope(user, tenantId);
    const resolvedTenantId = scope.tenantId;

    if (!resolvedTenantId) {
      throw new BadRequestException('tenantId es requerido para SUPER_ADMIN');
    }

    const config = await this.prisma.attendanceConfig.upsert({
      where: { tenantId: resolvedTenantId },
      create: {
        tenantId: resolvedTenantId,
      },
      update: {},
    });

    return config;
  }

  async updateAdminConfig(user: AuthUser, dto: ConfigAttendanceDto, tenantId?: string) {
    const scope = this.resolveAdminTenantScope(user, tenantId);
    const resolvedTenantId = scope.tenantId;
    const { systemHours, ...dtoWithoutSystemHours } = dto;

    const systemHoursData = typeof systemHours === 'undefined'
      ? {}
      : { systemHours: systemHours as unknown as Prisma.InputJsonValue };

    if (!resolvedTenantId) {
      throw new BadRequestException('tenantId es requerido para SUPER_ADMIN');
    }

    return this.prisma.attendanceConfig.upsert({
      where: { tenantId: resolvedTenantId },
      create: {
        tenantId: resolvedTenantId,
        ...dtoWithoutSystemHours,
        ...systemHoursData,
      },
      update: {
        ...dtoWithoutSystemHours,
        ...systemHoursData,
      },
    });
  }

  async checkIn(user: AuthUser, dto: CheckInDto) {
    if (!user.tenantId) {
      throw new BadRequestException('SUPER_ADMIN no registra asistencia.');
    }

    if (!['AGENT', 'OPERACIONES', 'VENTAS'].includes(user.role)) {
      throw new BadRequestException('Este rol no requiere asistencia.');
    }

    const now = new Date();
    const date = this.startOfDay(now);

    await this.closeLastOpenEntry(user.id, user.tenantId, now);

    const nextState = dto.state as AttendanceState;
    const entry = await this.prisma.attendanceEntry.create({
      data: {
        userId: user.id,
        tenantId: user.tenantId,
        date,
        type: nextState,
        clockIn: now,
        // OFF is only a shift-closing marker, it must not accumulate tracked time.
        clockOut: nextState === 'OFF' ? now : null,
        duration: nextState === 'OFF' ? 0 : null,
      },
    });

    await this.recalculateDailySummary(user.id, user.tenantId, date);

    const summary = await this.prisma.attendanceDailySummary.findUnique({
      where: {
        tenantId_userId_date: {
          tenantId: user.tenantId,
          userId: user.id,
          date,
        },
      },
    });

    return {
      success: true,
      currentState: entry.type,
      message: 'Marcaje registrado correctamente',
      paidHours: (summary?.paidMin || 0) / 60,
      effectiveHours: (summary?.effectiveMin || 0) / 60,
    };
  }

  async getStatus(user: AuthUser) {
    if (!user.tenantId) {
      return {
        currentState: null,
        clockedInAt: null,
        sessionDuration: 0,
        paidSoFar: 0,
        effectiveSoFar: 0,
        isWithinSystemHours: true,
      };
    }

    const date = this.startOfDay(new Date());

    const [lastOpenEntry, hasOffEntry] = await Promise.all([
      this.prisma.attendanceEntry.findFirst({
        where: {
          tenantId: user.tenantId,
          userId: user.id,
          date,
          clockOut: null,
        },
        orderBy: { clockIn: 'desc' },
      }),
      this.prisma.attendanceEntry.findFirst({
        where: {
          tenantId: user.tenantId,
          userId: user.id,
          date,
          type: 'OFF',
        },
        select: { id: true },
      }),
    ]);

    const summary = await this.prisma.attendanceDailySummary.findUnique({
      where: {
        tenantId_userId_date: {
          tenantId: user.tenantId,
          userId: user.id,
          date,
        },
      },
    });

    const resolvedStatus = {
      currentState: lastOpenEntry
        ? lastOpenEntry.type
        : (hasOffEntry ? 'OFF' : null),
      clockedInAt: lastOpenEntry && lastOpenEntry.type !== 'OFF'
        ? lastOpenEntry.clockIn
        : null,
      sessionDuration: lastOpenEntry && lastOpenEntry.type !== 'OFF'
        ? Math.max(0, Math.floor((Date.now() - lastOpenEntry.clockIn.getTime()) / 60000))
        : 0,
      paidSoFar: summary?.paidMin || 0,
      effectiveSoFar: summary?.effectiveMin || 0,
      isWithinSystemHours: true,
    };

    return resolvedStatus;
  }

  async getToday(user: AuthUser) {
    if (!user.tenantId) {
      return { entries: [], summary: null };
    }

    const date = this.startOfDay(new Date());

    const [entries, summary] = await Promise.all([
      this.prisma.attendanceEntry.findMany({
        where: {
          tenantId: user.tenantId,
          userId: user.id,
          date,
        },
        orderBy: { clockIn: 'asc' },
      }),
      this.prisma.attendanceDailySummary.findUnique({
        where: {
          tenantId_userId_date: {
            tenantId: user.tenantId,
            userId: user.id,
            date,
          },
        },
      }),
    ]);

    const correctionCounts = entries.length > 0
      ? await this.prisma.attendanceCorrection.groupBy({
          by: ['entryId'],
          where: {
            tenantId: user.tenantId,
            entryId: { in: entries.map((entry) => entry.id) },
          },
          _count: { _all: true },
        })
      : [];

    const countMap = new Map(correctionCounts.map((item) => [item.entryId, item._count._all]));

    const sanitizedEntries = entries.map((entry) => {
      if (entry.type !== 'OFF') {
        return {
          ...entry,
          correctionCount: countMap.get(entry.id) || 0,
        };
      }

      return {
        ...entry,
        duration: 0,
        correctionCount: countMap.get(entry.id) || 0,
      };
    });

    return { entries: sanitizedEntries, summary };
  }

  async getMySummary(user: AuthUser, query: PeriodFilterDto) {
    if (!user.tenantId) {
      return {
        totalPaidHours: 0,
        totalEffectiveHours: 0,
        totalOtHours: 0,
        avgEfficiency: 0,
        workingDays: 0,
      };
    }

    const startDate = this.startOfDay(new Date(query.startDate));
    const endDate = this.endOfDay(new Date(query.endDate));

    const summaries = await this.prisma.attendanceDailySummary.findMany({
      where: {
        tenantId: user.tenantId,
        userId: user.id,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const totals = summaries.reduce(
      (acc, current) => {
        acc.paidMin += current.paidMin;
        acc.effectiveMin += current.effectiveMin;
        acc.otMin += current.otMin;
        return acc;
      },
      { paidMin: 0, effectiveMin: 0, otMin: 0 },
    );

    const avgEfficiency = totals.paidMin > 0
      ? Number(((totals.effectiveMin / totals.paidMin) * 100).toFixed(2))
      : 0;

    return {
      totalPaidHours: Number((totals.paidMin / 60).toFixed(2)),
      totalEffectiveHours: Number((totals.effectiveMin / 60).toFixed(2)),
      totalOtHours: Number((totals.otMin / 60).toFixed(2)),
      avgEfficiency,
      workingDays: summaries.length,
    };
  }

  async getAdminEntries(user: AuthUser, query: FilterEntriesDto) {
    const tenantScope = this.resolveAdminTenantScope(user, query.tenantId);
    const dateFilter = query.date
      ? { date: this.startOfDay(new Date(query.date)) }
      : (query.startDate || query.endDate)
      ? {
          date: {
            ...(query.startDate ? { gte: this.startOfDay(new Date(query.startDate)) } : {}),
            ...(query.endDate ? { lte: this.endOfDay(new Date(query.endDate)) } : {}),
          },
        }
      : {};

    return this.prisma.attendanceEntry.findMany({
      where: {
        ...tenantScope,
        userId: query.userId,
        type: query.type as AttendanceState | undefined,
        isOT: query.isOT,
        exceeded: query.exceeded,
        ...dateFilter,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: { clockIn: 'desc' },
      skip: query.offset || 0,
      take: query.limit || 50,
    });
  }

  async getAdminSummaries(user: AuthUser, query: AdminSummaryQueryDto) {
    const tenantScope = this.resolveAdminTenantScope(user, query.tenantId);

    return this.prisma.attendanceDailySummary.findMany({
      where: {
        ...tenantScope,
        date: {
          gte: this.startOfDay(new Date(query.startDate)),
          lte: this.endOfDay(new Date(query.endDate)),
        },
      },
      orderBy: { date: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });
  }

  async correctEntry(user: AuthUser, entryId: string, dto: CorrectionEntryDto) {
    const existing = await this.prisma.attendanceEntry.findUnique({ where: { id: entryId } });

    if (!existing) {
      throw new NotFoundException('Marcaje no encontrado');
    }

    if (user.role !== 'SUPER_ADMIN' && existing.tenantId !== user.tenantId) {
      throw new NotFoundException('Marcaje no encontrado en tu tenant');
    }

    if (!existing.clockOut) {
      throw new BadRequestException('No se puede corregir una sesión activa. Finaliza el shift primero.');
    }

    const todayStart = this.startOfDay(new Date());
    const entryDayStart = this.startOfDay(existing.date);
    if (entryDayStart.getTime() >= todayStart.getTime()) {
      throw new BadRequestException('Las correcciones manuales solo se permiten en días anteriores. Aplica al día siguiente.');
    }

    const updated = await this.prisma.attendanceEntry.update({
      where: { id: entryId },
      data: {
        type: (dto.type as AttendanceState | undefined) ?? existing.type,
        clockIn: dto.clockIn ? new Date(dto.clockIn) : existing.clockIn,
        clockOut: dto.clockOut ? new Date(dto.clockOut) : existing.clockOut,
      },
    });

    const correctedDuration = updated.clockOut
      ? Math.max(0, Math.floor((updated.clockOut.getTime() - updated.clockIn.getTime()) / 1000))
      : null;

    await this.prisma.attendanceEntry.update({
      where: { id: updated.id },
      data: {
        duration: correctedDuration,
      },
    });

    await this.prisma.attendanceCorrection.create({
      data: {
        tenantId: existing.tenantId,
        entryId: existing.id,
        correctedByUserId: user.id,
        reason: dto.reason,
        beforeType: existing.type,
        beforeClockIn: existing.clockIn,
        beforeClockOut: existing.clockOut,
        beforeDuration: existing.duration,
        afterType: updated.type,
        afterClockIn: updated.clockIn,
        afterClockOut: updated.clockOut,
        afterDuration: correctedDuration,
      },
    });

    await this.recalculateDailySummary(existing.userId, existing.tenantId, existing.date);

    return { success: true, message: 'Marcaje corregido correctamente' };
  }

  async getEntryCorrections(user: AuthUser, entryId: string) {
    const entry = await this.prisma.attendanceEntry.findUnique({
      where: { id: entryId },
    });

    if (!entry) {
      throw new NotFoundException('Marcaje no encontrado');
    }

    // Verify user has access to this entry
    if (user.role !== 'SUPER_ADMIN' && entry.tenantId !== user.tenantId) {
      throw new NotFoundException('No tienes acceso a este marcaje');
    }

    // User can see corrections if: ADMIN/SUPER_ADMIN or own entry
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN' && entry.userId !== user.id) {
      throw new NotFoundException('No tienes acceso a las correcciones de este marcaje');
    }

    return this.prisma.attendanceCorrection.findMany({
      where: {
        entryId,
        tenantId: user.role === 'SUPER_ADMIN' ? undefined : user.tenantId || undefined,
      },
      include: {
        correctedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private resolveAdminTenantScope(user: AuthUser, tenantId?: string) {
    if (user.role === 'SUPER_ADMIN') {
      return tenantId ? { tenantId } : {};
    }

    if (!user.tenantId) {
      throw new BadRequestException('Tenant no disponible para este usuario');
    }

    return { tenantId: user.tenantId };
  }

  private startOfDay(date: Date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private endOfDay(date: Date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  private async closeLastOpenEntry(userId: string, tenantId: string, now: Date) {
    const date = this.startOfDay(now);
    const lastOpen = await this.prisma.attendanceEntry.findFirst({
      where: {
        userId,
        tenantId,
        date,
        clockOut: null,
      },
      orderBy: { clockIn: 'desc' },
    });

    if (!lastOpen) {
      return;
    }

    const durationSeconds = lastOpen.type === 'OFF'
      ? 0
      : Math.max(0, Math.floor((now.getTime() - lastOpen.clockIn.getTime()) / 1000));

    await this.prisma.attendanceEntry.update({
      where: { id: lastOpen.id },
      data: {
        clockOut: now,
        duration: durationSeconds,
      },
    });
  }

  private async recalculateDailySummary(userId: string, tenantId: string, date: Date) {
    const entries = await this.prisma.attendanceEntry.findMany({
      where: { userId, tenantId, date },
    });

    const totals = {
      workingMin: 0,
      meetingMin: 0,
      break1Min: 0,
      break2Min: 0,
      break3Min: 0,
      lunchMin: 0,
      otMin: 0,
      excessBreaksMin: 0,
      excessLunchMin: 0,
    };

    for (const entry of entries) {
      const minutes = (entry.duration || 0) / 60;
      switch (entry.type) {
        case 'WORKING':
          totals.workingMin += minutes;
          break;
        case 'MEETING':
          totals.meetingMin += minutes;
          break;
        case 'BREAK1':
          totals.break1Min += minutes;
          break;
        case 'BREAK2':
          totals.break2Min += minutes;
          break;
        case 'BREAK3':
          totals.break3Min += minutes;
          break;
        case 'LUNCH':
          totals.lunchMin += minutes;
          break;
        default:
          break;
      }

      if (entry.type === 'LUNCH' && entry.excessMinutes) {
        totals.excessLunchMin += entry.excessMinutes;
      }

      if (entry.type !== 'LUNCH' && entry.excessMinutes) {
        totals.excessBreaksMin += entry.excessMinutes;
      }
    }

    const effectiveMin = totals.workingMin + totals.meetingMin;
    const paidMin = totals.workingMin + totals.meetingMin + totals.break1Min + totals.break2Min + totals.break3Min;
    const totalMin = paidMin + totals.lunchMin;
    const otMin = Math.max(0, effectiveMin - 8 * 60);

    await this.prisma.attendanceDailySummary.upsert({
      where: {
        tenantId_userId_date: {
          tenantId,
          userId,
          date,
        },
      },
      create: {
        tenantId,
        userId,
        date,
        ...totals,
        otMin,
        effectiveMin,
        paidMin,
        totalMin,
        isComplete: entries.some((e) => e.type === 'OFF'),
        hasOT: otMin > 0,
      },
      update: {
        ...totals,
        otMin,
        effectiveMin,
        paidMin,
        totalMin,
        isComplete: entries.some((e) => e.type === 'OFF'),
        hasOT: otMin > 0,
      },
    });
  }
}
