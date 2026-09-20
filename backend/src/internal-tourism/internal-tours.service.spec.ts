import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InternalToursService } from './internal-tours.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { TransportType } from '@prisma/client';
import { CreateInternalTripDto, UpdateInternalTripDto } from './dto';
import { Decimal } from '@prisma/client/runtime/library';
import { MockFactory } from './test-helpers.mock';
import { TravelFiscalClassificationService } from '../additional-services/travel-fiscal-classification.service';

describe('InternalToursService', () => {
  let service: InternalToursService;
  let prismaService: PrismaService;
  let emailService: EmailService;
  let travelFiscalClassifications: { validate: jest.Mock };

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
              count: jest.fn().mockResolvedValue(0),
            },
            internalTourBooking: {
              findFirst: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
            },
            internalTripPricingPublication: {
              findFirst: jest.fn().mockResolvedValue(null),
            },
            internalTripCostingProjectLink: {
              findFirst: jest.fn().mockResolvedValue(null),
            },
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendEmail: jest.fn(),
          },
        },
        {
          provide: TravelFiscalClassificationService,
          useValue: { validate: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<InternalToursService>(InternalToursService);
    prismaService = module.get<PrismaService>(PrismaService);
    emailService = module.get<EmailService>(EmailService);
    travelFiscalClassifications = module.get(TravelFiscalClassificationService);
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

      expect(result).toEqual({
        ...mockTrip,
        hasCostingProject: false,
        commercialPriceStatus: 'LEGACY',
      });
      expect(prismaService.internalTrip.create).toHaveBeenCalled();
    });

    it('creates a pending-price trip without using zero as a commercial price', async () => {
      jest.spyOn(prismaService.internalTrip, 'create').mockResolvedValue({
        ...mockTrip,
        price: null,
      });

      const result = await service.createTrip(
        mockTenantId,
        mockUserId,
        mockUserName,
        { ...createTripDto, price: undefined },
        mockTenantConfig,
      );

      expect(prismaService.internalTrip.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ price: null, currency: 'CRC' }) }),
      );
      expect(result).toMatchObject({ price: null, commercialPriceStatus: 'PENDING' });
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

    it('validates and persists a valid INTERNAL_TRIP classification', async () => {
      travelFiscalClassifications.validate.mockResolvedValue('catalog-1');
      jest.spyOn(prismaService.internalTrip, 'create').mockResolvedValue(mockTrip);

      await service.createTrip(
        mockTenantId,
        mockUserId,
        mockUserName,
        { ...createTripDto, fiscalClassificationCatalogId: 'catalog-1' },
        mockTenantConfig,
      );

      expect(travelFiscalClassifications.validate).toHaveBeenCalledWith(
        mockTenantId,
        'catalog-1',
        'INTERNAL_TRIP',
      );
      expect(prismaService.internalTrip.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fiscalClassificationCatalogId: 'catalog-1',
          }),
        }),
      );
    });

    it('rejects an INTERNAL_TRIP classification with incompatible usage', async () => {
      travelFiscalClassifications.validate.mockRejectedValue(
        new BadRequestException(
          'TRAVEL_FISCAL_CLASSIFICATION_USAGE_INCOMPATIBLE',
        ),
      );

      await expect(
        service.createTrip(
          mockTenantId,
          mockUserId,
          mockUserName,
          { ...createTripDto, fiscalClassificationCatalogId: 'catalog-1' },
          mockTenantConfig,
        ),
      ).rejects.toThrow('TRAVEL_FISCAL_CLASSIFICATION_USAGE_INCOMPATIBLE');
      expect(prismaService.internalTrip.create).not.toHaveBeenCalled();
    });
  });

  describe('getTrip', () => {
    it('should return a trip by id', async () => {
      jest.spyOn(prismaService.internalTrip, 'findFirst').mockResolvedValue(mockTrip);

      const result = await service.getTrip(mockTenantId, 'trip-123');

      expect(result).toEqual({
        ...mockTrip,
        hasCostingProject: false,
        commercialPriceStatus: 'LEGACY',
        totalBookings: 0,
        paidBookings: 0,
        pendingBookings: 0,
      });
      expect(prismaService.internalTrip.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'trip-123', tenantId: mockTenantId },
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
      expect(result[0]).toMatchObject({ commercialPriceStatus: 'LEGACY' });
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

    it('keeps pending trips visible in the ADMIN management list', async () => {
      jest.spyOn(prismaService.internalTrip, 'findMany').mockResolvedValue([
        { ...mockTrip, price: null, bookings: [], pricingPublications: [], costingProjectLinks: [] },
      ]);

      await expect(service.listTrips(mockTenantId, {})).resolves.toMatchObject([
        { commercialPriceStatus: 'PENDING' },
      ]);
      expect(prismaService.internalTrip.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.not.objectContaining({ OR: expect.anything() }),
      }));
    });

    it('uses the commercial eligibility predicate for LEGACY and PRICING_PUBLISHED trips', async () => {
      jest.spyOn(prismaService.internalTrip, 'findMany').mockResolvedValue([
        { ...mockTrip, bookings: [], pricingPublications: [], costingProjectLinks: [] },
        {
          ...mockTrip,
          id: 'trip-456',
          price: null,
          bookings: [],
          pricingPublications: [{ id: 'publication-1' }],
          costingProjectLinks: [{ id: 'link-1' }],
        },
      ]);

      const result = await service.listCommercialTrips(mockTenantId);

      expect(result).toMatchObject([
        { commercialPriceStatus: 'LEGACY' },
        { commercialPriceStatus: 'PRICING_PUBLISHED' },
      ]);
      for (const trip of result) {
        expect(trip).not.toHaveProperty('pricingPublications');
        expect(trip).not.toHaveProperty('costingProjectLinks');
        expect(trip).not.toHaveProperty('hasCostingProject');
      }
      expect(prismaService.internalTrip.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { price: { not: null } },
            { pricingPublications: { some: {} } },
          ],
        }),
      }));
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

    it('does not permit an ordinary edit to overwrite a Pricing-published price', async () => {
      jest.spyOn(prismaService.internalTrip, 'findFirst').mockResolvedValue(mockTrip);
      jest.spyOn(prismaService.internalTourBooking, 'findFirst').mockResolvedValue(null);
      (prismaService as any).internalTripPricingPublication.findFirst.mockResolvedValue({ id: 'publication-1' });

      await expect(
        service.updateTrip(mockTenantId, 'trip-123', { price: 100000 }),
      ).rejects.toThrow('controlado por Pricing');
      expect(prismaService.internalTrip.update).not.toHaveBeenCalled();
    });

    it('allows a currency change before a CostingProject exists', async () => {
      jest.spyOn(prismaService.internalTrip, 'findFirst').mockResolvedValue(mockTrip);
      jest.spyOn(prismaService.internalTourBooking, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prismaService.internalTrip, 'update').mockResolvedValue(mockTrip);

      await service.updateTrip(mockTenantId, 'trip-123', { currency: 'USD' });

      expect(prismaService.internalTrip.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ currency: 'USD' }),
      }));
    });

    it('allows an unchanged currency after a CostingProject exists', async () => {
      jest.spyOn(prismaService.internalTrip, 'findFirst').mockResolvedValue(mockTrip);
      jest.spyOn(prismaService.internalTourBooking, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prismaService.internalTrip, 'update').mockResolvedValue(mockTrip);
      (prismaService as any).internalTripCostingProjectLink.findFirst.mockResolvedValue({ id: 'link-1' });

      await service.updateTrip(mockTenantId, 'trip-123', { currency: mockTrip.currency });

      expect(prismaService.internalTrip.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ currency: mockTrip.currency }),
      }));
    });

    it('rejects a different currency after a CostingProject exists', async () => {
      jest.spyOn(prismaService.internalTrip, 'findFirst').mockResolvedValue(mockTrip);
      jest.spyOn(prismaService.internalTourBooking, 'findFirst').mockResolvedValue(null);
      (prismaService as any).internalTripCostingProjectLink.findFirst.mockResolvedValue({ id: 'link-1' });

      await expect(
        service.updateTrip(mockTenantId, 'trip-123', { currency: 'USD' }),
      ).rejects.toThrow('La moneda no puede cambiarse después de iniciar la composición de costos.');
      expect((prismaService as any).internalTripCostingProjectLink.findFirst).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId, internalTripId: 'trip-123' },
        select: { id: true },
      });
      expect(prismaService.internalTrip.update).not.toHaveBeenCalled();
    });

    it('keeps unrelated trip fields editable after a CostingProject exists', async () => {
      jest.spyOn(prismaService.internalTrip, 'findFirst').mockResolvedValue(mockTrip);
      jest.spyOn(prismaService.internalTourBooking, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prismaService.internalTrip, 'update').mockResolvedValue(mockTrip);
      (prismaService as any).internalTripCostingProjectLink.findFirst.mockResolvedValue({ id: 'link-1' });

      await service.updateTrip(mockTenantId, 'trip-123', { name: 'Nombre actualizado' });

      expect(prismaService.internalTrip.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ name: 'Nombre actualizado' }),
      }));
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

    it('updates and clears the INTERNAL_TRIP fiscal classification', async () => {
      jest.spyOn(prismaService.internalTrip, 'findFirst').mockResolvedValue(mockTrip);
      jest.spyOn(prismaService.internalTourBooking, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prismaService.internalTrip, 'update').mockResolvedValue(mockTrip);
      travelFiscalClassifications.validate.mockResolvedValue('catalog-2');

      await service.updateTrip(mockTenantId, 'trip-123', {
        fiscalClassificationCatalogId: 'catalog-2',
      });
      await service.updateTrip(mockTenantId, 'trip-123', {
        fiscalClassificationCatalogId: null,
      });

      expect(prismaService.internalTrip.update).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: { fiscalClassificationCatalogId: 'catalog-2' },
        }),
      );
      expect(prismaService.internalTrip.update).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: { fiscalClassificationCatalogId: null },
        }),
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
      expect(result.tripCode).toMatch(/^IT-[A-Z0-9]{6}$/);
      expect(result.totalParticipants).toBe(5); // 2 + 3 participants
      expect(result.occupancy).toBe(10); // 2 bookings / 20 capacity = 10%
      expect(result.totalIncome).toBeGreaterThanOrEqual(0);
      expect(result.pendingIncome).toBeGreaterThanOrEqual(0);
    });
  });
});
