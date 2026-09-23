export type CommercialCostComponent = {
  id: string;
  title: string;
  description: string | null;
  detailPayload: unknown | null;
  detailSchemaVersion: number | null;
  quantity: unknown | null;
  unit: string | null;
  costCategory: { code: string; origin: string };
};

export type DerivedCommercialLine = {
  displayOrder: number;
  description: string;
  quantity: string;
  commercialNote: string | null;
};

/**
 * Customer-safe projection of Cost Engine components. It deliberately knows
 * nothing about cost snapshots, suppliers, evidence, or pricing.
 */
export function mapCostComponentsToCommercialLines(components: CommercialCostComponent[]): DerivedCommercialLine[] {
  const lines: DerivedCommercialLine[] = [];
  for (const component of components) {
    const line = mapComponent(component);
    if (line) lines.push({ ...line, displayOrder: lines.length + 1 });
  }
  return lines;
}

function mapComponent(component: CommercialCostComponent): Omit<DerivedCommercialLine, "displayOrder"> | null {
  const code = component.costCategory.code;
  const details = component.detailSchemaVersion === 1 && isObject(component.detailPayload) ? component.detailPayload : null;
  const title = text(component.title);
  if (!title) return null;

  switch (code) {
    case "AIRFARE": return line(`Vuelo: ${route(details) || title}`, "1", join(
      enumText(details, "tripType", TRIP_TYPE_LABELS),
      value(details, "airline") && `Aerolínea: ${value(details, "airline")}`,
      enumText(details, "cabinClass", CABIN_LABELS),
      dateRange(details, "departureDate", "returnDate", "Salida", "Regreso"),
    ));
    case "BAGGAGE": return line(`Equipaje: ${enumText(details, "baggageType", BAGGAGE_LABELS) || title}`, quantity(details, "pieces", "1"), join(
      numberValue(details, "pieces") && `${numberValue(details, "pieces")} ${numberValue(details, "pieces") === "1" ? "pieza" : "piezas"}`,
      numberValue(details, "weightKg") && `${numberValue(details, "weightKg")} kg`,
    ));
    case "LODGING": return line(`Hospedaje: ${join(value(details, "propertyName"), value(details, "city")) || title}`, "1", join(
      enumText(details, "lodgingType", LODGING_LABELS), enumText(details, "roomType", ROOM_LABELS),
      dateRange(details, "checkIn", "checkOut", "Entrada", "Salida"),
      numberValue(details, "nights") && `${numberValue(details, "nights")} ${numberValue(details, "nights") === "1" ? "noche" : "noches"}`,
      numberValue(details, "roomCount") && `${numberValue(details, "roomCount")} ${numberValue(details, "roomCount") === "1" ? "habitación" : "habitaciones"}`,
    ));
    case "TRANSPORTATION": return line(`Transporte: ${route(details) || title}`, "1", join(
      enumText(details, "transportationType", TRANSPORTATION_LABELS), enumText(details, "tripType", TRIP_TYPE_LABELS),
      dateValue(details, "serviceDate", "Fecha"), value(details, "serviceTime") && `Hora: ${value(details, "serviceTime")}`,
      dateValue(details, "returnDate", "Regreso"),
    ));
    case "TOUR": return line(`Tour: ${value(details, "activityName") || title}`, "1", join(
      enumText(details, "tourType", TOUR_LABELS), value(details, "location") && `Ubicación: ${value(details, "location")}`,
      dateValue(details, "serviceDate", "Fecha"), value(details, "duration") && `Duración: ${value(details, "duration")}`,
    ));
    case "INSURANCE": return line(`Seguro: ${enumText(details, "coverageType", COVERAGE_LABELS) || title}`, "1", join(
      dateRange(details, "startDate", "endDate", "Inicio", "Fin"), value(details, "coverageAmount") && `Monto de cobertura: ${value(details, "coverageAmount")}`,
    ));
    case "EVENT_TICKET": return line(`Entradas: ${value(details, "eventName") || title}`, componentQuantity(component, "1"), join(
      value(details, "venue") && `Lugar: ${value(details, "venue")}`, value(details, "city") && `Ciudad: ${value(details, "city")}`,
      dateValue(details, "eventDate", "Fecha"),
    ));
    case "VISA_ASSISTANCE": return line(`Asistencia de visa: ${value(details, "destinationCountry") || title}`, "1", join(
      enumText(details, "visaType", VISA_LABELS), dateValue(details, "expectedTravelDate", "Viaje previsto"),
    ));
    case "MEALS": return line(`Alimentación: ${enumText(details, "mealPlanType", MEAL_LABELS) || title}`, componentQuantity(component, "1"),
      dateRange(details, "startDate", "endDate", "Inicio", "Fin"));
    default: return line(title, componentQuantity(component, "1"), join(
      component.costCategory.origin === "CUSTOM" || code === "OTHER" ? text(component.description) : null,
      componentQuantity(component, "") && component.unit ? `${componentQuantity(component, "")} ${component.unit}` : null,
    ));
  }
}

function line(description: string, quantity: string, commercialNote: string | null): Omit<DerivedCommercialLine, "displayOrder"> {
  return { description, quantity, commercialNote };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function value(details: Record<string, unknown> | null, field: string): string | null {
  return text(details?.[field]);
}

function numberValue(details: Record<string, unknown> | null, field: string): string | null {
  const raw = details?.[field];
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return typeof raw === "string" && /^\d+(?:\.\d+)?$/.test(raw) ? raw : null;
}

function quantity(details: Record<string, unknown> | null, field: string, fallback: string) {
  return numberValue(details, field) ?? fallback;
}

function componentQuantity(component: CommercialCostComponent, fallback: string) {
  const raw = component.quantity;
  if (typeof raw === "string" && /^\d+(?:\.\d+)?$/.test(raw)) return raw;
  if (raw && typeof raw === "object" && "toFixed" in raw && typeof (raw as { toFixed?: unknown }).toFixed === "function") {
    return (raw as { toFixed: () => string }).toFixed();
  }
  return fallback;
}

function route(details: Record<string, unknown> | null) {
  const origin = value(details, "origin"); const destination = value(details, "destination");
  return origin && destination ? `${origin} → ${destination}` : null;
}

function dateValue(details: Record<string, unknown> | null, field: string, label: string) {
  const date = value(details, field);
  return date ? `${label}: ${date}` : null;
}

function dateRange(details: Record<string, unknown> | null, startField: string, endField: string, startLabel: string, endLabel: string) {
  return join(dateValue(details, startField, startLabel), dateValue(details, endField, endLabel));
}

function enumText(details: Record<string, unknown> | null, field: string, labels: Record<string, string>) {
  const raw = value(details, field);
  return raw ? labels[raw] ?? null : null;
}

function join(...values: Array<string | null>) {
  const joined = values.filter((value): value is string => Boolean(value)).join(" · ");
  return joined || null;
}

const TRIP_TYPE_LABELS: Record<string, string> = { ONE_WAY: "Solo ida", ROUND_TRIP: "Ida y vuelta" };
const CABIN_LABELS: Record<string, string> = { ECONOMY: "Clase económica", PREMIUM_ECONOMY: "Clase económica premium", BUSINESS: "Clase ejecutiva", FIRST: "Primera clase", OTHER: "Otra cabina" };
const BAGGAGE_LABELS: Record<string, string> = { CHECKED: "Equipaje documentado", CARRY_ON: "Equipaje de mano", EXCESS: "Exceso de equipaje", SPORTS_EQUIPMENT: "Equipo deportivo", OTHER: "Otro equipaje" };
const LODGING_LABELS: Record<string, string> = { HOTEL: "Hotel", HOSTEL: "Hostel", AIRBNB: "Airbnb", APARTMENT: "Apartamento", OTHER: "Otro hospedaje" };
const ROOM_LABELS: Record<string, string> = { SINGLE: "Habitación individual", MATRIMONIAL: "Habitación matrimonial", DOUBLE: "Habitación doble", TRIPLE: "Habitación triple", QUADRUPLE: "Habitación cuádruple", OTHER: "Otra habitación" };
const TRANSPORTATION_LABELS: Record<string, string> = { PRIVATE_TRANSFER: "Traslado privado", SHARED_SHUTTLE: "Traslado compartido", SHARED_TRANSFER: "Traslado compartido", BUS: "Autobús", TRAIN: "Tren", RAIL: "Tren", FERRY: "Ferry", TAXI_LOCAL: "Taxi o transporte local", RENTAL_CAR: "Vehículo de alquiler", CAR_RENTAL: "Vehículo de alquiler", OTHER: "Otro transporte" };
const TOUR_LABELS: Record<string, string> = { HALF_DAY: "Medio día", FULL_DAY: "Día completo", MULTI_DAY: "Varios días", OTHER: "Otro tour" };
const COVERAGE_LABELS: Record<string, string> = { MEDICAL: "Cobertura médica", CANCELLATION: "Cobertura por cancelación", TRIP_CANCELLATION: "Cobertura por cancelación", BAGGAGE: "Cobertura de equipaje", COMPREHENSIVE: "Cobertura integral", OTHER: "Otra cobertura" };
const VISA_LABELS: Record<string, string> = { TOURISM: "Visa turística", TOURIST: "Visa turística", BUSINESS: "Visa de negocios", TRANSIT: "Visa de tránsito", STUDENT: "Visa de estudios", WORK: "Visa de trabajo", OTHER: "Otra visa" };
const MEAL_LABELS: Record<string, string> = { BREAKFAST: "Desayuno", LUNCH: "Almuerzo", DINNER: "Cena", HALF_BOARD: "Media pensión", FULL_BOARD: "Pensión completa", ALL_INCLUSIVE: "Todo incluido", OTHER: "Otra alimentación" };
