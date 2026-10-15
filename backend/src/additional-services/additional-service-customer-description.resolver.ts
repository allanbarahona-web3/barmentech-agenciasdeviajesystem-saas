import type { AdditionalServiceDetails } from "./service-details";

export type AdditionalServiceCustomerDescriptionInput = {
  serviceCode: string;
  serviceName: string;
  serviceDetails: AdditionalServiceDetails;
  commercialDestination?: string | null;
};

const GENERIC_SERVICE_LABELS: Readonly<Record<string, string>> = {
  BAGGAGE: "Equipaje adicional",
  FLIGHT_TICKET: "Boleto aéreo",
  INSURANCE: "Seguro de viaje",
  SEAT_SELECTION: "Selección de asiento",
  TRANSPORTATION: "Traslado",
  TOUR: "Tour",
  EVENT_TICKET: "Entrada para evento",
  TRAVEL_EXTENSION: "Extensión de viaje",
  TRIP_REDUCTION: "Modificación de viaje",
  VISA_ASSISTANCE: "Asistencia de visa",
};

const LODGING_LABELS: Readonly<Record<string, string>> = {
  HOTEL_WITH_BREAKFAST: "Hotel con desayuno",
  HOTEL_WITHOUT_BREAKFAST: "Hotel",
  HOSTEL: "Hostal",
  AIRBNB: "Airbnb",
};

const ACCOMMODATION_LABELS: Readonly<Record<string, string>> = {
  SINGLE: "Habitación sencilla",
  DOUBLE: "Habitación doble",
  TRIPLE: "Habitación triple",
  QUADRUPLE: "Habitación cuádruple",
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeDisplayText(value: unknown): string | null {
  const result = text(value);
  if (!result) return null;

  const withoutAirportCodes = result
    .replace(/\b[A-Z]{3}\b/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–—→]+|[\s\-–—→]+$/g, "")
    .trim();

  return withoutAirportCodes || null;
}

function detailText(
  details: AdditionalServiceDetails,
  field: string,
): string | null {
  return text(details[field]);
}

function airportPlace(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const airport = value as AdditionalServiceDetails;
  return safeDisplayText(airport.city) ?? safeDisplayText(airport.name);
}

function appendDestination(label: string, destination: string | null): string {
  return destination ? `${label} ${destination}` : label;
}

function safeFallbackServiceName(serviceName: string): string {
  const normalized = text(serviceName);
  if (!normalized || /^[A-Z0-9]+(?:[_-][A-Z0-9]+)+$/.test(normalized)) {
    return "Servicio adicional";
  }
  return normalized;
}

/**
 * Produces the immutable commercial label sold to the customer. It deliberately
 * accepts no supplier or cost-source data, so those internal authorities cannot
 * become part of the generated snapshot.
 */
export function resolveAdditionalServiceCustomerFacingDescription(
  input: AdditionalServiceCustomerDescriptionInput,
): string {
  const serviceCode = input.serviceCode.trim().toUpperCase();
  const destination = safeDisplayText(input.commercialDestination);

  switch (serviceCode) {
    case "FLIGHT_TICKET": {
      const origin = airportPlace(input.serviceDetails.originAirport);
      const arrival = airportPlace(input.serviceDetails.destinationAirport);
      if (origin && arrival) return `${origin} – ${arrival}`;
      if (origin || arrival) {
        return appendDestination(
          GENERIC_SERVICE_LABELS.FLIGHT_TICKET,
          origin ?? arrival,
        );
      }
      return GENERIC_SERVICE_LABELS.FLIGHT_TICKET;
    }
    case "LODGING":
      return appendDestination(
        LODGING_LABELS[detailText(input.serviceDetails, "lodgingType") ?? ""] ??
          "Hospedaje",
        destination,
      );
    case "ACCOMMODATION_TYPE":
      return appendDestination(
        ACCOMMODATION_LABELS[
          detailText(input.serviceDetails, "accommodationType") ?? ""
        ] ?? "Acomodación",
        destination,
      );
    case "TRANSPORTATION":
      return appendDestination(GENERIC_SERVICE_LABELS.TRANSPORTATION, destination);
    case "TOUR":
      return appendDestination(GENERIC_SERVICE_LABELS.TOUR, destination);
    case "EVENT_TICKET":
      return appendDestination(GENERIC_SERVICE_LABELS.EVENT_TICKET, destination);
    default:
      return GENERIC_SERVICE_LABELS[serviceCode] ?? safeFallbackServiceName(input.serviceName);
  }
}
