import { ValidationPipe } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { ListPaginatedEmployeesDto } from './dto/list-paginated-employees.dto';

describe('EmployeesController', () => {
  const tenantId = 'tenant-a';

  it('validates paginated query bounds and applies defaults', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    await expect(
      pipe.transform({}, { type: 'query', metatype: ListPaginatedEmployeesDto }),
    ).resolves.toMatchObject({ page: 1, pageSize: 25 });
    await expect(
      pipe.transform({ page: '0' }, { type: 'query', metatype: ListPaginatedEmployeesDto }),
    ).rejects.toThrow();
    await expect(
      pipe.transform({ pageSize: '101' }, { type: 'query', metatype: ListPaginatedEmployeesDto }),
    ).rejects.toThrow();
    await expect(
      pipe.transform({ pageSize: '0' }, { type: 'query', metatype: ListPaginatedEmployeesDto }),
    ).rejects.toThrow();
  });

  it('uses the authenticated tenant for the additive paginated route and preserves the legacy route', () => {
    const service = {
      findAll: jest.fn(),
      findPaginated: jest.fn(),
    };
    const controller = new EmployeesController(service as never);
    const request = { user: { tenantId } };
    const legacyQuery = {
      status: 'ACTIVO',
      position: 'Agent',
      department: 'Sales',
      search: 'ana',
    };
    const paginatedQuery = { page: 2, pageSize: 25, search: 'ana' } as ListPaginatedEmployeesDto;

    controller.findAll(request, legacyQuery.status, legacyQuery.position, legacyQuery.department, legacyQuery.search);
    controller.findPaginated(request, paginatedQuery);

    expect(service.findAll).toHaveBeenCalledWith(tenantId, legacyQuery);
    expect(service.findPaginated).toHaveBeenCalledWith(tenantId, paginatedQuery);
  });
});
