import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { InternalBookingsService } from './internal-bookings.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CreateInternalBookingDto } from './dto';
import { Decimal } from '@prisma/client/runtime/library';
import { MockFactory } from './test-helpers.mock';
import { InternalTourBookingParticipantRole } from './enums';

describe('InternalBookingsService', () => {
  let service: InternalBookingsService;
  let prismaService: PrismaService;
  let emailService: EmailService;

  // Mock data
  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-123';
  const mockUserName = 'Test User';

  // Use MockFactory for complete mock objects
  let mockTrip: any;
  let mockClient: any;
  let mockBooking: any;
  let mockInvoice: any;

  beforeEach(async () => {
    mockTrip = MockFactory.createMockTrip();
    mockClient = MockFactory.createMockClient();
    mockBooking = MockFactory.createMockBooking();
    mockInvoice = MockFactory.createMockInvoice();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InternalBookingsService,
        {
          provide: PrismaService,
          useValue: {
            internalTourBooking: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
            },
            internalTourInvoice: {
              create: jest.fn(),
              update: jest.fn(),
              findUnique: jest.fn(),
            },
            internalTrip: {
              findUnique: jest.fn(),
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

    service = module.get<InternalBookingsService>(InternalBookingsService);
    prismaService = module.get<PrismaService>(PrismaService);
    emailService = module.get<EmailService>(EmailService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createBooking', () => {
    let createBookingDto: CreateInternalBookingDto;

    beforeEach(() => {
      createBookingDto = MockFactory.createMockCreateBookingDto();
    });

    it('should create a booking successfully and send confirmation email', async () => {
      jest.spyOn(prismaService.internalTrip, 'findUnique').mockResolvedValue(mockTrip);
      jest.spyOn(prismaService.client, 'findUnique').mockResolvedValue(mockClient);
      jest.spyOn(prismaService.internalTourBooking, 'count').mockResolvedValue(0);

      const transactionResult = {
        booking: { ...mockBooking, internalTrip: mockTrip, client: mockClient },
        invoice: mockInvoice,
      };

      jest.spyOn(prismaService, '$transaction').mockResolvedValue(transactionResult);
      jest.spyOn(emailService, 'sendEmail').mockResolvedValue({} as any);

      const result = await service.createBooking(mockTenantId, mockUserId, mockUserName, createBookingDto);

      expect(result).toBeDefined();
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'booking-confirmation',
        }),
      );
    });

    it('should throw error if trip does not exist', async () => {
      jest.spyOn(prismaService.internalTrip, 'findUnique').mockResolvedValue(null);

      await expect(
        service.createBooking(mockTenantId, mockUserId, mockUserName, createBookingDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw error if client does not exist', async () => {
      jest.spyOn(prismaService.internalTrip, 'findUnique').mockResolvedValue(mockTrip);
      jest.spyOn(prismaService.client, 'findUnique').mockResolvedValue(null);

      await expect(
        service.createBooking(mockTenantId, mockUserId, mockUserName, createBookingDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw error if trip is not OPEN', async () => {
      const cancelledTrip = { ...mockTrip, status: 'CANCELLED' };
      jest.spyOn(prismaService.internalTrip, 'findUnique').mockResolvedValue(cancelledTrip);

      await expect(
        service.createBooking(mockTenantId, mockUserId, mockUserName, createBookingDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error if booking would exceed trip capacity', async () => {
      const fullTrip = { ...mockTrip, capacity: 5 };
      jest.spyOn(prismaService.internalTrip, 'findUnique').mockResolvedValue(fullTrip);
      jest.spyOn(prismaService.client, 'findUnique').mockResolvedValue(mockClient);
      jest.spyOn(prismaService.internalTourBooking, 'count').mockResolvedValue(4); // 4 participants already booked

      await expect(
        service.createBooking(mockTenantId, mockUserId, mockUserName, createBookingDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error if client already has booking for this trip', async () => {
      jest.spyOn(prismaService.internalTrip, 'findUnique').mockResolvedValue(mockTrip);
      jest.spyOn(prismaService.client, 'findUnique').mockResolvedValue(mockClient);
      jest.spyOn(prismaService.internalTourBooking, 'findMany').mockResolvedValue([mockBooking]);

      await expect(
        service.createBooking(mockTenantId, mockUserId, mockUserName, createBookingDto),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getBooking', () => {
    it('should return a booking by id', async () => {
      jest.spyOn(prismaService.internalTourBooking, 'findUnique').mockResolvedValue(mockBooking);

      const result = await service.getBooking(mockTenantId, 'booking-123');

      expect(result).toEqual(mockBooking);
    });

    it('should throw error if booking does not exist', async () => {
      jest.spyOn(prismaService.internalTourBooking, 'findUnique').mockResolvedValue(null);

      await expect(service.getBooking(mockTenantId, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw error if booking belongs to different tenant', async () => {
      const otherTenantBooking = { ...mockBooking, tenantId: 'other-tenant' };
      jest.spyOn(prismaService.internalTourBooking, 'findUnique').mockResolvedValue(otherTenantBooking);

      await expect(service.getBooking(mockTenantId, 'booking-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listBookings', () => {
    it('should return list of bookings', async () => {
      const bookings = [mockBooking, { ...mockBooking, id: 'booking-456' }];
      jest.spyOn(prismaService.internalTourBooking, 'findMany').mockResolvedValue(bookings);

      const result = await service.listBookings(mockTenantId, {});

      expect(result).toEqual(bookings);
    });

    it('should filter by trip id', async () => {
      jest.spyOn(prismaService.internalTourBooking, 'findMany').mockResolvedValue([mockBooking]);

      await service.listBookings(mockTenantId, { internalTripId: 'trip-123' });

      expect(prismaService.internalTourBooking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            internalTripId: 'trip-123',
          }),
        }),
      );
    });

    it('should filter by status', async () => {
      jest.spyOn(prismaService.internalTourBooking, 'findMany').mockResolvedValue([mockBooking]);

      await service.listBookings(mockTenantId, { status: 'PENDING' });

      expect(prismaService.internalTourBooking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PENDING',
          }),
        }),
      );
    });
  });

  describe('recordPayment', () => {
    it('should record payment and send confirmation email', async () => {
      jest.spyOn(prismaService.internalTourBooking, 'findUnique').mockResolvedValue(mockBooking);

      const updatedBooking = {
        ...mockBooking,
        paidAmount: new Decimal('180000'),
        pendingAmount: new Decimal('0'),
        status: 'PAID',
      };

      jest.spyOn(prismaService, '$transaction').mockResolvedValue(updatedBooking);
      jest.spyOn(emailService, 'sendEmail').mockResolvedValue({} as any);

      const result = await service.recordPayment(mockTenantId, 'booking-123', 180000, mockUserId, mockUserName);

      expect(result).toBeDefined();
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'payment-received',
        }),
      );
    });

    it('should throw error if booking does not exist', async () => {
      jest.spyOn(prismaService.internalTourBooking, 'findUnique').mockResolvedValue(null);

      await expect(
        service.recordPayment(mockTenantId, 'nonexistent', 100000, mockUserId, mockUserName),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw error if payment exceeds pending amount', async () => {
      jest.spyOn(prismaService.internalTourBooking, 'findUnique').mockResolvedValue(mockBooking);

      // Trying to pay more than pending amount
      await expect(
        service.recordPayment(mockTenantId, 'booking-123', 200000, mockUserId, mockUserName),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle partial payments', async () => {
      jest.spyOn(prismaService.internalTourBooking, 'findUnique').mockResolvedValue(mockBooking);

      const partiallyPaidBooking = {
        ...mockBooking,
        paidAmount: new Decimal('90000'),
        pendingAmount: new Decimal('90000'),
        status: 'PENDING',
      };

      jest.spyOn(prismaService, '$transaction').mockResolvedValue(partiallyPaidBooking);
      jest.spyOn(emailService, 'sendEmail').mockResolvedValue({} as any);

      const result = await service.recordPayment(mockTenantId, 'booking-123', 90000, mockUserId, mockUserName);

      expect(result.paidAmount).toEqual(new Decimal('90000'));
      expect(result.pendingAmount).toEqual(new Decimal('90000'));
      expect(result.status).toBe('PENDING');
    });
  });

  describe('cancelBooking', () => {
    it('should cancel booking and send cancellation email with refund info', async () => {
      const paidBooking = {
        ...mockBooking,
        paidAmount: new Decimal('90000'),
        pendingAmount: new Decimal('90000'),
      };

      jest.spyOn(prismaService.internalTourBooking, 'findUnique').mockResolvedValue(paidBooking);

      const cancelledBooking = { ...paidBooking, status: 'CANCELLED' };
      jest.spyOn(prismaService, '$transaction').mockResolvedValue(cancelledBooking);
      jest.spyOn(emailService, 'sendEmail').mockResolvedValue({} as any);

      const result = await service.cancelBooking(mockTenantId, 'booking-123', mockUserId, mockUserName);

      expect(result.status).toBe('CANCELLED');
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'trip-cancelled',
          data: expect.objectContaining({
            recipientName: mockClient.fullName,
            refundAmount: 90000, // paidAmount
          }),
        }),
      );
    });

    it('should throw error if booking does not exist', async () => {
      jest.spyOn(prismaService.internalTourBooking, 'findUnique').mockResolvedValue(null);

      await expect(
        service.cancelBooking(mockTenantId, 'nonexistent', mockUserId, mockUserName),
      ).rejects.toThrow(NotFoundException);
    });

    it('should not allow cancelling already cancelled booking', async () => {
      const cancelledBooking = { ...mockBooking, status: 'CANCELLED' };
      jest.spyOn(prismaService.internalTourBooking, 'findUnique').mockResolvedValue(cancelledBooking);

      await expect(
        service.cancelBooking(mockTenantId, 'booking-123', mockUserId, mockUserName),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Code Generators', () => {
    describe('generateBookingCode', () => {
      it('should generate booking code in IT-YYYYMM-NNN format', async () => {
        // Mock: 5 bookings already exist for this trip this month
        jest.spyOn(prismaService.internalTourBooking, 'count').mockResolvedValue(5);

        // Use private method via reflection or test the public version in controller
        // For now, we'll test through the service's public interface
        // The format should be IT-202605-006 (next number is 6)
        const code = await (service as any).generateBookingCode();

        expect(code).toMatch(/^IT-\d{6}-\d{3}$/);
      });
    });

    describe('generateInvoiceNumber', () => {
      it('should generate invoice number in IT-INV-YYYYMM-NNN format', async () => {
        jest.spyOn(prismaService.internalTourInvoice, 'count').mockResolvedValue(3);

        // Test through the service's interface
        const number = await (service as any).generateInvoiceNumber();

        expect(number).toMatch(/^IT-INV-\d{6}-\d{3}$/);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle currency conversion properly (Decimal precision)', async () => {
      jest.spyOn(prismaService.internalTrip, 'findUnique').mockResolvedValue(mockTrip);
      jest.spyOn(prismaService.client, 'findUnique').mockResolvedValue(mockClient);
      jest.spyOn(prismaService.internalTourBooking, 'count').mockResolvedValue(0);

      // 3 participants x 90000 CRC = 270000 CRC
      const transactionResult = {
        booking: {
          ...mockBooking,
          participantCount: 3,
          totalAmount: new Decimal('270000'),
          client: mockClient,
          internalTrip: mockTrip,
        },
        invoice: { ...mockInvoice, totalAmount: new Decimal('270000') },
      };

      jest.spyOn(prismaService, '$transaction').mockResolvedValue(transactionResult);
      jest.spyOn(emailService, 'sendEmail').mockResolvedValue({} as any);

      const result = await service.createBooking(mockTenantId, mockUserId, mockUserName, {
        internalTripId: 'trip-123',
        participants: [
          { clientId: 'client-123', role: InternalTourBookingParticipantRole.HOLDER },
          { clientId: 'client-456', role: InternalTourBookingParticipantRole.COMPANION },
          { clientId: 'client-789', role: InternalTourBookingParticipantRole.COMPANION },
        ],
      });

      expect(result.booking.totalAmount).toEqual(new Decimal('270000'));
    });

    it('should handle multiple partial payments accumulating to full payment', async () => {
      const bookingWithFirstPayment = {
        ...mockBooking,
        paidAmount: new Decimal('60000'),
        pendingAmount: new Decimal('120000'),
      };

      jest.spyOn(prismaService.internalTourBooking, 'findUnique').mockResolvedValue(bookingWithFirstPayment);

      const updatedBooking = {
        ...bookingWithFirstPayment,
        paidAmount: new Decimal('150000'),
        pendingAmount: new Decimal('30000'),
      };

      jest.spyOn(prismaService, '$transaction').mockResolvedValue(updatedBooking);
      jest.spyOn(emailService, 'sendEmail').mockResolvedValue({} as any);

      const result = await service.recordPayment(mockTenantId, 'booking-123', 90000, mockUserId, mockUserName);

      expect(result.paidAmount).toEqual(new Decimal('150000'));
      expect(result.pendingAmount).toEqual(new Decimal('30000'));
    });
  });
});
