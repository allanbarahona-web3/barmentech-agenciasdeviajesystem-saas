import { EmployeeStatus } from '@prisma/client';
import { EmployeesService } from './employees.service';

describe('EmployeesService.findPaginated', () => {
  const tenantId = 'tenant-a';

  function createService() {
    const findMany = jest.fn();
    const count = jest.fn();
    const service = new EmployeesService(
      { employee: { findMany, count } } as any,
      {} as any,
      {} as any,
    );

    return { service, findMany, count };
  }

  it('uses default pagination, tenant scoping, stable order, and the minimal table select', async () => {
    const { service, findMany, count } = createService();
    const items = [
      {
        id: 'employee-1',
        fullName: 'Ana Example',
        documentId: '1',
        position: 'Agent',
        department: null,
        status: EmployeeStatus.ACTIVO,
      },
    ];
    findMany.mockResolvedValue(items);
    count.mockResolvedValue(27);

    await expect(service.findPaginated(tenantId, { page: 1, pageSize: 25 })).resolves.toEqual({
      items,
      total: 27,
      page: 1,
      pageSize: 25,
      totalPages: 2,
    });

    const where = { tenantId };
    expect(findMany).toHaveBeenCalledWith({
      where,
      select: {
        id: true,
        fullName: true,
        documentId: true,
        position: true,
        department: true,
        status: true,
      },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      skip: 0,
      take: 25,
    });
    expect(count).toHaveBeenCalledWith({ where });
  });

  it('preserves existing filters and calculates the requested offset', async () => {
    const { service, findMany, count } = createService();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(31);

    await expect(
      service.findPaginated(tenantId, {
        page: 3,
        pageSize: 10,
        status: EmployeeStatus.SUSPENDIDO,
        position: 'Agent',
        department: 'Sales',
        search: 'ana',
      }),
    ).resolves.toEqual({
      items: [],
      total: 31,
      page: 3,
      pageSize: 10,
      totalPages: 4,
    });

    const where = {
      tenantId,
      status: EmployeeStatus.SUSPENDIDO,
      position: { contains: 'Agent', mode: 'insensitive' },
      department: { contains: 'Sales', mode: 'insensitive' },
      OR: [
        { fullName: { contains: 'ana', mode: 'insensitive' } },
        { documentId: { contains: 'ana', mode: 'insensitive' } },
        { email: { contains: 'ana', mode: 'insensitive' } },
      ],
    };
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where,
      skip: 20,
      take: 10,
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    }));
    expect(count).toHaveBeenCalledWith({ where });
  });
});

describe('EmployeesService.findAll', () => {
  const tenantId = 'tenant-a';

  it('uses the same partial, case-insensitive position and department filters while preserving status and search semantics', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new EmployeesService(
      { employee: { findMany } } as any,
      {} as any,
      {} as any,
    );

    await service.findAll(tenantId, {
      status: EmployeeStatus.SUSPENDIDO,
      position: 'vent',
      department: 'sales',
      search: 'ana',
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId,
        status: EmployeeStatus.SUSPENDIDO,
        position: { contains: 'vent', mode: 'insensitive' },
        department: { contains: 'sales', mode: 'insensitive' },
        OR: [
          { fullName: { contains: 'ana', mode: 'insensitive' } },
          { documentId: { contains: 'ana', mode: 'insensitive' } },
          { email: { contains: 'ana', mode: 'insensitive' } },
        ],
      },
      orderBy: { fullName: 'asc' },
    }));
  });
});
