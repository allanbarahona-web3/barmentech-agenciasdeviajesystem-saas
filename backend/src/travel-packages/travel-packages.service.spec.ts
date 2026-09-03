import { TravelPackagesService } from './travel-packages.service';

describe('TravelPackagesService', () => {
  const fiscalClassifications = { validate: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

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
      fiscalClassifications as any,
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
      fiscalClassifications as any,
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

  it('creates a TravelPackage without fiscal classification', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'travel-1' });
    const service = new TravelPackagesService(
      {
        travelPackage: {
          findUnique: jest.fn().mockResolvedValue(null),
          create,
        },
      } as any,
      {} as any,
      fiscalClassifications as any,
    );

    await service.create(
      {
        name: 'Europa',
        destination: 'España',
        departureDate: '2030-06-01',
        returnDate: '2030-06-10',
        capacity: 20,
      },
      'user-1',
      'tenant-1',
    );

    expect(fiscalClassifications.validate).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fiscalClassificationCatalogId: null }),
      }),
    );
  });

  it('validates and persists the TravelPackage classification for migration travel', async () => {
    fiscalClassifications.validate.mockResolvedValue('catalog-1');
    const create = jest.fn().mockResolvedValue({ id: 'travel-1' });
    const service = new TravelPackagesService(
      {
        travelPackage: {
          findUnique: jest.fn().mockResolvedValue(null),
          create,
        },
      } as any,
      {} as any,
      fiscalClassifications as any,
    );

    await service.create(
      {
        name: 'Migración',
        destination: 'Canadá',
        departureDate: '2030-06-01',
        returnDate: '2030-06-10',
        capacity: 10,
        travelType: 'MIGRATION',
        fiscalClassificationCatalogId: 'catalog-1',
      },
      'user-1',
      'tenant-1',
    );

    expect(fiscalClassifications.validate).toHaveBeenCalledWith(
      'tenant-1',
      'catalog-1',
      'TRAVEL_PACKAGE',
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          travelType: 'MIGRATION',
          fiscalClassificationCatalogId: 'catalog-1',
        }),
      }),
    );
  });

  it('uses the same TRAVEL_PACKAGE validation for standard travel', async () => {
    fiscalClassifications.validate.mockResolvedValue('catalog-1');
    const service = new TravelPackagesService(
      {
        travelPackage: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'travel-1' }),
        },
      } as any,
      {} as any,
      fiscalClassifications as any,
    );

    await service.create(
      {
        name: 'Europa',
        destination: 'España',
        departureDate: '2030-06-01',
        returnDate: '2030-06-10',
        capacity: 20,
        fiscalClassificationCatalogId: 'catalog-1',
      },
      'user-1',
      'tenant-1',
    );

    expect(fiscalClassifications.validate).toHaveBeenCalledWith(
      'tenant-1',
      'catalog-1',
      'TRAVEL_PACKAGE',
    );
  });

  it('updates and explicitly clears a TravelPackage classification', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'travel-1' });
    const prisma = {
      travelPackage: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'travel-1',
          tenantId: 'tenant-1',
          status: 'OPEN',
          occupiedSlots: 0,
          capacity: 20,
        }),
        update,
      },
    };
    fiscalClassifications.validate.mockResolvedValue('catalog-2');
    const service = new TravelPackagesService(
      prisma as any,
      {} as any,
      fiscalClassifications as any,
    );

    await service.update(
      'travel-1',
      { fiscalClassificationCatalogId: 'catalog-2' },
      'tenant-1',
    );
    await service.update(
      'travel-1',
      { fiscalClassificationCatalogId: null },
      'tenant-1',
    );

    expect(update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          fiscalClassificationCatalogId: 'catalog-2',
        }),
      }),
    );
    expect(update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ fiscalClassificationCatalogId: null }),
      }),
    );
  });

  it('does not query fiscal profiles per row in normal travel lists', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new TravelPackagesService(
      { travelPackage: { findMany } } as any,
      {} as any,
      fiscalClassifications as any,
    );

    await service.findAll('tenant-1');

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(fiscalClassifications.validate).not.toHaveBeenCalled();
  });
});
