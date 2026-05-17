import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InternalToursService } from './internal-tours.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { TransportType } from '@prisma/client';
import { CreateInternalTripDto, UpdateInternalTripDto } from './dto';
import { Decimal } from '@prisma/client/runtime/library';
import { MockFactory } from './test-helpers.mock';

describe('InternalToursService', () => {
  let service: InternalToursService;
  let prismaService: PrismaService;
  let emailService: EmailService;

  // Mock data
  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-123';
  const mockUserName = 'Test User';
  const mockTenantConfig = { preferredCurrency: 'CRC' };

  // Use MockFactory for complete and valid mock objects
  let mockTrip: any;

  beforeEach(async () => {
    mockTrip = MockFactory.createMockTrip();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InternalToursService,
        {
          provide: PrismaService,
          useValue: {
            internalTrip: {
              create: jest.fn(),
              findFirst: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            internalTourBooking: {
              findFirst: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendEmail: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<InternalToursService>(InternalToursService);
    prismaService = module.get<PrismaService>(PrismaService);
    emailService = module.get<EmailService>(EmailService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createTrip', () => {
    let createTripDto: CreateInternalTripDto;

    beforeEach(() => {
      createTripDto = MockFactory.createMockCreateTripDto();
    });

    it('should create a trip successfully', async () => {
      jest.spyOn(prismaService.internalTrip, 'create').mockResolvedValue(mockTrip);

      const result = await service.createTrip(
        mockTenantId,
        mockUserId,
        mockUserName,
        createTripDto,
        mockTenantConfig,
      );

      expect(result).toEqual(mockTrip);
      expect(prismaService.internalTrip.create).toHaveBeenCalled();
    });

    it('should throw error if departure date is in the past', async () => {
      const invalidDto = {
        ...createTripDto,
        departureDate: new Date('2020-01-01').toISOString().split('T')[0],
      };

      await expect(
        service.createTrip(mockTenantId, mockUserId, mockUserName, invalidDto, mockTenantConfig),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error if return date is before departure date', async () => {
      const invalidDto = {
        ...createTripDto,
        departureDate: new Date('2026-06-20').toISOString().split('T')[0],
        returnDate: new Date('2026-06-15').toISOString().split('T')[0],
      };

      await expect(
        service.createTrip(mockTenantId, mockUserId, mockUserName, invalidDto, mockTenantConfig),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error if capacity is invalid', async () => {
      const invalidDto = { ...createTripDto, capacity: 0 };

      await expect(
        service.createTrip(mockTenantId, mockUserId, mockUserName, invalidDto, mockTenantConfig),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error if price is invalid', async () => {
      const invalidDto = { ...createTripDto, price: -100 };

      await expect(
        service.createTrip(mockTenantId, mockUserId, mockUserName, invalidDto, mockTenantConfig),
      ).rejects.toThrow(BadRequestException);
    });

    it('should use tenant preferred currency if not specified in DTO', async () => {
      const dtoWithoutCurrency = { ...createTripDto, currency: undefined };
      jest.spyOn(prismaService.internalTrip, 'create').mockResolvedValue(mockTrip);

      await service.createTrip(
        mockTenantId,
        mockUserId,
        mockUserName,
        dtoWithoutCurrency,
        { preferredCurrency: 'USD' },
      );

      expect(prismaService.internalTrip.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currency: 'USD',
          }),
        }),
      );
    });
  });

  describe('getTrip', () => {
    it('should return a trip by id', async () => {
      jest.spyOn(prismaService.internalTrip, 'findFirst').mockResolvedValue(mockTrip);

      const result = await service.getTrip(mockTenantId, 'trip-123');

      expect(result).toEqual(mockTrip);
      expect(prismaService.internalTrip.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'trip-123' },
        }),
      );
    });

    it('should throw NotFoundException if trip does not exist', async () => {
      jest.spyOn(prismaService.internalTrip, 'findFirst').mockResolvedValue(null);

      await expect(service.getTrip(mockTenantId, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listTrips', () => {
    it('should return list of trips', async () => {
      const trips = [
        { ...mockTrip, bookings: [] },
        { ...mockTrip, id: 'trip-456', bookings: [] },
      ];
      jest.spyOn(prismaService.internalTrip, 'findMany').mockResolvedValue(trips);

      const result = await service.listTrips(mockTenantId, {});

      expect(result).toBeDefined();
      expect(result.length).toBe(2);
      expect(prismaService.internalTrip.findMany).toHaveBeenCalled();
    });

    it('should filter by status', async () => {
      jest.spyOn(prismaService.internalTrip, 'findMany').mockResolvedValue([{ ...mockTrip, bookings: [] }]);

      await service.listTrips(mockTenantId, { status: 'OPEN' });

      expect(prismaService.internalTrip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'OPEN',
          }),
        }),
      );
    });

    it('should respect pagination', async () => {
      jest.spyOn(prismaService.internalTrip, 'findMany').mockResolvedValue([]);

      await service.listTrips(mockTenantId, { skip: 10, take: 20 });

      expect(prismaService.internalTrip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 20,
        }),
      );
    });
  });

  describe('updateTrip', () => {
    const updateDto: UpdateInternalTripDto = {
      name: 'Viaje actualizado',
      capacity: 25,
      price: 100000,
    };

    it('should update a trip successfully', async () => {
      const updatedTrip = { ...mockTrip, ...updateDto };
      jest.spyOn(prismaService.internalTrip, 'findFirst').mockResolvedValue(mockTrip);
      jest.spyOn(prismaService.internalTourBooking, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prismaService.internalTrip, 'update').mockResolvedValue(updatedTrip);

      const result = await service.updateTrip(mockTenantId, 'trip-123', updateDto);

      expect(result).toEqual(updatedTrip);
    });

    it('should throw error if trying to modify trip dates with active bookings', async () => {
      const bookingWithTrip = MockFactory.createMockBooking({ internalTripId: 'trip-123' });
      jest.spyOn(prismaService.internalTrip, 'findFirst').mockResolvedValue(mockTrip);
      jest.spyOn(prismaService.internalTourBooking, 'findFirst').mockResolvedValue(bookingWithTrip);

      const dtoWithDepartureDate = { ...updateDto, departureDate: '2026-06-01' };

      await expect(service.updateTrip(mockTenantId, 'trip-123', dtoWithDepartureDate)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('cancelTrip', () => {
    it('should cancel a trip and send emails to all clients', async () => {
      const mockBookings = [
        MockFactory.createMockBookingWithRelations({
          id: 'booking-1',
          clientId: 'client-1',
          internalTripId: 'trip-123',
        }),
        MockFactory.createMockBookingWithRelations({
          id: 'booking-2',
          clientId: 'client-2',
          internalTripId: 'trip-123',
        }),
      ];

      const mockTripWithBookings = {
        ...mockTrip,
        bookings: mockBookings,
      };

      jest.spyOn(prismaService.internalTrip, 'findFirst').mockResolvedValue(mockTripWithBookings);
      jest.spyOn(prismaService.internalTrip, 'update').mockResolvedValue({
        ...mockTrip,
        status: 'CANCELLED',
      });
      jest.spyOn(emailService, 'sendEmail').mockResolvedValue({} as any);

      await service.cancelTrip(mockTenantId, 'trip-123');

      // Verify emails were sent to all clients
      expect(emailService.sendEmail).toHaveBeenCalledTimes(2);
    });

    it('should throw error if trip does not exist', async () => {
      jest.spyOn(prismaService.internalTrip, 'findFirst').mockResolvedValue(null);

      await expect(service.cancelTrip(mockTenantId, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getTripStats', () => {
    it('should calculate trip statistics', async () => {
      const mockTripWithBookings = {
        ...mockTrip,
        bookings: [
          MockFactory.createMockBooking({ status: 'PAID', participantCount: 2 }),
          MockFactory.createMockBooking({ status: 'PENDING', participantCount: 3, id: 'booking-2' }),
        ],
      };

      jest.spyOn(prismaService.internalTrip, 'findFirst').mockResolvedValue(mockTripWithBookings);

      const result = await service.getTripStats(mockTenantId, 'trip-123');

      expect(result).toBeDefined();
      expect(result.tripCode).toBe('IT-202605');
      expect(result.totalParticipants).toBe(5); // 2 + 3 participants
      expect(result.occupancy).toBe(10); // 2 bookings / 20 capacity = 10%
      expect(result.totalIncome).toBeGreaterThanOrEqual(0);
      expect(result.pendingIncome).toBeGreaterThanOrEqual(0);
    });
  });
});
