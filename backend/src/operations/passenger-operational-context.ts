import { calculateAge, formatDateOnly } from "../customers/customer-date-of-birth";
import { tenantCalendarDateForInstant } from "../finance/tenant-fiscal-date";

export type PassengerOperationalContext = {
  displayName: string;
  dateOfBirth: string | null;
  age: number | null;
  ageReferenceDate: string;
  ageReferenceType: "SERVICE_DATE" | "TRIP_DEPARTURE" | "CURRENT_DATE";
  role: string | null;
};

type PassengerOperationalContextSource = {
  displayName: string;
  dateOfBirth: Date | null;
  role: string | null;
};

type PassengerOperationalContextOptions = {
  serviceStartAt: Date | null;
  tripDepartureDate: Date | null;
  tenantTimezone: string;
  tenantCurrentDate: string;
};

export function passengerOperationalContexts(
  passengers: PassengerOperationalContextSource[],
  options: PassengerOperationalContextOptions,
): PassengerOperationalContext[] {
  const reference = ageReference(options);
  return passengers.map((passenger) => ({
    displayName: passenger.displayName,
    dateOfBirth: passenger.dateOfBirth ? formatDateOnly(passenger.dateOfBirth) : null,
    age: passenger.dateOfBirth ? calculateAge(passenger.dateOfBirth, reference.date) : null,
    ageReferenceDate: reference.date,
    ageReferenceType: reference.type,
    role: passenger.role,
  }));
}

function ageReference(options: PassengerOperationalContextOptions): {
  date: string;
  type: PassengerOperationalContext["ageReferenceType"];
} {
  if (options.serviceStartAt) {
    return {
      date: tenantCalendarDateForInstant(options.serviceStartAt, options.tenantTimezone),
      type: "SERVICE_DATE",
    };
  }
  if (options.tripDepartureDate) {
    return { date: formatDateOnly(options.tripDepartureDate), type: "TRIP_DEPARTURE" };
  }
  return { date: options.tenantCurrentDate, type: "CURRENT_DATE" };
}
