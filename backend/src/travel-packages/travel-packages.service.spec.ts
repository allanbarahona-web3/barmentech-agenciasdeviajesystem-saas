import { TravelPackagesService } from './travel-packages.service';

describe('TravelPackagesService', () => {
  it('reuses the participant repository for roster reads', async () => {
    const roster = [
      {
        clientId: 'holder-1',
        role: 'HOLDER' as const,
        client: { fullName: 'Holder One' },
      },
    ];
    const findRosterByTravelPackage = jest.fn().mockResolvedValue(roster);
    const service = new TravelPackagesService(
      {} as any,
      { findRosterByTravelPackage } as any,
    );

    await expect(
      service.getParticipantRoster('tenant-1', 'travel-1'),
    ).resolves.toEqual(roster);
    expect(findRosterByTravelPackage).toHaveBeenCalledWith(
      'tenant-1',
      'travel-1',
    );
  });

  it('maps active Client participations to minimal travel-selection data', async () => {
    const departureDate = new Date('2026-08-01T00:00:00.000Z');
    const returnDate = new Date('2026-08-08T00:00:00.000Z');
    const findActiveTravelPackagesByClient = jest.fn().mockResolvedValue([
      {
        role: 'COMPANION',
        travelPackage: {
          id: 'travel-1',
          name: 'International Trip',
          destination: 'Destination',
          departureDate,
          returnDate,
          status: 'CLOSED',
        },
      },
    ]);
    const service = new TravelPackagesService(
      {} as any,
      { findActiveTravelPackagesByClient } as any,
    );

    await expect(
      service.getActiveTravelPackagesByClient('tenant-1', 'client-1'),
    ).resolves.toEqual([
      {
        travelId: 'travel-1',
        travelType: 'INTERNATIONAL',
        name: 'International Trip',
        destination: 'Destination',
        departureDate,
        returnDate,
        status: 'CLOSED',
        participantRole: 'COMPANION',
      },
    ]);
    expect(findActiveTravelPackagesByClient).toHaveBeenCalledWith(
      'tenant-1',
      'client-1',
    );
  });
});
