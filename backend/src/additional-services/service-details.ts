import { BadRequestException } from "@nestjs/common";

export type AdditionalServiceDetailsValue =
  | string
  | number
  | boolean
  | null
  | AdditionalServiceDetailsValue[]
  | { [key: string]: AdditionalServiceDetailsValue };

export type AdditionalServiceDetails = {
  [key: string]: AdditionalServiceDetailsValue;
};

type DetailsInput = Record<string, unknown>;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function invalid(serviceCode: string, field: string): never {
  throw new BadRequestException(
    `El detalle comercial ${field} de ${serviceCode} es inválido.`,
  );
}

function object(
  value: unknown,
  serviceCode: string,
  field = "serviceDetails",
): DetailsInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(serviceCode, field);
  }
  return value as DetailsInput;
}

function text(
  input: DetailsInput,
  field: string,
  serviceCode: string,
): string {
  const value = input[field];
  if (typeof value !== "string" || !value.trim()) {
    invalid(serviceCode, field);
  }
  return value.trim();
}

function nullableText(
  input: DetailsInput,
  field: string,
  serviceCode: string,
): string | null {
  const value = input[field];
  if (value === null) return null;
  return text(input, field, serviceCode);
}

function choice<T extends string>(
  input: DetailsInput,
  field: string,
  choices: readonly T[],
  serviceCode: string,
): T {
  const value = input[field];
  if (typeof value !== "string" || !choices.includes(value as T)) {
    invalid(serviceCode, field);
  }
  return value as T;
}

function number(
  input: DetailsInput,
  field: string,
  serviceCode: string,
  integer = false,
): number {
  const value = input[field];
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    (integer && !Number.isInteger(value))
  ) {
    invalid(serviceCode, field);
  }
  return value;
}

function nullableNumber(
  input: DetailsInput,
  field: string,
  serviceCode: string,
): number | null {
  if (input[field] === null) return null;
  return number(input, field, serviceCode);
}

function date(
  input: DetailsInput,
  field: string,
  serviceCode: string,
): string {
  const value = text(input, field, serviceCode);
  if (!DATE_PATTERN.test(value)) invalid(serviceCode, field);
  return value;
}

function nullableDate(
  input: DetailsInput,
  field: string,
  serviceCode: string,
): string | null {
  if (input[field] === null) return null;
  return date(input, field, serviceCode);
}

function airport(
  input: DetailsInput,
  field: string,
  serviceCode: string,
): AdditionalServiceDetails {
  const value = object(input[field], serviceCode, field);
  const result: AdditionalServiceDetails = {
    iata: text(value, "iata", serviceCode),
    name: text(value, "name", serviceCode),
    city: text(value, "city", serviceCode),
    country: text(value, "country", serviceCode),
    countryCode: text(value, "countryCode", serviceCode),
  };
  if (value.icao !== undefined) {
    result.icao = text(value, "icao", serviceCode);
  }
  return result;
}

export function normalizeAdditionalServiceDetails(
  serviceCode: string,
  rawDetails: unknown,
): AdditionalServiceDetails {
  const details = object(rawDetails, serviceCode);

  switch (serviceCode) {
    case "BAGGAGE": {
      const baggageTypes = details.baggageTypes;
      const allowed = ["CARRY_ON", "HAND_BAGGAGE", "CHECKED_BAGGAGE"] as const;
      if (
        !Array.isArray(baggageTypes) ||
        baggageTypes.length === 0 ||
        baggageTypes.some(
          (value) => typeof value !== "string" || !allowed.includes(value as never),
        )
      ) {
        invalid(serviceCode, "baggageTypes");
      }
      return {
        baggageTypes: [...new Set(baggageTypes as string[])],
        tripScope: choice(
          details,
          "tripScope",
          ["SINGLE_TRIP", "MULTIPLE_TRIPS"],
          serviceCode,
        ),
        pieceQuantity: number(details, "pieceQuantity", serviceCode, true),
        weightKg: number(details, "weightKg", serviceCode),
      };
    }
    case "LODGING": {
      const checkInDate = date(details, "checkInDate", serviceCode);
      const checkOutDate = date(details, "checkOutDate", serviceCode);
      if (checkOutDate <= checkInDate) invalid(serviceCode, "checkOutDate");
      return {
        lodgingType: choice(
          details,
          "lodgingType",
          [
            "HOTEL_WITH_BREAKFAST",
            "HOTEL_WITHOUT_BREAKFAST",
            "HOSTEL",
            "AIRBNB",
          ],
          serviceCode,
        ),
        checkInDate,
        checkOutDate,
      };
    }
    case "ACCOMMODATION_TYPE":
      return {
        accommodationType: choice(
          details,
          "accommodationType",
          ["SINGLE", "DOUBLE", "TRIPLE", "QUADRUPLE"],
          serviceCode,
        ),
      };
    case "INSURANCE": {
      const coverage = choice(
        details,
        "coverage",
        ["USD_35000", "USD_60000", "OTHER"],
        serviceCode,
      );
      const customCoverageAmount = nullableNumber(
        details,
        "customCoverageAmount",
        serviceCode,
      );
      if (coverage === "OTHER" && customCoverageAmount === null) {
        invalid(serviceCode, "customCoverageAmount");
      }
      return {
        coverage,
        customCoverageAmount,
        currency: choice(details, "currency", ["USD"], serviceCode),
      };
    }
    case "TRANSPORTATION":
      return {
        transportationType: choice(
          details,
          "transportationType",
          [
            "AIRPLANE",
            "UBER",
            "TAXI",
            "TRAIN",
            "FERRY",
            "SHUTTLE_BUS",
            "PRIVATE_TRANSPORT",
          ],
          serviceCode,
        ),
        tripType: choice(
          details,
          "tripType",
          ["ONE_WAY", "ROUND_TRIP"],
          serviceCode,
        ),
        serviceDate: date(details, "serviceDate", serviceCode),
        origin: text(details, "origin", serviceCode),
        destination: text(details, "destination", serviceCode),
      };
    case "TOUR":
      return {
        tourName: text(details, "tourName", serviceCode),
        serviceDate: date(details, "serviceDate", serviceCode),
      };
    case "FLIGHT_TICKET": {
      const tripType = choice(
        details,
        "tripType",
        ["ONE_WAY", "ROUND_TRIP"],
        serviceCode,
      );
      const returnDate = nullableDate(details, "returnDate", serviceCode);
      if (tripType === "ROUND_TRIP" && returnDate === null) {
        invalid(serviceCode, "returnDate");
      }
      return {
        tripType,
        originAirport: airport(details, "originAirport", serviceCode),
        destinationAirport: airport(
          details,
          "destinationAirport",
          serviceCode,
        ),
        departureDate: date(details, "departureDate", serviceCode),
        returnDate: tripType === "ROUND_TRIP" ? returnDate : null,
        quantity: number(details, "quantity", serviceCode, true),
      };
    }
    case "SEAT_SELECTION": {
      const seatPreference = choice(
        details,
        "seatPreference",
        [
          "WINDOW",
          "AISLE",
          "MIDDLE",
          "EXIT_ROW",
          "FRONT_CABIN",
          "EXTRA_LEGROOM",
          "NO_PREFERENCE",
          "OTHER",
        ],
        serviceCode,
      );
      const otherPreferenceDescription = nullableText(
        details,
        "otherPreferenceDescription",
        serviceCode,
      );
      if (seatPreference === "OTHER" && otherPreferenceDescription === null) {
        invalid(serviceCode, "otherPreferenceDescription");
      }
      return {
        seatPreference,
        otherPreferenceDescription:
          seatPreference === "OTHER" ? otherPreferenceDescription : null,
        quantity: number(details, "quantity", serviceCode, true),
      };
    }
    case "EVENT_TICKET":
      return {
        eventName: text(details, "eventName", serviceCode),
        serviceDate: date(details, "serviceDate", serviceCode),
        quantity: number(details, "quantity", serviceCode, true),
        venueOrCity: text(details, "venueOrCity", serviceCode),
      };
    case "TRAVEL_EXTENSION":
    case "TRIP_REDUCTION":
      return {
        newReturnDate: date(details, "newReturnDate", serviceCode),
        quantity: number(details, "quantity", serviceCode, true),
      };
    case "VISA_ASSISTANCE":
      return {
        destinationCountry: text(
          details,
          "destinationCountry",
          serviceCode,
        ),
        visaType: choice(
          details,
          "visaType",
          ["TOURISM", "BUSINESS", "STUDENT", "WORK", "TRANSIT", "OTHER"],
          serviceCode,
        ),
        expectedTravelDate: nullableDate(
          details,
          "expectedTravelDate",
          serviceCode,
        ),
      };
    default:
      throw new BadRequestException(
        `El servicio adicional ${serviceCode} no admite detalles comerciales.`,
      );
  }
}
