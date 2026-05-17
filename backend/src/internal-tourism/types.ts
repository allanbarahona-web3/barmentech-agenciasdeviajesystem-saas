import { InternalTrip, InternalTourBooking, InternalTourInvoice } from '@prisma/client';

export interface InternalTripWithBookings extends InternalTrip {
  bookings: InternalTourBooking[];
}

export interface InternalBookingWithRelations extends InternalTourBooking {
  internalTrip: InternalTrip;
  invoice: InternalTourInvoice | null;
}

export interface InternalTourInvoiceWithBooking extends InternalTourInvoice {
  booking: InternalTourBooking;
}

export interface TripGenerationResult {
  tripCode: string;
  name: string;
  destination: string;
}

export interface BookingGenerationResult {
  bookingCode: string;
  totalAmount: number;
  currency: string;
}

export interface InvoiceGenerationResult {
  invoiceNumber: string;
  totalAmount: number;
  paymentDueDate: Date | null;
}
