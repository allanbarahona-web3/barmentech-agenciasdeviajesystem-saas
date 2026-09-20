import { InternalBookingsService } from './internal-bookings.service';

describe('InternalBookingsService commercial-price guard', () => {
  it('rejects a pending-price trip before it can create a financial booking', async () => {
    const prisma = {
      internalTrip: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'trip-1',
          tenantId: 'tenant-1',
          status: 'OPEN',
          price: null,
          currency: 'CRC',
        }),
      },
    };
    const service = new InternalBookingsService(prisma as any, {} as any, {} as any);

    await expect(service.createBooking('tenant-1', 'user-1', 'Admin', {
      internalTripId: 'trip-1',
      participants: [{ clientId: 'client-1', role: 'HOLDER' }],
    } as any)).rejects.toThrow('Este viaje aún no tiene un precio comercial publicado.');
  });
});
