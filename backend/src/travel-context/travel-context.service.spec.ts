import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TravelContextType } from './dto/travel-context.dto';
import { TravelContextService } from './travel-context.service';

describe('TravelContextService', () => {
  it('dispatches International context only to TravelPackagesService', async () => {
    const international = { travelType: 'INTERNATIONAL' };
    const travelPackagesService = {
      getTravelContext: jest.fn().mockResolvedValue(international),
    };
    const internalBookingsService = {
      getTravelContext: jest.fn(),
    };
    const service = new TravelContextService(
      travelPackagesService as any,
      internalBookingsService as any,
    );

    await expect(
      service.getTravelContext(
        'tenant-1',
        TravelContextType.INTERNATIONAL,
        'travel-1',
      ),
    ).resolves.toBe(international);
    expect(travelPackagesService.getTravelContext).toHaveBeenCalledWith(
      'tenant-1',
      'travel-1',
    );
    expect(internalBookingsService.getTravelContext).not.toHaveBeenCalled();
  });

  it('dispatches Internal context only to InternalBookingsService', async () => {
    const internal = { travelType: 'INTERNAL' };
    const travelPackagesService = {
      getTravelContext: jest.fn(),
    };
    const internalBookingsService = {
      getTravelContext: jest.fn().mockResolvedValue(internal),
    };
    const service = new TravelContextService(
      travelPackagesService as any,
      internalBookingsService as any,
    );

    await expect(
      service.getTravelContext(
        'tenant-1',
        TravelContextType.INTERNAL,
        'booking-1',
      ),
    ).resolves.toBe(internal);
    expect(travelPackagesService.getTravelContext).not.toHaveBeenCalled();
    expect(internalBookingsService.getTravelContext).toHaveBeenCalledWith(
      'tenant-1',
      'booking-1',
    );
  });

  it('rejects an invalid travel type as a bad request', async () => {
    const travelPackagesService = { getTravelContext: jest.fn() };
    const internalBookingsService = { getTravelContext: jest.fn() };
    const service = new TravelContextService(
      travelPackagesService as any,
      internalBookingsService as any,
    );

    await expect(
      service.getTravelContext('tenant-1', 'CRUISE' as any, 'travel-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(travelPackagesService.getTravelContext).not.toHaveBeenCalled();
    expect(internalBookingsService.getTravelContext).not.toHaveBeenCalled();
  });

  it('returns not found when the selected domain does not recognize the travel', async () => {
    const travelPackagesService = {
      getTravelContext: jest.fn().mockResolvedValue(null),
    };
    const internalBookingsService = { getTravelContext: jest.fn() };
    const service = new TravelContextService(
      travelPackagesService as any,
      internalBookingsService as any,
    );

    await expect(
      service.getTravelContext(
        'tenant-1',
        TravelContextType.INTERNATIONAL,
        'missing',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(internalBookingsService.getTravelContext).not.toHaveBeenCalled();
  });
});
