import { BadRequestException } from "@nestjs/common";

type Category = { code: string; origin: string };

export type CostComponentDetails = {
  detailPayload: unknown | null;
  detailSchemaVersion: number | null;
  quantity: string | null;
  unit: string | null;
};

type DetailContract = {
  version: number;
  normalize(payload: unknown): Record<string, unknown>;
};

const FLIGHT_TYPES = ["INTERNAL", "INTERNATIONAL"] as const;
const TRIP_TYPES = ["ONE_WAY", "ROUND_TRIP"] as const;
const CABIN_CLASSES = ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST", "OTHER"] as const;
const BAGGAGE_TYPES = ["CHECKED", "CARRY_ON", "EXCESS", "SPORTS_EQUIPMENT", "OTHER"] as const;
const LODGING_TYPES = ["HOTEL", "HOSTEL", "AIRBNB", "APARTMENT", "OTHER"] as const;
const ROOM_TYPES = ["SINGLE", "MATRIMONIAL", "DOUBLE", "TRIPLE", "QUADRUPLE", "OTHER"] as const;
// Legacy SHARED_TRANSFER, CAR_RENTAL, and RAIL values remain accepted for
// historical payloads. New components use the approved Cost Engine codes.
const TRANSPORTATION_TYPES = ["PRIVATE_TRANSFER", "SHARED_SHUTTLE", "BUS", "TRAIN", "FERRY", "TAXI_LOCAL", "RENTAL_CAR", "OTHER", "SHARED_TRANSFER", "CAR_RENTAL", "RAIL"] as const;
const TOUR_TYPES = ["HALF_DAY", "FULL_DAY", "MULTI_DAY", "OTHER"] as const;
// TRIP_CANCELLATION remains accepted for historical detail payloads. New
// insurance components use the shorter Cost Engine-owned CANCELLATION code.
const INSURANCE_COVERAGE_TYPES = ["MEDICAL", "CANCELLATION", "BAGGAGE", "COMPREHENSIVE", "OTHER", "TRIP_CANCELLATION"] as const;
// TOURIST remains accepted for historical detail payloads. New components use
// the approved Cost Engine-owned TOURISM code.
const VISA_TYPES = ["TOURISM", "BUSINESS", "TRANSIT", "STUDENT", "WORK", "OTHER", "TOURIST"] as const;
const MEAL_PLAN_TYPES = ["BREAKFAST", "LUNCH", "DINNER", "HALF_BOARD", "FULL_BOARD", "ALL_INCLUSIVE", "OTHER"] as const;

const CONTRACTS: Record<string, DetailContract> = {
  AIRFARE: {
    version: 1,
    normalize: (payload) => object(payload, ["flightType", "tripType", "origin", "destination", "departureDate", "returnDate", "airline", "cabinClass"], (value) => {
      const tripType = requiredEnum(value, "tripType", TRIP_TYPES);
      const departureDate = requiredDate(value, "departureDate");
      const returnDate = tripType === "ROUND_TRIP" ? requiredDate(value, "returnDate") : optionalDate(value, "returnDate");
      assertDateOrder(departureDate, returnDate, "departureDate", "returnDate");
      return {
        flightType: requiredEnum(value, "flightType", FLIGHT_TYPES), tripType,
        origin: requiredString(value, "origin"), destination: requiredString(value, "destination"), departureDate,
        ...optionalField(value, "returnDate", returnDate),
        ...optionalField(value, "airline", optionalString(value, "airline")),
        ...optionalField(value, "cabinClass", optionalEnum(value, "cabinClass", CABIN_CLASSES)),
      };
    }),
  },
  BAGGAGE: {
    version: 1,
    normalize: (payload) => object(payload, ["baggageType", "pieces", "weightKg", "relatedAirfareComponentId"], (value) => ({
      baggageType: requiredEnum(value, "baggageType", BAGGAGE_TYPES),
      pieces: requiredPositiveInteger(value, "pieces"),
      ...optionalField(value, "weightKg", optionalPositiveDecimal(value, "weightKg")),
      ...optionalField(value, "relatedAirfareComponentId", optionalString(value, "relatedAirfareComponentId")),
    })),
  },
  LODGING: {
    version: 1,
    normalize: (payload) => object(payload, ["propertyName", "city", "lodgingType", "roomType", "checkIn", "checkOut", "nights", "roomCount"], (value) => {
      const checkIn = requiredDate(value, "checkIn");
      const checkOut = requiredDate(value, "checkOut");
      assertDateOrder(checkIn, checkOut, "checkIn", "checkOut");
      return {
        propertyName: requiredString(value, "propertyName"), city: requiredString(value, "city"),
        lodgingType: requiredEnum(value, "lodgingType", LODGING_TYPES), roomType: requiredEnum(value, "roomType", ROOM_TYPES), checkIn, checkOut,
        nights: requiredPositiveInteger(value, "nights"), roomCount: requiredPositiveInteger(value, "roomCount"),
      };
    }),
  },
  TRANSPORTATION: {
    version: 1,
    normalize: (payload) => object(payload, ["transportationType", "tripType", "origin", "destination", "serviceDate", "serviceTime", "returnDate"], (value) => {
      const tripType = requiredEnum(value, "tripType", TRIP_TYPES);
      const serviceDate = requiredDate(value, "serviceDate");
      const returnDate = tripType === "ROUND_TRIP" ? requiredDate(value, "returnDate") : optionalDate(value, "returnDate");
      assertDateOrder(serviceDate, returnDate, "serviceDate", "returnDate");
      return {
        transportationType: requiredEnum(value, "transportationType", TRANSPORTATION_TYPES), tripType,
        origin: requiredString(value, "origin"), destination: requiredString(value, "destination"), serviceDate,
        ...optionalField(value, "serviceTime", optionalTime(value, "serviceTime")),
        ...optionalField(value, "returnDate", returnDate),
      };
    }),
  },
  TOUR: {
    version: 1,
    normalize: (payload) => object(payload, ["activityName", "tourType", "location", "serviceDate", "duration"], (value) => ({
      activityName: requiredString(value, "activityName"), tourType: requiredEnum(value, "tourType", TOUR_TYPES), location: requiredString(value, "location"),
      serviceDate: requiredDate(value, "serviceDate"), ...optionalField(value, "duration", optionalString(value, "duration")),
    })),
  },
  INSURANCE: {
    version: 1,
    normalize: (payload) => object(payload, ["coverageType", "startDate", "endDate", "coverageAmount"], (value) => {
      const startDate = requiredDate(value, "startDate");
      const endDate = requiredDate(value, "endDate");
      assertDateOrder(startDate, endDate, "startDate", "endDate");
      return {
        coverageType: requiredEnum(value, "coverageType", INSURANCE_COVERAGE_TYPES), startDate, endDate,
        ...optionalField(value, "coverageAmount", optionalPositiveDecimal(value, "coverageAmount")),
      };
    }),
  },
  EVENT_TICKET: {
    version: 1,
    normalize: (payload) => object(payload, ["eventName", "venue", "city", "eventDate"], (value) => ({
      eventName: requiredString(value, "eventName"), venue: requiredString(value, "venue"),
      city: requiredString(value, "city"), eventDate: requiredDate(value, "eventDate"),
    })),
  },
  VISA_ASSISTANCE: {
    version: 1,
    normalize: (payload) => object(payload, ["destinationCountry", "visaType", "expectedTravelDate"], (value) => ({
      destinationCountry: requiredString(value, "destinationCountry"), visaType: requiredEnum(value, "visaType", VISA_TYPES),
      expectedTravelDate: requiredDate(value, "expectedTravelDate"),
    })),
  },
  MEALS: {
    version: 1,
    normalize: (payload) => object(payload, ["mealPlanType", "startDate", "endDate"], (value) => {
      const startDate = requiredDate(value, "startDate");
      const endDate = optionalDate(value, "endDate");
      assertDateOrder(startDate, endDate, "startDate", "endDate");
      return {
        mealPlanType: requiredEnum(value, "mealPlanType", MEAL_PLAN_TYPES), startDate,
        ...optionalField(value, "endDate", endDate),
      };
    }),
  },
};

export function normalizeCostComponentDetails(category: Category, details: CostComponentDetails): CostComponentDetails {
  const quantity = details.quantity === null ? null : normalizePositiveDecimalValue(details.quantity, "quantity");
  const unit = details.unit === null ? null : normalizeString(details.unit, "unit");
  const contract = category.origin === "STANDARD" ? CONTRACTS[category.code] : undefined;

  if (!contract) {
    if (details.detailPayload !== null || details.detailSchemaVersion !== null) {
      throw new BadRequestException("This cost category does not support specialized details.");
    }
    return { detailPayload: null, detailSchemaVersion: null, quantity, unit };
  }

  if (details.detailPayload === null && details.detailSchemaVersion === null) {
    return { detailPayload: null, detailSchemaVersion: null, quantity, unit };
  }
  if (details.detailPayload === null || details.detailSchemaVersion === null) {
    throw new BadRequestException("Specialized details and detail schema version must be provided together.");
  }
  if (details.detailSchemaVersion !== contract.version) {
    throw new BadRequestException(`Unsupported ${category.code} detail schema version.`);
  }

  const normalizedQuantity = category.code === "EVENT_TICKET" || category.code === "MEALS"
    ? requiredPositiveIntegerQuantity(details.quantity, "quantity")
    : quantity;

  return {
    detailPayload: contract.normalize(details.detailPayload),
    detailSchemaVersion: contract.version,
    quantity: normalizedQuantity,
    unit,
  };
}

function object(payload: unknown, allowedFields: string[], build: (value: Record<string, unknown>) => Record<string, unknown>) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new BadRequestException("Detail payload must be an object.");
  const value = payload as Record<string, unknown>;
  for (const field of Object.keys(value)) {
    if (!allowedFields.includes(field)) throw new BadRequestException(`Unsupported detail field: ${field}.`);
  }
  return build(value);
}

function requiredString(value: Record<string, unknown>, field: string) {
  return normalizeString(value[field], field);
}

function optionalString(value: Record<string, unknown>, field: string) {
  const raw = value[field];
  return raw === undefined || raw === null ? undefined : normalizeString(raw, field);
}

function normalizeString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new BadRequestException(`${field} must be a non-empty string.`);
  return value.trim();
}

function requiredDate(value: Record<string, unknown>, field: string) {
  return normalizeIsoDate(value[field], field);
}

function optionalDate(value: Record<string, unknown>, field: string) {
  const raw = value[field];
  return raw === undefined || raw === null ? undefined : normalizeIsoDate(raw, field);
}

function normalizeIsoDate(value: unknown, field: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`${field} must be an ISO date.`);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new BadRequestException(`${field} must be an ISO date.`);
  return value;
}

function assertDateOrder(start: string | undefined, end: string | undefined, startField: string, endField: string) {
  if (start && end && end < start) throw new BadRequestException(`${endField} cannot precede ${startField}.`);
}

function requiredPositiveInteger(value: Record<string, unknown>, field: string) {
  const raw = value[field];
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw <= 0) throw new BadRequestException(`${field} must be a positive integer.`);
  return raw;
}

function requiredPositiveIntegerQuantity(value: string | null, field: string) {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim()) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) {
    throw new BadRequestException(`${field} must be a positive integer.`);
  }
  return String(Number(value));
}

function optionalPositiveDecimal(value: Record<string, unknown>, field: string) {
  const raw = value[field];
  return raw === undefined || raw === null ? undefined : normalizePositiveDecimalValue(raw, field);
}

function normalizePositiveDecimalValue(value: unknown, field: string) {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,5})?$/.test(value.trim())) throw new BadRequestException(`${field} must be an exact positive decimal string.`);
  const normalized = normalizeDecimal(value.trim());
  if (normalized === "0") throw new BadRequestException(`${field} must be positive.`);
  return normalized;
}

function normalizeDecimal(value: string) {
  const [whole, fraction] = value.split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "");
  const normalizedFraction = fraction?.replace(/0+$/, "");
  return normalizedFraction ? `${normalizedWhole}.${normalizedFraction}` : normalizedWhole;
}

function requiredEnum(value: Record<string, unknown>, field: string, values: readonly string[]) {
  const normalized = normalizeString(value[field], field).toUpperCase();
  if (!values.includes(normalized)) throw new BadRequestException(`${field} has an unsupported value.`);
  return normalized;
}

function optionalEnum(value: Record<string, unknown>, field: string, values: readonly string[]) {
  const raw = value[field];
  return raw === undefined || raw === null ? undefined : requiredEnum(value, field, values);
}

function optionalTime(value: Record<string, unknown>, field: string) {
  const raw = value[field];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) throw new BadRequestException(`${field} must use HH:mm format.`);
  return raw;
}

function optionalField(value: Record<string, unknown>, field: string, normalized: unknown) {
  return value[field] === undefined || value[field] === null ? {} : { [field]: normalized };
}
