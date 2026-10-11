import { BadRequestException } from "@nestjs/common";

/**
 * Operations-owned purpose authority. Source type identifies origin; this
 * normalized purpose identifies the one shared execution-detail contract.
 */
export const OPERATIONAL_SERVICE_PURPOSES = [
  "AIRFARE",
  "LODGING",
  "TOUR_ACTIVITY",
  "TRANSPORTATION",
  "GENERIC",
] as const;

export type OperationalServicePurpose = (typeof OPERATIONAL_SERVICE_PURPOSES)[number];
export type OperationalServicePurposeResolution = { code: OperationalServicePurpose; name: string };

const PURPOSE_NAMES: Readonly<Record<OperationalServicePurpose, string>> = {
  AIRFARE: "Airfare",
  LODGING: "Lodging",
  TOUR_ACTIVITY: "Tour / activity",
  TRANSPORTATION: "Transportation",
  GENERIC: "Generic service",
};

const CATEGORY_PURPOSES: Readonly<Record<string, OperationalServicePurpose>> = {
  AIRFARE: "AIRFARE",
  FLIGHT: "AIRFARE",
  FLIGHT_TICKET: "AIRFARE",
  LODGING: "LODGING",
  ACCOMMODATION: "LODGING",
  HOTEL: "LODGING",
  TOUR: "TOUR_ACTIVITY",
  ACTIVITY: "TOUR_ACTIVITY",
  TOUR_ACTIVITY: "TOUR_ACTIVITY",
  TRANSPORTATION: "TRANSPORTATION",
  TRANSPORT: "TRANSPORTATION",
  TRANSFER: "TRANSPORTATION",
  GROUND_TRANSPORT: "TRANSPORTATION",
};

const MAX_DETAIL_BYTES = 64 * 1024;
const STRING_LIMITS: Readonly<Record<string, number>> = {
  bookingLocator: 191,
  airlineConfirmationNumber: 191,
  eTicketNumber: 191,
  ticketNumber: 191,
  flightNumber: 191,
  departureAirport: 32,
  arrivalAirport: 32,
  seat: 64,
  baggageNotes: 4000,
  boardingReference: 191,
  boardingInstructions: 4000,
  terminal: 191,
  gate: 191,
  serviceInstructions: 4000,
  propertyName: 500,
  propertyAddress: 2000,
  roomType: 500,
  occupancy: 500,
  bookingInstructions: 4000,
  accessInstructions: 4000,
  contactName: 500,
  contactPhone: 191,
  activityName: 500,
  meetingPoint: 2000,
  pickupLocation: 2000,
  operatorContact: 1000,
  dropoffLocation: 2000,
  vehicleType: 500,
  driverName: 500,
  driverPhone: 191,
};

const CONTRACT_FIELDS: Readonly<Record<OperationalServicePurpose, readonly string[]>> = {
  // Strong fulfillment fields remain authoritative for provider/references,
  // reservation/confirmation/voucher/ticket references, service dates, and
  // confirmation notes. They intentionally do not appear in detail payloads.
  AIRFARE: ["bookingLocator", "airlineConfirmationNumber", "eTicketNumber", "ticketNumber", "flightNumber", "departureAirport", "arrivalAirport", "departureAt", "arrivalAt", "seat", "baggageNotes", "boardingReference", "boardingInstructions", "terminal", "gate", "serviceInstructions"],
  LODGING: ["propertyName", "propertyAddress", "roomCount", "roomType", "occupancy", "checkInAt", "checkOutAt", "bookingInstructions", "accessInstructions", "contactName", "contactPhone"],
  TOUR_ACTIVITY: ["activityName", "meetingPoint", "pickupLocation", "startAt", "endAt", "participantCount", "operatorContact", "instructions"],
  TRANSPORTATION: ["pickupLocation", "dropoffLocation", "pickupAt", "expectedDropoffAt", "vehicleType", "driverName", "driverPhone", "operatorContact", "serviceInstructions"],
  // Generic is deliberately narrow: it preserves a typed escape hatch without
  // accepting arbitrary JSON for newly written unknown purposes.
  GENERIC: ["serviceInstructions"],
};

const DATE_FIELDS = new Set([
  "departureAt", "arrivalAt", "checkInAt", "checkOutAt", "startAt", "endAt", "pickupAt", "expectedDropoffAt",
]);
const POSITIVE_INTEGER_FIELDS = new Set(["roomCount", "participantCount"]);

export function resolveOperationalServicePurpose(categoryCode: unknown): OperationalServicePurposeResolution {
  const normalized = typeof categoryCode === "string" ? categoryCode.trim().toUpperCase() : "";
  const code = CATEGORY_PURPOSES[normalized] ?? "GENERIC";
  return { code, name: PURPOSE_NAMES[code] };
}

/** Legacy source-purpose snapshots remain readable; unknown codes use GENERIC v1 for new writes. */
export function operationalDetailPurpose(servicePurposeCode: unknown): OperationalServicePurpose {
  return (OPERATIONAL_SERVICE_PURPOSES as readonly string[]).includes(servicePurposeCode as string)
    ? servicePurposeCode as OperationalServicePurpose
    : "GENERIC";
}

export function validateOperationalDetail(
  servicePurposeCode: unknown,
  payload: unknown,
  detailVersion: unknown,
): Record<string, unknown> {
  const purpose = operationalDetailPurpose(servicePurposeCode);
  if (detailVersion !== 1) throw invalidDetail("OPERATIONAL_FULFILLMENT_DETAIL_VERSION_UNSUPPORTED");
  if (!isPlainObject(payload)) throw invalidDetail("OPERATIONAL_FULFILLMENT_DETAIL_INVALID");
  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    throw invalidDetail("OPERATIONAL_FULFILLMENT_DETAIL_INVALID");
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_DETAIL_BYTES) {
    throw invalidDetail("OPERATIONAL_FULFILLMENT_DETAIL_TOO_LARGE");
  }

  const allowed = new Set(CONTRACT_FIELDS[purpose]);
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!allowed.has(key)) throw invalidDetail("OPERATIONAL_FULFILLMENT_DETAIL_PURPOSE_MISMATCH");
    if (typeof value === "string") {
      normalized[key] = DATE_FIELDS.has(key) ? normalizeInstant(value) : normalizeText(key, value);
    } else if (POSITIVE_INTEGER_FIELDS.has(key) && typeof value === "number" && Number.isInteger(value) && value > 0) {
      normalized[key] = value;
    } else {
      throw invalidDetail("OPERATIONAL_FULFILLMENT_DETAIL_INVALID");
    }
  }
  return normalized;
}

/**
 * Safe field-level enrichment for a known v1 contract. Undefined preserves a
 * field, null clears it, and every resulting payload is validated again.
 */
export function enrichOperationalDetail(
  servicePurposeCode: unknown,
  detailVersion: unknown,
  existingPayload: unknown,
  incomingPayload: unknown,
): Record<string, unknown> {
  const existing = validateOperationalDetail(servicePurposeCode, existingPayload, detailVersion);
  if (!isPlainObject(incomingPayload)) throw invalidDetail("OPERATIONAL_FULFILLMENT_DETAIL_INVALID");
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(incomingPayload)) {
    if (value === undefined) continue;
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  return validateOperationalDetail(servicePurposeCode, merged, detailVersion);
}

function normalizeInstant(value: string) {
  const parsed = new Date(value);
  if (!value.trim() || Number.isNaN(parsed.getTime())) throw invalidDetail("OPERATIONAL_FULFILLMENT_DETAIL_INVALID");
  return parsed.toISOString();
}

function normalizeText(key: string, value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > STRING_LIMITS[key]) throw invalidDetail("OPERATIONAL_FULFILLMENT_DETAIL_INVALID");
  return normalized;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalidDetail(code: string): BadRequestException {
  return new BadRequestException(code);
}
