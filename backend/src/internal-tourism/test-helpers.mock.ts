import { Decimal } from '@prisma/client/runtime/library';
import { TransportType } from '@prisma/client';

/**
 * Mock Factories for Testing
 * Generates complete and valid mock objects matching Prisma schema
 */

export class MockFactory {
  // Mock Tenant
  static createMockTenant(overrides?: any) {
    return {
      id: 'tenant-123',
      name: 'Test Tenant',
      preferredCurrency: 'CRC',
      primaryColor: '#667eea',
      secondaryColor: '#764ba2',
      contactEmail: 'support@example.com',
      contactPhone: '+506XXXXXXXX',
      contactWhatsApp: '+506XXXXXXXX',
      businessAddress: 'San José, Costa Rica',
      logoUrl: null,
      websiteUrl: 'https://example.com',
      ...overrides,
    };
  }

  // Mock Client
  static createMockClient(overrides?: any) {
    return {
      id: 'client-123',
      email: 'client@example.com',
      fullName: 'Test Client',
      tenantId: 'tenant-123',
      ...overrides,
    };
  }

  // Mock InternalTrip (complete with all Prisma fields)
  static createMockTrip(overrides?: any) {
    return {
      id: 'trip-123',
      tripCode: 'IT-202605',
      name: 'Viaje a Arenal',
      destination: 'La Fortuna, Arenal',
      description: 'Descubre las maravillas de Arenal',
      departureDate: new Date('2026-06-15'),
      returnDate: new Date('2026-06-16'),
      departureTime: '08:00',
      returnTime: '18:00',
      capacity: 20,
      occupiedSlots: 0, // ✅ ADDED - required by Prisma schema
      price: new Decimal('90000'),
      currency: 'CRC',
      transportType: 'BUS' as TransportType,
      itinerary: '<p>Día 1: Salida temprano</p>',
      status: 'OPEN',
      createdByUserId: 'user-123',
      createdByName: 'Test User',
      createdAt: new Date(),
      updatedAt: new Date(),
      tenantId: 'tenant-123',
      bookings: [],
      ...overrides,
    };
  }

  // Mock InternalTourBooking (complete with all Prisma fields)
  static createMockBooking(overrides?: any) {
    return {
      id: 'booking-123',
      bookingCode: 'IT-202605-001',
      internalTripId: 'trip-123',
      clientId: 'client-123',
      participantCount: 2,
      totalAmount: new Decimal('180000'),
      paidAmount: new Decimal('0'),
      pendingAmount: new Decimal('180000'),
      currency: 'CRC',
      status: 'PENDING',
      notes: null,
      createdByUserId: 'user-123',
      createdByName: 'Test User',
      createdAt: new Date(),
      updatedAt: new Date(),
      tenantId: 'tenant-123',
      ...overrides,
    };
  }

  // Mock InternalTourInvoice
  static createMockInvoice(overrides?: any) {
    return {
      id: 'invoice-123',
      invoiceNumber: 'IT-INV-202605-001',
      bookingId: 'booking-123',
      totalAmount: new Decimal('180000'),
      paidAmount: new Decimal('0'),
      pendingAmount: new Decimal('180000'),
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      tenantId: 'tenant-123',
      ...overrides,
    };
  }

  // Mock with relations (for testing with includes)
  static createMockTripWithRelations(overrides?: any) {
    return {
      ...this.createMockTrip(overrides),
      tenant: this.createMockTenant(),
      bookings: [],
    };
  }

  // Mock with relations (for testing with includes)
  static createMockBookingWithRelations(overrides?: any) {
    return {
      ...this.createMockBooking(overrides),
      internalTrip: this.createMockTrip(),
      client: this.createMockClient(),
      invoice: this.createMockInvoice(),
      tenant: this.createMockTenant(),
    };
  }

  // Mock User from request
  static createMockUserRequest(overrides?: any) {
    return {
      user: {
        id: 'user-123',
        email: 'user@example.com',
        fullName: 'Test User',
        ...overrides?.user,
      },
      ...overrides,
    };
  }

  // Mock Trip DTO for create
  static createMockCreateTripDto(overrides?: any) {
    return {
      name: 'Viaje a Arenal',
      destination: 'La Fortuna, Arenal',
      description: 'Descubre las maravillas',
      departureDate: '2026-06-15',
      returnDate: '2026-06-16',
      departureTime: '08:00',
      returnTime: '18:00',
      capacity: 20,
      price: 90000,
      currency: 'CRC',
      transportType: 'BUS' as TransportType,
      itinerary: '<p>Día 1</p>',
      ...overrides,
    };
  }

  // Mock Booking DTO for create
  static createMockCreateBookingDto(overrides?: any) {
    return {
      internalTripId: 'trip-123',
      clientId: 'client-123',
      participantCount: 2,
      notes: null,
      ...overrides,
    };
  }

  // Mock Trip Stats
  static createMockTripStats(overrides?: any) {
    return {
      totalCapacity: 20,
      bookedSlots: 5,
      availableSlots: 15,
      occupancyPercentage: 25,
      totalIncome: new Decimal('450000'),
      pendingIncome: new Decimal('90000'),
      ...overrides,
    };
  }
}
