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
    const service = new AttendanceService({
      attendanceEntry: { findMany, count },
      attendanceCorrection: { groupBy },
      employee: { findMany: employeeFindMany },
    } as any);

    return { service, findMany, count, groupBy, employeeFindMany };
  }

  it('uses default pagination, tenant scope, stable order, and the minimal list select', async () => {
    const { service, findMany, count, groupBy } = createService();
    const query = new ListPaginatedAdminEntriesDto();
    const entries = [{
      id: 'entry-1',
      type: 'WORKING',
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
