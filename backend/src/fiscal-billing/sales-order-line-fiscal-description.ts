export interface SalesOrderLineDescriptionSnapshot {
  serviceName: string;
  serviceCode: string;
  serviceDetailsVersion: number | null;
  serviceDetails: unknown | null;
}

export interface CustomerVisibleServiceAttribute {
  label: string;
  value: string;
}

export const MAX_FISCAL_LINE_DESCRIPTION_LENGTH = 200;

const SEPARATOR = " · ";

const LABELS = {
  baggage: {
    CARRY_ON: "Carry On",
    HAND_BAGGAGE: "Equipaje de mano",
    CHECKED_BAGGAGE: "Equipaje documentado",
  },
  tripScope: {
    SINGLE_TRIP: "Un solo trayecto",
    MULTIPLE_TRIPS: "Múltiples trayectos",
  },
  lodging: {
    HOTEL_WITH_BREAKFAST: "Hotel con desayuno",
    HOTEL_WITHOUT_BREAKFAST: "Hotel sin desayuno",
    HOSTEL: "Hostal",
    AIRBNB: "Airbnb",
  },
  accommodation: {
    SINGLE: "Habitación sencilla",
    DOUBLE: "Habitación doble",
    TRIPLE: "Habitación triple",
    QUADRUPLE: "Habitación cuádruple",
  },
  coverage: {
    USD_35000: "USD 35,000",
    USD_60000: "USD 60,000",
  },
  transportation: {
    AIRPLANE: "Avión",
    UBER: "Uber",
    TAXI: "Taxi",
    TRAIN: "Tren",
    FERRY: "Ferry",
    SHUTTLE_BUS: "Buseta",
    PRIVATE_TRANSPORT: "Transporte privado",
  },
  tripType: {
    ONE_WAY: "Solo ida",
    ROUND_TRIP: "Ida y vuelta",
  },
  seat: {
    WINDOW: "Ventana",
    AISLE: "Pasillo",
    MIDDLE: "Centro",
    EXIT_ROW: "Fila de salida",
    FRONT_CABIN: "Parte delantera de la cabina",
    EXTRA_LEGROOM: "Espacio adicional para las piernas",
    NO_PREFERENCE: "Sin preferencia",
    OTHER: "Otra",
  },
  visa: {
    TOURISM: "Turismo",
    BUSINESS: "Negocios",
    STUDENT: "Estudiante",
    WORK: "Trabajo",
    TRANSIT: "Tránsito",
    OTHER: "Otro",
  },
} as const;

type Details = Record<string, unknown>;
type LabelMap = Readonly<Record<string, string>>;

/**
 * Builds the immutable fiscal description exclusively from a SalesOrderLine
 * commercial snapshot. Unknown versions/shapes intentionally fall back to the
 * service name instead of guessing or reading mutable upstream entities.
 */
export function buildSalesOrderLineFiscalDescription(
  snapshot: Readonly<SalesOrderLineDescriptionSnapshot>,
): string {
  const serviceName = truncate(normalizeText(snapshot.serviceName));
  if (
    snapshot.serviceDetailsVersion !== 1 ||
    !isDetails(snapshot.serviceDetails)
  ) {
    return serviceName;
  }

  const attributes = formatV1Attributes(
    snapshot.serviceCode,
    snapshot.serviceDetails,
  );
  return appendWholeAttributes(serviceName, attributes);
}

export function formatCustomerVisibleServiceAttributes(
  input: Pick<
    SalesOrderLineDescriptionSnapshot,
    "serviceCode" | "serviceDetailsVersion" | "serviceDetails"
  >,
): readonly CustomerVisibleServiceAttribute[] {
  if (input.serviceDetailsVersion !== 1 || !isDetails(input.serviceDetails)) {
    return [];
  }
  return formatV1Attributes(input.serviceCode, input.serviceDetails);
}

function formatV1Attributes(
  serviceCode: string,
  details: Details,
): CustomerVisibleServiceAttribute[] {
  switch (serviceCode) {
    case "BAGGAGE": {
      const types = Array.isArray(details.baggageTypes)
        ? details.baggageTypes
            .map((value) => mapped(LABELS.baggage, value))
            .filter((value): value is string => value !== null)
        : [];
      const scope = mapped(LABELS.tripScope, details.tripScope);
      const pieces = positiveNumber(details.pieceQuantity);
      const weight = positiveNumber(details.weightKg);
      if (!types.length || pieces === null || weight === null) return [];
      return compact([
        attribute("Tipo de equipaje", types.join(", ")),
        attribute("Alcance", scope),
        attribute("Cantidad", `${formatNumber(pieces)} ${pieces === 1 ? "pieza" : "piezas"}`),
        attribute("Peso", `${formatNumber(weight)} kg`),
      ]);
    }
    case "LODGING": {
      const lodging = mapped(LABELS.lodging, details.lodgingType);
      const checkIn = businessDate(details.checkInDate);
      const checkOut = businessDate(details.checkOutDate);
      if (!lodging || !checkIn || !checkOut) return [];
      return [
        { label: "Tipo", value: lodging },
        { label: "Check-in", value: checkIn },
        { label: "Check-out", value: checkOut },
      ];
    }
    case "ACCOMMODATION_TYPE": {
      const accommodation = mapped(
        LABELS.accommodation,
        details.accommodationType,
      );
      return accommodation
        ? [{ label: "Acomodación", value: accommodation }]
        : [];
    }
    case "INSURANCE": {
      const coverage = text(details.coverage);
      const customAmount = positiveNumber(details.customCoverageAmount);
      const value =
        coverage === "OTHER"
          ? customAmount === null
            ? null
            : `USD ${formatNumber(customAmount)}`
          : mapped(LABELS.coverage, coverage);
      return value ? [{ label: "Cobertura", value }] : [];
    }
    case "TRANSPORTATION": {
      const transportation = mapped(
        LABELS.transportation,
        details.transportationType,
      );
      const tripType = mapped(LABELS.tripType, details.tripType);
      const origin = text(details.origin);
      const destination = text(details.destination);
      const date = businessDate(details.serviceDate);
      if (!transportation || !origin || !destination || !date) return [];
      return compact([
        attribute("Tipo", transportation),
        attribute("Tipo de viaje", tripType),
        attribute("Origen", origin),
        attribute("Destino", destination),
        attribute("Fecha", date),
      ]);
    }
    case "TOUR": {
      const name = text(details.tourName);
      const date = businessDate(details.serviceDate);
      if (!name || !date) return [];
      return [
        { label: "Tour", value: name },
        { label: "Fecha", value: date },
      ];
    }
    case "FLIGHT_TICKET": {
      const origin = airportIata(details.originAirport);
      const destination = airportIata(details.destinationAirport);
      const tripType = mapped(LABELS.tripType, details.tripType);
      const departure = businessDate(details.departureDate);
      const returnDate = businessDate(details.returnDate);
      const quantity = positiveNumber(details.quantity);
      if (
        !origin ||
        !destination ||
        !tripType ||
        !departure ||
        quantity === null ||
        (details.tripType === "ROUND_TRIP" && !returnDate)
      ) {
        return [];
      }
      return compact([
        attribute("Ruta", `${origin} → ${destination}`),
        attribute("Tipo de viaje", tripType),
        attribute("Salida", departure),
        attribute("Regreso", returnDate),
        attribute("Cantidad", units(quantity)),
      ]);
    }
    case "SEAT_SELECTION": {
      const preferenceCode = text(details.seatPreference);
      const preference = mapped(LABELS.seat, preferenceCode);
      const custom = text(details.otherPreferenceDescription);
      const quantity = positiveNumber(details.quantity);
      const displayed = preferenceCode === "OTHER" ? custom : preference;
      if (!displayed || quantity === null) return [];
      return compact([
        attribute("Preferencia", preferenceCode === "OTHER" ? null : preference),
        attribute(
          "Preferencia personalizada",
          preferenceCode === "OTHER" ? custom : null,
        ),
        attribute("Cantidad", units(quantity)),
      ]);
    }
    case "EVENT_TICKET": {
      const event = text(details.eventName);
      const venue = text(details.venueOrCity);
      const date = businessDate(details.serviceDate);
      const quantity = positiveNumber(details.quantity);
      if (!event || !venue || !date || quantity === null) return [];
      return [
        { label: "Evento", value: event },
        { label: "Recinto / Ciudad", value: venue },
        { label: "Fecha", value: date },
        { label: "Cantidad", value: units(quantity) },
      ];
    }
    case "TRAVEL_EXTENSION":
    case "TRIP_REDUCTION": {
      const date = businessDate(details.newReturnDate);
      const quantity = positiveNumber(details.quantity);
      if (!date || quantity === null) return [];
      return [
        { label: "Nueva fecha de regreso", value: date },
        { label: "Cantidad", value: units(quantity) },
      ];
    }
    case "VISA_ASSISTANCE": {
      const destination = text(details.destinationCountry);
      const visa = mapped(LABELS.visa, details.visaType);
      const date = businessDate(details.expectedTravelDate);
      if (!destination || !visa) return [];
      return compact([
        attribute("Destino", destination),
        attribute("Tipo de visa", visa),
        attribute("Fecha estimada de viaje", date),
      ]);
    }
    default:
      return [];
  }
}

function appendWholeAttributes(
  serviceName: string,
  attributes: readonly CustomerVisibleServiceAttribute[],
): string {
  let result = serviceName;
  for (const { label, value } of attributes) {
    const part = `${normalizeText(label)}: ${normalizeText(value)}`;
    if (!part || codePointLength(result + SEPARATOR + part) > MAX_FISCAL_LINE_DESCRIPTION_LENGTH) {
      continue;
    }
    result += `${SEPARATOR}${part}`;
  }
  return result;
}

function isDetails(value: unknown): value is Details {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && normalizeText(value)
    ? normalizeText(value)
    : null;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function mapped(map: LabelMap, value: unknown): string | null {
  const key = text(value);
  return key ? map[key] ?? null : null;
}

function businessDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

function airportIata(value: unknown): string | null {
  return isDetails(value) ? text(value.iata) : null;
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 20 });
}

function units(value: number): string {
  return `${formatNumber(value)} ${value === 1 ? "unidad" : "unidades"}`;
}

function attribute(
  label: string,
  value: string | null,
): CustomerVisibleServiceAttribute | null {
  return value ? { label, value } : null;
}

function compact(
  values: ReadonlyArray<CustomerVisibleServiceAttribute | null>,
): CustomerVisibleServiceAttribute[] {
  return values.filter(
    (value): value is CustomerVisibleServiceAttribute => value !== null,
  );
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function truncate(value: string): string {
  return Array.from(value).slice(0, MAX_FISCAL_LINE_DESCRIPTION_LENGTH).join("");
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}
