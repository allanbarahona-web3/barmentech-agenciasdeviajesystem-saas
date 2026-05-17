import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, BadRequestException } from '@nestjs/common';
import { InternalTripsController } from './internal-trips.controller';
import { InternalToursService } from './internal-tours.service';
import { CreateInternalTripDto, UpdateInternalTripDto } from './dto';
import { Decimal } from '@prisma/client/runtime/library';
import { MockFactory } from './test-helpers.mock';

describe('InternalTripsController', () => {
  let controller: InternalTripsController;
  let service: InternalToursService;

  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-123';
  const mockUserName = 'Test User';

  let mockTrip: any;
  let mockReq: any;
  let mockTenant: any;

  beforeEach(async () => {
    mockTrip = MockFactory.createMockTrip();
    mockReq = MockFactory.createMockUserRequest();
    mockTenant = MockFactory.createMockTenant();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalTripsController],
      providers: [
        {
          provide: InternalToursService,
          useValue: {
            createTrip: jest.fn(),
            getTrip: jest.fn(),
            listTrips: jest.fn(),
            updateTrip: jest.fn(),
            cancelTrip: jest.fn(),
            getTripStats: jest.fn(),
            getAvailableSlots: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<InternalTripsController>(InternalTripsController);
    service = module.get<InternalToursService>(InternalToursService);
  });

  describe('POST /internal-trips - Create Trip', () => {
    let createTripDto: CreateInternalTripDto;

    beforeEach(() => {
      createTripDto = MockFactory.createMockCreateTripDto();
    });

    it('should create a trip successfully', async () => {
      jest.spyOn(service, 'createTrip').mockResolvedValue(mockTrip);

      const result = await controller.createTrip(mockReq, mockTenant, createTripDto);

      expect(result).toEqual(mockTrip);
      expect(service.createTrip).toHaveBeenCalledWith(
        mockTenant.id,
        mockReq.user.id,
        mockReq.user.fullName,
        createTripDto,
        expect.objectContaining({
          preferredCurrency: 'CRC',
        }),
      );
    });

    it('should pass tenant config with preferred currency', async () => {
      jest.spyOn(service, 'createTrip').mockResolvedValue(mockTrip);

      await controller.createTrip(mockReq, mockTenant, createTripDto);

      expect(service.createTrip).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          preferredCurrency: mockTenant.preferredCurrency,
        }),
      );
    });
  });

  describe('GET /internal-trips - List Trips', () => {
    it('should list all trips', async () => {
      const trips = [mockTrip, { ...mockTrip, id: 'trip-456' }];
      jest.spyOn(service, 'listTrips').mockResolvedValue(trips);

      const result = await controller.listTrips(mockTenant, {});

      expect(result).toEqual(trips);
      expect(service.listTrips).toHaveBeenCalledWith(mockTenant.id, {});
    });

    it('should filter by status', async () => {
      jest.spyOn(service, 'listTrips').mockResolvedValue([mockTrip]);

      await controller.listTrips(mockTenant, { status: 'OPEN' });

      expect(service.listTrips).toHaveBeenCalledWith(
        mockTenant.id,
        expect.objectContaining({
          status: 'OPEN',
        }),
      );
    });
  });

  describe('GET /internal-trips/:id - Get Trip', () => {
    it('should get trip details', async () => {
      jest.spyOn(service, 'getTrip').mockResolvedValue(mockTrip);

      const result = await controller.getTrip(mockTenant, 'trip-123');

      expect(result).toEqual(mockTrip);
      expect(service.getTrip).toHaveBeenCalledWith(mockTenant.id, 'trip-123');
    });
  });

  describe('PUT /internal-trips/:id - Update Trip', () => {
    const updateTripDto: UpdateInternalTripDto = {
      name: 'Updated Trip Name',
      capacity: 25,
    };

    it('should update a trip', async () => {
      const updatedTrip = { ...mockTrip, ...updateTripDto };
      jest.spyOn(service, 'updateTrip').mockResolvedValue(updatedTrip);

      const result = await controller.updateTrip(mockTenant, 'trip-123', updateTripDto);

      expect(result).toEqual(updatedTrip);
      expect(service.updateTrip).toHaveBeenCalledWith(mockTenant.id, 'trip-123', updateTripDto);
    });
  });

  describe('DELETE /internal-trips/:id - Cancel Trip', () => {
    it('should cancel a trip', async () => {
      const cancelledTrip = { ...mockTrip, status: 'CANCELLED' };
      jest.spyOn(service, 'cancelTrip').mockResolvedValue(cancelledTrip);

      const result = await controller.cancelTrip(mockTenant, 'trip-123');

      expect(result).toEqual(cancelledTrip);
      expect(service.cancelTrip).toHaveBeenCalledWith(mockTenant.id, 'trip-123');
    });
  });

  describe('GET /internal-trips/:id/stats - Get Trip Stats', () => {
    it('should return trip statistics', async () => {
      const stats = {
        totalCapacity: 20,
        bookedSlots: 15,
        availableSlots: 5,
        occupancyPercentage: 75,
        totalIncome: new Decimal('1350000'),
        pendingIncome: new Decimal('450000'),
      };

      jest.spyOn(service, 'getTripStats').mockResolvedValue(stats);

      const result = await controller.getTripStats(mockTenant, 'trip-123');

      expect(result).toEqual(stats);
      expect(service.getTripStats).toHaveBeenCalledWith(mockTenant.id, 'trip-123');
    });
  });
});
