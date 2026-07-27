import { InternalBookingsService } from './internal-bookings.service';

describe('InternalBookingsService active Client travels', () => {
  it('filters active bookings through authoritative participant membership', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new InternalBookingsService(
      { internalTourBooking: { findMany } } as any,
      {} as any,
      {} as any,
    );

    await service.listBookings('tenant-1', {
      clientId: 'participant-1',
    });

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        participants: {
          some: {
            tenantId: 'tenant-1',
            clientId: 'participant-1',
          },
        },
        status: { not: 'CANCELLED' },
      },
      include: {
        internalTrip: true,
        client: true,
        invoice: true,
      },
      skip: 0,
      take: 50,
      orderBy: { createdAt: 'desc' },
    });
  });

  it('preserves an explicit active status with participant membership', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new InternalBookingsService(
      { internalTourBooking: { findMany } } as any,
      {} as any,
      {} as any,
    );

    await service.listBookings('tenant-1', {
      clientId: 'participant-1',
      status: 'PAID',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-1',
          participants: {
            some: {
              tenantId: 'tenant-1',
              clientId: 'participant-1',
            },
          },
          status: 'PAID',
        },
      }),
    );
  });

  it('exposes the booking identifier and Internal travel type', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'booking-1',
        totalAmount: 100,
        paidAmount: 25,
        pendingAmount: 75,
      },
    ]);
    const service = new InternalBookingsService(
      { internalTourBooking: { findMany } } as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.listBookings('tenant-1', { clientId: 'participant-1' }),
    ).resolves.toEqual([
      expect.objectContaining({
        travelId: 'booking-1',
        travelType: 'INTERNAL',
      }),
    ]);
  });
});
