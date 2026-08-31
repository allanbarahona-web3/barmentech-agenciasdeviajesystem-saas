import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { InternalTripsController } from './internal-trips.controller';
import { InternalBookingsController } from './internal-bookings.controller';
import { InternalToursService } from './internal-tours.service';
import { InternalBookingsService } from './internal-bookings.service';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { MockFactory } from './test-helpers.mock';
import { TransportType } from '@prisma/client';
import { InternalTourBookingParticipantRole } from './enums';

/**
 * E2E Tests for Internal Tourism Module
 * Tests critical user flows:
 * 1. Create Trip → Create Booking → Record Payment
 * 2. Create Trip → Cancel Trip (notifies all clients)
 * 3. Create Booking → Cancel Booking
 */
describe('Internal Tourism Module - E2E Tests', () => {
  let app: INestApplication;
  let toursService: InternalToursService;
  let bookingsService: InternalBookingsService;
  let emailService: EmailService;
  let prismaService: PrismaService;

  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-123';
  const mockUserName = 'Test User';

  const mockTenantConfig = { preferredCurrency: 'CRC' };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [InternalTripsController, InternalBookingsController],
      providers: [
        InternalToursService,
        InternalBookingsService,
        {
          provide: PrismaService,
          useValue: {
            internalTrip: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
            },
            internalTourBooking: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
            },
            internalTourInvoice: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
            },
            client: {
              findUnique: jest.fn(),
            },
            billingPayment: {
              create: jest.fn(),
            },
            $transaction: jest.fn(),
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

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    toursService = moduleFixture.get<InternalToursService>(InternalToursService);
    bookingsService = moduleFixture.get<InternalBookingsService>(InternalBookingsService);
    emailService = moduleFixture.get<EmailService>(EmailService);
    prismaService = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('E2E Flow 1: Create Trip → Create Booking → Record Payment', () => {
    const tripDetails = {
      name: 'Viaje a Arenal',
      destination: 'La Fortuna, Arenal',
      description: 'Descubre las maravillas de Arenal',
      departureDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0], // 30 days from now
      returnDate: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0], // 31 days from now
      capacity: 20,
      price: 90000,
      currency: 'CRC',
      transportType: TransportType.BUS,
      itinerary: '<p>Día 1: Salida temprano</p>',
    };

    let createdTripId: string;
    let createdBookingId: string;

    it('Step 1: Should create a trip successfully', async () => {
      const mockTrip = {
        id: 'trip-123',
        tripCode: 'IT-202605',
        tenantId: mockTenantId,
        status: 'OPEN',
        ...tripDetails,
        price: new Decimal(String(tripDetails.price)),
        departureDate: new Date(tripDetails.departureDate),
        returnDate: new Date(tripDetails.returnDate),
        departureTime: null,
        returnTime: null,
        createdByUserId: mockUserId,
        createdByName: mockUserName,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(prismaService.internalTrip, 'create').mockResolvedValue(mockTrip as any);

      const result = await toursService.createTrip(
        mockTenantId,
        mockUserId,
        mockUserName,
        tripDetails,
        mockTenantConfig,
      );

      expect(result).toBeDefined();
      expect(result.id).toBe('trip-123');
      expect(result.status).toBe('OPEN');
      expect(result.tripCode).toMatch(/^IT-\d{6}$/);

      createdTripId = result.id;
    });

    it('Step 2: Should create a booking for the trip', async () => {
      const mockTrip = {
        id: createdTripId,
        tripCode: 'IT-202605',
        tenantId: mockTenantId,
        status: 'OPEN',
        capacity: 20,
        price: new Decimal('90000'),
        currency: 'CRC',
        departureDate: new Date(tripDetails.departureDate),
        returnDate: new Date(tripDetails.returnDate),
      };

      const mockClient = {
        id: 'client-123',
        email: 'client@example.com',
        fullName: 'Test Client',
        tenantId: mockTenantId,
      };

      const mockBooking = {
        id: 'booking-123',
        bookingCode: 'IT-202605-001',
        internalTripId: createdTripId,
        clientId: 'client-123',
        participantCount: 2,
        totalAmount: new Decimal('180000'),
        paidAmount: new Decimal('0'),
        pendingAmount: new Decimal('180000'),
        currency: 'CRC',
        status: 'PENDING',
        tenantId: mockTenantId,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        client: mockClient,
        internalTrip: mockTrip,
      };

      const mockInvoice = {
        id: 'invoice-123',
        invoiceNumber: 'IT-INV-202605-001',
        bookingId: 'booking-123',
        totalAmount: new Decimal('180000'),
        paidAmount: new Decimal('0'),
        pendingAmount: new Decimal('180000'),
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        tenantId: mockTenantId,
      };

      jest.spyOn(prismaService.internalTrip, 'findUnique').mockResolvedValue(mockTrip as any);
      jest.spyOn(prismaService.client, 'findUnique').mockResolvedValue(mockClient as any);
      jest.spyOn(prismaService.internalTourBooking, 'findMany').mockResolvedValue([]);
      jest.spyOn(prismaService.internalTourBooking, 'count').mockResolvedValue(0);
      jest.spyOn(prismaService, '$transaction').mockResolvedValue({
        booking: mockBooking,
        invoice: mockInvoice,
      });
      jest.spyOn(emailService, 'sendEmail').mockResolvedValue({} as any);

      const result = await bookingsService.createBooking(
        mockTenantId,
        mockUserId,
        mockUserName,
        {
          internalTripId: createdTripId,
          participants: [
            { clientId: 'client-123', role: InternalTourBookingParticipantRole.HOLDER },
            { clientId: 'client-456', role: InternalTourBookingParticipantRole.COMPANION },
          ],
        },
      );

      expect(result).toBeDefined();
      expect(result.booking.id).toBe('booking-123');
      expect(result.booking.status).toBe('PENDING');
      expect(result.booking.bookingCode).toMatch(/^IT-\d{6}-\d{3}$/);
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'booking-confirmation',
        }),
      );

      createdBookingId = result.booking.id;
    });

    it('Step 3: Should record payment and update booking status', async () => {
      const paidBooking = {
        id: createdBookingId,
        bookingCode: 'IT-202605-001',
        internalTripId: createdTripId,
        clientId: 'client-123',
        participantCount: 2,
        totalAmount: new Decimal('180000'),
        paidAmount: new Decimal('180000'),
        pendingAmount: new Decimal('0'),
        currency: 'CRC',
        status: 'PAID',
        tenantId: mockTenantId,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest
        .spyOn(prismaService.internalTourBooking, 'findUnique')
        .mockResolvedValue({ ...paidBooking, client: { email: 'client@example.com', fullName: 'Test' }, internalTrip: { name: 'Trip' } } as any);
      jest.spyOn(prismaService, '$transaction').mockResolvedValue(paidBooking);
      jest.spyOn(emailService, 'sendEmail').mockResolvedValue({} as any);

      const result = await bookingsService.recordPayment(
        mockTenantId,
        createdBookingId,
        180000,
        mockUserId,
        mockUserName,
      );

      expect(result).toBeDefined();
      expect(result.paidAmount).toEqual(new Decimal('180000'));
      expect(result.pendingAmount).toEqual(new Decimal('0'));
      expect(result.status).toBe('PAID');
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'payment-received',
        }),
      );
    });
  });

  describe('E2E Flow 2: Create Trip → Cancel Trip (Notify All Clients)', () => {
    it('Should cancel trip and send emails to all affected clients', async () => {
      const mockTrip = {
        id: 'trip-456',
        tripCode: 'IT-202605',
        tenantId: mockTenantId,
        status: 'OPEN',
        name: 'Viaje a Arenal',
        destination: 'La Fortuna',
        departureDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        returnDate: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000),
        createdByUserId: mockUserId,
        createdByName: mockUserName,
      };

      const mockBookings = [
        {
          id: 'booking-1',
          bookingCode: 'IT-202605-001',
          clientId: 'client-1',
          client: { email: 'client1@example.com', fullName: 'Client One' },
          internalTrip: mockTrip,
          status: 'PENDING',
          participantCount: 2,
          totalAmount: new Decimal('180000'),
          paidAmount: new Decimal('0'),
        },
        {
          id: 'booking-2',
          bookingCode: 'IT-202605-002',
          clientId: 'client-2',
          client: { email: 'client2@example.com', fullName: 'Client Two' },
          internalTrip: mockTrip,
          status: 'PENDING',
          participantCount: 3,
          totalAmount: new Decimal('270000'),
          paidAmount: new Decimal('90000'),
        },
      ];

      jest.spyOn(prismaService.internalTrip, 'findUnique').mockResolvedValue(mockTrip as any);
      jest.spyOn(prismaService.internalTourBooking, 'findMany').mockResolvedValue(mockBookings as any);
      jest.spyOn(prismaService.internalTrip, 'update').mockResolvedValue({
        ...mockTrip,
        status: 'CANCELLED',
      } as any);
      jest.spyOn(emailService, 'sendEmail').mockResolvedValue({} as any);

      await toursService.cancelTrip(mockTenantId, 'trip-456');

      // Verify that emails were sent to all clients
      expect(emailService.sendEmail).toHaveBeenCalledTimes(2);
      expect(emailService.sendEmail).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          to: mockBookings[0].client.email,
          template: 'trip-cancelled',
        }),
      );
      expect(emailService.sendEmail).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          to: mockBookings[1].client.email,
          template: 'trip-cancelled',
        }),
      );
    });
  });

  describe('E2E Flow 3: Create Booking → Cancel Booking', () => {
    it('Should cancel booking and send email with refund info', async () => {
      const mockTrip = {
        id: 'trip-789',
        name: 'Viaje a Arenal',
        destination: 'La Fortuna',
        departureDate: new Date(),
        returnDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
      };

      const mockClient = {
        email: 'client@example.com',
        fullName: 'Test Client',
      };

      const paidBooking = {
        id: 'booking-789',
        bookingCode: 'IT-202605-003',
        clientId: 'client-123',
        client: mockClient,
        internalTrip: mockTrip,
        status: 'PAID',
        participantCount: 2,
        totalAmount: new Decimal('180000'),
        paidAmount: new Decimal('180000'),
        pendingAmount: new Decimal('0'),
        currency: 'CRC',
        tenantId: mockTenantId,
      };

      const cancelledBooking = { ...paidBooking, status: 'CANCELLED' };

      jest.spyOn(prismaService.internalTourBooking, 'findUnique').mockResolvedValue(paidBooking as any);
      jest.spyOn(prismaService, '$transaction').mockResolvedValue(cancelledBooking);
      jest.spyOn(emailService, 'sendEmail').mockResolvedValue({} as any);

      const result = await bookingsService.cancelBooking(
        mockTenantId,
        'booking-789',
        mockUserId,
        mockUserName,
      );

      expect(result.status).toBe('CANCELLED');
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'trip-cancelled',
          to: mockClient.email,
          data: expect.objectContaining({
            refundAmount: 180000, // Full refund since it was paid
          }),
        }),
      );
    });
  });

  describe('E2E Flow 4: Multi-Tenant Isolation Verification', () => {
    it('Booking from tenant A should not be visible to tenant B', async () => {
      const tenantABooking = {
        id: 'booking-a',
        tenantId: 'tenant-a',
        bookingCode: 'IT-202605-001',
      };

      const tenantBBooking = {
        id: 'booking-b',
        tenantId: 'tenant-b',
        bookingCode: 'IT-202605-001',
      };

      // Mock: When tenant A lists bookings, should only get tenant A's bookings
      jest
        .spyOn(prismaService.internalTourBooking, 'findMany')
        .mockResolvedValueOnce([tenantABooking] as any); // First call for tenant A

      const resultA = await bookingsService.listBookings('tenant-a', {});
      expect(resultA[0].tenantId).toBe('tenant-a');

      // Mock: When tenant B lists bookings, should only get tenant B's bookings
      jest
        .spyOn(prismaService.internalTourBooking, 'findMany')
        .mockResolvedValueOnce([tenantBBooking] as any); // Second call for tenant B

      const resultB = await bookingsService.listBookings('tenant-b', {});
      expect(resultB[0].tenantId).toBe('tenant-b');

      // Verify that the queries were made with the correct tenant context
      expect(prismaService.internalTourBooking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-a',
          }),
        }),
      );

      expect(prismaService.internalTourBooking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-b',
          }),
        }),
      );
    });
  });

  describe('E2E Flow 5: Email Sending Error Handling', () => {
    it('Booking creation should succeed even if email sending fails', async () => {
      const mockTrip = {
        id: 'trip-email-test',
        tenantId: mockTenantId,
        status: 'OPEN',
        capacity: 20,
        price: new Decimal('90000'),
      };

      const mockClient = {
        id: 'client-email-test',
        email: 'client@example.com',
        fullName: 'Test Client',
        tenantId: mockTenantId,
      };

      const mockBooking = {
        id: 'booking-email-test',
        bookingCode: 'IT-202605-999',
        internalTripId: 'trip-email-test',
        clientId: 'client-email-test',
        participantCount: 1,
        totalAmount: new Decimal('90000'),
        paidAmount: new Decimal('0'),
        status: 'PENDING',
        tenantId: mockTenantId,
        client: mockClient,
        internalTrip: mockTrip,
      };

      jest.spyOn(prismaService.internalTrip, 'findUnique').mockResolvedValue(mockTrip as any);
      jest.spyOn(prismaService.client, 'findUnique').mockResolvedValue(mockClient as any);
      jest.spyOn(prismaService.internalTourBooking, 'count').mockResolvedValue(0);
      jest.spyOn(prismaService, '$transaction').mockResolvedValue({
        booking: mockBooking,
        invoice: {},
      });

      // Email service throws an error
      jest
        .spyOn(emailService, 'sendEmail')
        .mockRejectedValue(new Error('Resend API Error'));

      // Should still succeed because email errors are non-blocking
      const result = await bookingsService.createBooking(
        mockTenantId,
        mockUserId,
        mockUserName,
        {
          internalTripId: 'trip-email-test',
          participants: [
            { clientId: 'client-email-test', role: InternalTourBookingParticipantRole.HOLDER },
          ],
        },
      );

      expect(result).toBeDefined();
      expect(result.booking.id).toBe('booking-email-test');
    });
  });
});
