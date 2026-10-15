import { InternalBookingsService } from '../internal-tourism/internal-bookings.service';
import { TravelPackagesService } from '../travel-packages/travel-packages.service';

describe('Travel context domain reads', () => {
  it('builds International context from the existing participant roster', async () => {
    const departureDate = new Date('2027-03-04');
    const returnDate = new Date('2027-04-14');
    const prisma = {
      travelPackage: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'package-1',
          name: 'International trip',
          destination: 'Colombia',
          departureDate,
          returnDate,
          status: 'OPEN',
        }),
      },
    };
    const participantRepository = {
      findRosterByTravelPackage: jest.fn().mockResolvedValue([
        {
          clientId: 'client-1',
          role: 'HOLDER',
          client: { fullName: 'Juan Holder' },
          contractSources: [
            {
              contractId: 'contract-125',
              sourceRole: 'HOLDER',
              contract: { contractNumber: 'CT-00125', status: 'SIGNED' },
            },
            {
              contractId: 'contract-141',
              sourceRole: 'HOLDER',
              contract: { contractNumber: 'CT-00141', status: 'PENDING_SIGNATURE' },
            },
          ],
        },
      ]),
    };
    const service = new TravelPackagesService(
      prisma as any,
      participantRepository as any,
      {} as any,
    );

    await expect(
      service.getTravelContext('tenant-1', 'package-1'),
    ).resolves.toEqual({
      travelId: 'package-1',
      travelType: 'INTERNATIONAL',
      displayName: 'International trip',
      destination: 'Colombia',
      startDate: departureDate,
      endDate: returnDate,
      status: 'OPEN',
      contractNumber: null,
      participants: [
        {
          clientId: 'client-1',
          fullName: 'Juan Holder',
          participantRole: 'HOLDER',
          operationalNotes: [],
          contractSources: [
            {
              contractId: 'contract-125',
              contractNumber: 'CT-00125',
              status: 'SIGNED',
              sourceRole: 'HOLDER',
            },
            {
              contractId: 'contract-141',
              contractNumber: 'CT-00141',
              status: 'PENDING_SIGNATURE',
              sourceRole: 'HOLDER',
            },
          ],
        },
      ],
    });
    expect(prisma.travelPackage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'package-1', tenantId: 'tenant-1' },
      }),
    );
    expect(participantRepository.findRosterByTravelPackage).toHaveBeenCalledWith(
      'tenant-1',
      'package-1',
    );
  });

  it('loads Internal trip metadata and authoritative participants together', async () => {
    const departureDate = new Date('2027-03-04');
    const returnDate = new Date('2027-03-05');
    const findFirst = jest.fn().mockResolvedValue({
      id: 'booking-1',
      clientId: 'client-2',
      internalTrip: {
        name: 'Internal trip',
        destination: 'Arenal',
        departureDate,
        returnDate,
        status: 'OPEN',
      },
      participants: [
        {
          clientId: 'client-2',
          role: 'MINOR',
          client: { fullName: 'Esteban Minor' },
          contractSources: [],
        },
      ],
    });
    const service = new InternalBookingsService(
      { internalTourBooking: { findFirst } } as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.getTravelContext('tenant-1', 'booking-1'),
    ).resolves.toEqual({
      travelId: 'booking-1',
      travelType: 'INTERNAL',
      displayName: 'Internal trip',
      destination: 'Arenal',
      startDate: departureDate,
      endDate: returnDate,
      status: 'OPEN',
      contractNumber: null,
      participants: [
        {
          clientId: 'client-2',
          fullName: 'Esteban Minor',
          participantRole: 'MINOR',
          operationalNotes: [],
          contractSources: [],
        },
      ],
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'booking-1', tenantId: 'tenant-1' },
        select: expect.objectContaining({
          participants: expect.objectContaining({
            where: { tenantId: 'tenant-1' },
          }),
        }),
      }),
    );
  });
});
