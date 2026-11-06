import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserRole } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import { ListPaginatedAdminEntriesDto } from './dto';

describe('AttendanceService.getPaginatedAdminEntries', () => {
  const adminUser = {
    id: 'admin-1',
    fullName: 'Admin User',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
    tenantId: 'tenant-a',
  };

  function createService() {
    const findMany = jest.fn();
    const count = jest.fn();
    const groupBy = jest.fn();
    const employeeFindMany = jest.fn();
    const tenantBillingConfigurationFindUnique = jest.fn().mockResolvedValue({
      fiscalTimezone: 'America/Costa_Rica',
    });
    const service = new AttendanceService({
      attendanceEntry: { findMany, count },
      attendanceCorrection: { groupBy },
      employee: { findMany: employeeFindMany },
      tenantBillingConfiguration: { findUnique: tenantBillingConfigurationFindUnique },
    } as any);

    return { service, findMany, count, groupBy, employeeFindMany, tenantBillingConfigurationFindUnique };
  }

  it('uses default pagination, tenant scope, stable order, and the minimal list select', async () => {
    const { service, findMany, count, groupBy } = createService();
    const query = new ListPaginatedAdminEntriesDto();
    const entries = [{
      id: 'entry-1',
      type: 'WORKING',
      date: new Date('2026-09-12T06:00:00.000Z'),
      clockIn: new Date('2026-09-12T08:00:00.000Z'),
      clockOut: null,
      duration: null,
      isOT: false,
      User: { id: 'user-1', fullName: 'Ana Example' },
    }];
    findMany.mockResolvedValue(entries);
    count.mockResolvedValue(51);
    groupBy.mockResolvedValue([{ entryId: 'entry-1', _count: { _all: 2 } }]);

    await expect(service.getPaginatedAdminEntries(adminUser, query)).resolves.toEqual({
      items: [{
        id: 'entry-1',
        type: 'WORKING',
        date: new Date('2026-09-12T06:00:00.000Z'),
        clockIn: new Date('2026-09-12T08:00:00.000Z'),
        clockOut: null,
        duration: null,
        isOT: false,
        correctionCount: 2,
        user: { id: 'user-1', fullName: 'Ana Example' },
      }],
      total: 51,
      page: 1,
      pageSize: 50,
      totalPages: 2,
    });

    const where = { tenantId: 'tenant-a', userId: undefined, type: undefined, isOT: undefined, exceeded: undefined };
    expect(findMany).toHaveBeenCalledWith({
      where,
      select: {
        id: true,
        type: true,
        date: true,
        clockIn: true,
        clockOut: true,
        duration: true,
        isOT: true,
        User: { select: { id: true, fullName: true } },
      },
      orderBy: [{ clockIn: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 50,
    });
    expect(count).toHaveBeenCalledWith({ where });
    expect(groupBy).toHaveBeenCalledWith({
      by: ['entryId'],
      where: { entryId: { in: ['entry-1'] }, tenantId: 'tenant-a' },
      _count: { _all: true },
    });
  });

  it('preserves filters and calculates the requested offset', async () => {
    const { service, findMany, count, groupBy } = createService();
    const query = plainToInstance(ListPaginatedAdminEntriesDto, {
      page: '3',
      pageSize: '25',
      userId: 'user-1',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      type: 'OT',
      isOT: 'true',
      exceeded: 'false',
    });
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(51);

    await expect(service.getPaginatedAdminEntries(adminUser, query)).resolves.toMatchObject({
      items: [],
      total: 51,
      page: 3,
      pageSize: 25,
      totalPages: 3,
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-a',
        userId: 'user-1',
        type: 'OT',
        isOT: true,
        exceeded: false,
        date: { gte: expect.any(Date), lte: expect.any(Date) },
      }),
      skip: 50,
      take: 25,
      orderBy: [{ clockIn: 'desc' }, { id: 'desc' }],
    }));
    expect(count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-a', userId: 'user-1' }),
    }));
    expect(groupBy).not.toHaveBeenCalled();
  });

  it('preserves SUPER_ADMIN tenant selection', async () => {
    const { service, findMany, count } = createService();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    const superAdmin = { ...adminUser, role: UserRole.SUPER_ADMIN, tenantId: null };
    const query = plainToInstance(ListPaginatedAdminEntriesDto, { tenantId: 'tenant-b' });

    await service.getPaginatedAdminEntries(superAdmin, query);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-b' }),
    }));
  });

  it('returns the persisted workday key when a corrected instant crosses into the next tenant day', async () => {
    const { service, findMany, count, groupBy } = createService();
    const storedWorkday = new Date('2026-11-05T05:00:00.000Z');
    const correctedClockIn = new Date('2026-11-06T05:30:00.000Z');
    findMany.mockResolvedValue([{
      id: 'entry-overnight-correction',
      type: 'WORKING',
      date: storedWorkday,
      clockIn: correctedClockIn,
      clockOut: new Date('2026-11-06T06:30:00.000Z'),
      duration: 3600,
      isOT: false,
      User: { id: 'user-1', fullName: 'Ana Example' },
    }]);
    count.mockResolvedValue(1);
    groupBy.mockResolvedValue([]);

    await expect(service.getPaginatedAdminEntries(adminUser, new ListPaginatedAdminEntriesDto())).resolves.toMatchObject({
      items: [{
        id: 'entry-overnight-correction',
        date: storedWorkday,
        clockIn: correctedClockIn,
      }],
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ date: true, clockIn: true }),
    }));
  });

  it('keeps the legacy array endpoint unchanged', async () => {
    const { service, findMany, groupBy } = createService();
    findMany.mockResolvedValue([]);

    await expect(service.getAdminEntries(adminUser, {})).resolves.toEqual([]);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: {
        User: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { clockIn: 'desc' },
      skip: 0,
      take: 50,
    }));
    expect(groupBy).not.toHaveBeenCalled();
  });

  it('returns alphabetically ordered, user-linked employee options with a minimal select', async () => {
    const { service, employeeFindMany } = createService();
    employeeFindMany.mockResolvedValue([
      { userId: 'user-1', fullName: 'Ana Example' },
      { userId: 'user-2', fullName: 'Bruno Example' },
    ]);

    await expect(service.getAdminEmployeeOptions(adminUser)).resolves.toEqual([
      { userId: 'user-1', fullName: 'Ana Example' },
      { userId: 'user-2', fullName: 'Bruno Example' },
    ]);

    expect(employeeFindMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        userId: { not: null },
      },
      select: {
        userId: true,
        fullName: true,
      },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    });
  });

  it('preserves SUPER_ADMIN employee-option tenant selection', async () => {
    const { service, employeeFindMany } = createService();
    employeeFindMany.mockResolvedValue([]);
    const superAdmin = { ...adminUser, role: UserRole.SUPER_ADMIN, tenantId: null };

    await service.getAdminEmployeeOptions(superAdmin, 'tenant-b');

    expect(employeeFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-b', userId: { not: null } }),
    }));
  });
});

describe('ListPaginatedAdminEntriesDto', () => {
  it('defaults page and pageSize', () => {
    expect(new ListPaginatedAdminEntriesDto()).toMatchObject({ page: 1, pageSize: 50 });
  });

  it.each([
    [{ page: '0' }],
    [{ pageSize: '0' }],
    [{ pageSize: '101' }],
  ])('rejects invalid pagination bounds for %o', async (value) => {
    const errors = await validate(plainToInstance(ListPaginatedAdminEntriesDto, value));

    expect(errors).not.toHaveLength(0);
  });
});

describe('AttendanceService tenant-calendar workdays', () => {
  const employee = {
    id: 'employee-1',
    fullName: 'Employee',
    email: 'employee@example.com',
    role: UserRole.AGENT,
    tenantId: 'tenant-a',
  };

  function createAttendanceService(timezone: string | null = 'America/Costa_Rica') {
    const attendanceEntry = {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    };
    const attendanceDailySummary = {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    };
    const tenantBillingConfiguration = {
      findUnique: jest.fn().mockResolvedValue(timezone === null ? null : { fiscalTimezone: timezone }),
    };
    const service = new AttendanceService({
      attendanceEntry,
      attendanceDailySummary,
      tenantBillingConfiguration,
    } as any);

    return { service, attendanceEntry, attendanceDailySummary, tenantBillingConfiguration };
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-06T05:30:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    ['America/Costa_Rica', '2026-11-05T06:00:00.000Z'],
    ['America/Lima', '2026-11-06T05:00:00.000Z'],
  ])('stores the server instant and derives the %s workday from it', async (timezone, expectedWorkday) => {
    const { service, attendanceEntry, attendanceDailySummary, tenantBillingConfiguration } = createAttendanceService(timezone);
    attendanceEntry.findFirst.mockResolvedValue(null);
    attendanceEntry.create.mockImplementation(async ({ data }) => ({ ...data, id: 'entry-1' }));
    attendanceEntry.findMany.mockResolvedValue([]);
    attendanceDailySummary.findUnique.mockResolvedValue(null);

    await service.checkIn(employee, { state: 'WORKING' });

    expect(tenantBillingConfiguration.findUnique).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
      select: { fiscalTimezone: true },
    });
    expect(attendanceEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        clockIn: new Date('2026-11-06T05:30:00.000Z'),
        date: new Date(expectedWorkday),
      }),
    }));
  });

  it('uses the established missing-configuration fallback and keeps explicit UTC', async () => {
    const missing = createAttendanceService(null);
    const utc = createAttendanceService('UTC');
    for (const context of [missing, utc]) {
      context.attendanceEntry.findFirst.mockResolvedValue(null);
      context.attendanceEntry.create.mockImplementation(async ({ data }) => ({ ...data, id: 'entry-1' }));
      context.attendanceEntry.findMany.mockResolvedValue([]);
      context.attendanceDailySummary.findUnique.mockResolvedValue(null);
    }

    await missing.service.checkIn(employee, { state: 'WORKING' });
    await utc.service.checkIn(employee, { state: 'WORKING' });

    expect(missing.attendanceEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ date: new Date('2026-11-05T06:00:00.000Z') }),
    }));
    expect(utc.attendanceEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ date: new Date('2026-11-06T00:00:00.000Z') }),
    }));
  });

  it('filters stored workday keys in the tenant calendar without converting clock instants', async () => {
    const { service, attendanceEntry, tenantBillingConfiguration } = createAttendanceService('America/Lima');
    attendanceEntry.findMany.mockResolvedValue([]);

    await service.getMyEntries(employee, { startDate: '2026-11-06', endDate: '2026-11-06' });

    expect(tenantBillingConfiguration.findUnique).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
      select: { fiscalTimezone: true },
    });
    expect(attendanceEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-a',
        userId: 'employee-1',
        date: {
          gte: new Date('2026-11-06T05:00:00.000Z'),
          lte: new Date('2026-11-06T05:00:00.000Z'),
        },
      }),
    }));
  });

  it('closes an overnight open entry by its stored workday and recalculates both summaries', async () => {
    const { service, attendanceEntry, attendanceDailySummary } = createAttendanceService('America/Lima');
    const previousWorkday = new Date('2026-11-05T05:00:00.000Z');
    attendanceEntry.findFirst.mockResolvedValue({
      id: 'open-entry',
      type: 'WORKING',
      date: previousWorkday,
      clockIn: new Date('2026-11-06T04:30:00.000Z'),
    });
    attendanceEntry.create.mockImplementation(async ({ data }) => ({ ...data, id: 'off-entry' }));
    attendanceEntry.findMany.mockResolvedValue([]);
    attendanceDailySummary.findUnique.mockResolvedValue(null);

    await service.checkIn(employee, { state: 'OFF' });

    expect(attendanceEntry.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'employee-1',
        tenantId: 'tenant-a',
        clockOut: null,
      },
      orderBy: { clockIn: 'desc' },
    });
    expect(attendanceEntry.update).toHaveBeenCalledWith({
      where: { id: 'open-entry' },
      data: {
        clockOut: new Date('2026-11-06T05:30:00.000Z'),
        duration: 3600,
      },
    });
    expect(attendanceDailySummary.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_userId_date: { tenantId: 'tenant-a', userId: 'employee-1', date: previousWorkday } },
    }));
  });

  it('evaluates the correction cutoff against the tenant workday while retaining the stored key', async () => {
    const { service, attendanceEntry } = createAttendanceService('America/Lima');
    attendanceEntry.findUnique.mockResolvedValue({
      id: 'entry-1',
      tenantId: 'tenant-a',
      userId: 'employee-1',
      type: 'WORKING',
      date: new Date('2026-11-06T05:00:00.000Z'),
      clockIn: new Date('2026-11-06T05:10:00.000Z'),
      clockOut: new Date('2026-11-06T05:20:00.000Z'),
      duration: 600,
    });

    await expect(service.correctEntry(
      { ...employee, role: UserRole.ADMIN },
      'entry-1',
      { reason: 'Corrección del marcaje de prueba' },
    )).rejects.toMatchObject({
      response: expect.objectContaining({ message: expect.stringContaining('días anteriores') }),
    });

    expect(attendanceEntry.update).not.toHaveBeenCalled();
  });
});
