import type { AdditionalServiceDetails } from "../service-details";

export type OperationalPresentationValueType = "TEXT" | "DATE";
export type OperationalPresentationField = { key: string; label: string; value: string; valueType: OperationalPresentationValueType };
export type OperationalAdditionalServicePresentation = { title: string | null; subtitle: string | null; fields: OperationalPresentationField[] };

const LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  lodgingType: { HOTEL_WITH_BREAKFAST: "Hotel con desayuno", HOTEL_WITHOUT_BREAKFAST: "Hotel sin desayuno", HOSTEL: "Hostal", AIRBNB: "Airbnb" },
  accommodationType: { SINGLE: "Habitación sencilla", DOUBLE: "Habitación doble", TRIPLE: "Habitación triple", QUADRUPLE: "Habitación cuádruple" },
  transportationType: { AIRPLANE: "Avión", UBER: "Uber", TAXI: "Taxi", TRAIN: "Tren", FERRY: "Ferry", SHUTTLE_BUS: "Buseta", PRIVATE_TRANSPORT: "Transporte privado" },
  tripType: { ONE_WAY: "Solo ida", ROUND_TRIP: "Ida y regreso" },
  seatPreference: { WINDOW: "Ventana", AISLE: "Pasillo", MIDDLE: "Centro", EXIT_ROW: "Fila de salida", FRONT_CABIN: "Parte delantera de la cabina", EXTRA_LEGROOM: "Espacio adicional para las piernas", NO_PREFERENCE: "Sin preferencia", OTHER: "Otra preferencia" },
  baggageType: { CARRY_ON: "Equipaje de mano", HAND_BAGGAGE: "Artículo personal", CHECKED_BAGGAGE: "Equipaje documentado" },
  tripScope: { SINGLE_TRIP: "Un trayecto", MULTIPLE_TRIPS: "Múltiples trayectos" },
  coverage: { USD_35000: "USD 35.000", USD_60000: "USD 60.000", OTHER: "Otra cobertura" },
  visaType: { TOURISM: "Turismo", BUSINESS: "Negocios", STUDENT: "Estudiante", WORK: "Trabajo", TRANSIT: "Tránsito", OTHER: "Otro" },
};

export function operationalAdditionalServicePresentation(serviceCode: string, serviceName: string, rawDetails: unknown): OperationalAdditionalServicePresentation {
  const details = record(rawDetails);
  const field = (key: string, label: string, value: string | null, valueType: OperationalPresentationValueType = "TEXT") => value ? { key, label, value, valueType } : null;
  const text = (key: string) => typeof details?.[key] === "string" && details[key].trim() ? details[key].trim() : null;
  const date = (key: string) => { const value = text(key); return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null; };
  const label = (key: keyof typeof LABELS, value: string | null) => value ? LABELS[key][value] ?? null : null;
  const airport = (key: string) => { const value = record(details?.[key]); if (!value) return null; return [string(value.iata), string(value.name), string(value.city)].filter(Boolean).join(" · ") || null; };
  const fields = (...values: Array<OperationalPresentationField | null>) => values.filter((value): value is OperationalPresentationField => value !== null);

  switch (serviceCode) {
    case "LODGING": { const type = label("lodgingType", text("lodgingType")); return { title: serviceName, subtitle: type, fields: fields(field("type", "Tipo", type), field("start-date", "Entrada", date("checkInDate"), "DATE"), field("end-date", "Salida", date("checkOutDate"), "DATE")) }; }
    case "FLIGHT_TICKET": { const route = [airport("originAirport"), airport("destinationAirport")].filter(Boolean).join(" → ") || null; return { title: serviceName, subtitle: route, fields: fields(field("trip-type", "Tipo", label("tripType", text("tripType"))), field("origin", "Origen", airport("originAirport")), field("destination", "Destino", airport("destinationAirport")), field("departure-date", "Salida", date("departureDate"), "DATE"), field("return-date", "Regreso", date("returnDate"), "DATE"), field("quantity", "Cantidad", positiveNumber(details?.quantity))) }; }
    case "TRANSPORTATION": { const type = label("transportationType", text("transportationType")); return { title: serviceName, subtitle: type, fields: fields(field("transport-type", "Tipo de traslado", type), field("trip-type", "Trayecto", label("tripType", text("tripType"))), field("service-date", "Fecha", date("serviceDate"), "DATE"), field("origin", "Origen", text("origin")), field("destination", "Destino", text("destination"))) }; }
    case "TOUR": { const tour = text("tourName"); return { title: serviceName, subtitle: tour, fields: fields(field("activity", "Actividad", tour), field("service-date", "Fecha", date("serviceDate"), "DATE")) }; }
    case "EVENT_TICKET": { const event = text("eventName"); return { title: serviceName, subtitle: event, fields: fields(field("event", "Evento", event), field("service-date", "Fecha", date("serviceDate"), "DATE"), field("venue", "Lugar", text("venueOrCity")), field("quantity", "Cantidad", positiveNumber(details?.quantity))) }; }
    case "SEAT_SELECTION": { const preference = text("seatPreference") === "OTHER" ? text("otherPreferenceDescription") : label("seatPreference", text("seatPreference")); return { title: serviceName, subtitle: preference, fields: fields(field("preference", "Preferencia", preference), field("quantity", "Cantidad", positiveNumber(details?.quantity))) }; }
    case "BAGGAGE": { const types = Array.isArray(details?.baggageTypes) ? details.baggageTypes.filter((value): value is string => typeof value === "string").map((value) => LABELS.baggageType[value]).filter(Boolean).join(", ") || null : null; return { title: serviceName, subtitle: types, fields: fields(field("type", "Tipo", types), field("pieces", "Piezas", positiveNumber(details?.pieceQuantity)), field("weight", "Peso por pieza", weight(details?.weightKg)), field("scope", "Alcance", label("tripScope", text("tripScope")))) }; }
    case "INSURANCE": { const coverage = label("coverage", text("coverage")); const custom = positiveNumber(details?.customCoverageAmount); const currency = text("currency"); return { title: serviceName, subtitle: coverage, fields: fields(field("coverage", "Cobertura", coverage), field("coverage-amount", "Monto de cobertura", custom && currency ? `${custom} ${currency}` : null)) }; }
    case "ACCOMMODATION_TYPE": { const type = label("accommodationType", text("accommodationType")); return { title: serviceName, subtitle: type, fields: fields(field("room-type", "Habitación", type)) }; }
    case "TRAVEL_EXTENSION":
    case "TRIP_REDUCTION": return { title: serviceName, subtitle: null, fields: fields(field("new-return-date", "Nueva fecha de regreso", date("newReturnDate"), "DATE"), field("quantity", "Cantidad", positiveNumber(details?.quantity))) };
    case "VISA_ASSISTANCE": { const visa = label("visaType", text("visaType")); return { title: serviceName, subtitle: visa, fields: fields(field("destination-country", "País de destino", text("destinationCountry")), field("visa-type", "Tipo de visa", visa), field("expected-date", "Fecha estimada", date("expectedTravelDate"), "DATE")) }; }
    default: return { title: serviceName || null, subtitle: null, fields: [] };
  }
}

function record(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as AdditionalServiceDetails : null; }
function string(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function positiveNumber(value: unknown): string | null { return typeof value === "number" && Number.isFinite(value) && value > 0 ? String(value) : null; }
function weight(value: unknown): string | null { const numeric = positiveNumber(value); return numeric ? `${numeric} kg` : null; }
