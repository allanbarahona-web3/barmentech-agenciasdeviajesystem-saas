import { AuthService } from './auth.service';

describe('AuthService.me', () => {
  function createService(user: unknown) {
    const findUnique = jest.fn().mockResolvedValue(user);
    const service = new AuthService(
      { user: { findUnique } } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return { service, findUnique };
  }

  it('exposes the fiscal timezone from the authenticated user tenant only', async () => {
    const { service, findUnique } = createService({
      id: 'user-a',
      email: 'agent@example.test',
      fullName: 'Agent Example',
      role: 'AGENT',
      mustChangePassword: false,
      isActive: true,
      tenantId: 'tenant-a',
      tenant: {
        name: 'Tenant A',
        contractPrefix: 'TA',
        billingConfiguration: { fiscalTimezone: 'America/Guatemala' },
      },
    });

    await expect(service.me('user-a')).resolves.toMatchObject({
      id: 'user-a',
      tenantId: 'tenant-a',
      tenant: {
        name: 'Tenant A',
        contractPrefix: 'TA',
        fiscalTimezone: 'America/Guatemala',
      },
    });
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-a' },
      select: expect.objectContaining({
        tenant: {
          select: expect.objectContaining({
            billingConfiguration: { select: { fiscalTimezone: true } },
          }),
        },
      }),
    }));
  });

  it('uses the safe Costa Rica fallback when the tenant has no billing configuration', async () => {
    const { service } = createService({
      id: 'user-a',
      email: 'agent@example.test',
      fullName: 'Agent Example',
      role: 'AGENT',
      mustChangePassword: false,
      isActive: true,
      tenantId: 'tenant-a',
      tenant: {
        name: 'Tenant A',
        contractPrefix: 'TA',
        billingConfiguration: null,
      },
    });

    await expect(service.me('user-a')).resolves.toMatchObject({
      tenant: { fiscalTimezone: 'America/Costa_Rica' },
    });
  });
});
