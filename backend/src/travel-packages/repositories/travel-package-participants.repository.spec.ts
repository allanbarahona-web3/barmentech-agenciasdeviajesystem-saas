import { TravelPackageParticipantsRepository } from './travel-package-participants.repository';

describe('TravelPackageParticipantsRepository', () => {
  it('loads a tenant-scoped roster in one bounded query', async () => {
    const roster = [
      {
        clientId: 'holder-1',
        role: 'HOLDER',
        client: { fullName: 'Holder One' },
      },
      {
        clientId: 'minor-1',
        role: 'MINOR',
        client: { fullName: 'Minor One' },
      },
    ];
    const findMany = jest.fn().mockResolvedValue(roster);
    const repository = new TravelPackageParticipantsRepository({
      travelPackageParticipant: { findMany },
    } as any);

    await expect(
      repository.findRosterByTravelPackage('tenant-1', 'travel-1'),
    ).resolves.toEqual(roster);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        travelPackageId: 'travel-1',
      },
      select: {
        clientId: true,
        role: true,
        client: {
          select: {
            fullName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  });

  it('loads active Client travels from authoritative participations in one query', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new TravelPackageParticipantsRepository({
      travelPackageParticipant: { findMany },
    } as any);

    await repository.findActiveTravelPackagesByClient(
      'tenant-1',
      'client-1',
    );

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        clientId: 'client-1',
        travelPackage: {
          status: {
            notIn: ['COMPLETED', 'CANCELLED'],
          },
        },
      },
      select: {
        role: true,
        travelPackage: {
          select: {
            id: true,
            name: true,
            destination: true,
            departureDate: true,
            returnDate: true,
            status: true,
          },
        },
      },
      orderBy: {
        travelPackage: {
          departureDate: 'asc',
        },
      },
    });
  });
});
