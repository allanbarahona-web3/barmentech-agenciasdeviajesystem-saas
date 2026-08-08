import { Injectable } from "@nestjs/common";
import {
  CommercialProposalPdfDto,
  CommercialProposalPdfCompanyDto,
  CommercialProposalPdfParticipantDto,
  CommercialProposalPdfServiceDetailDto,
} from "./dto";
import type {
  AdditionalServiceOrderLineRecord,
  AdditionalServiceOrderParticipantDetails,
  AdditionalServiceOrderRecord,
} from "./repositories";
import type { AdditionalServiceDetails } from "./service-details";

type DetailDescriptor = {
  key: string;
  label: string;
  format?: (value: unknown) => string;
};

const BAGGAGE_LABELS: Readonly<Record<string, string>> = {
  CARRY_ON: "Equipaje de mano",
  HAND_BAGGAGE: "Artículo personal",
  CHECKED_BAGGAGE: "Equipaje documentado",
};

const TRIP_SCOPE_LABELS: Readonly<Record<string, string>> = {
  SINGLE_TRIP: "Un trayecto",
  MULTIPLE_TRIPS: "Múltiples trayectos",
};

const LODGING_LABELS: Readonly<Record<string, string>> = {
  HOTEL_WITH_BREAKFAST: "Hotel con desayuno",
  HOTEL_WITHOUT_BREAKFAST: "Hotel sin desayuno",
  HOSTEL: "Hostal",
  AIRBNB: "Airbnb",
};

const ACCOMMODATION_LABELS: Readonly<Record<string, string>> = {
  SINGLE: "Habitación sencilla",
  DOUBLE: "Habitación doble",
  TRIPLE: "Habitación triple",
  QUADRUPLE: "Habitación cuádruple",
};

const INSURANCE_LABELS: Readonly<Record<string, string>> = {
  USD_35000: "USD 35.000",
  USD_60000: "USD 60.000",
  OTHER: "Otra cobertura",
};

const TRANSPORTATION_LABELS: Readonly<Record<string, string>> = {
  AIRPLANE: "Avión",
  UBER: "Uber",
  TAXI: "Taxi",
  TRAIN: "Tren",
  FERRY: "Ferry",
  SHUTTLE_BUS: "Buseta",
  PRIVATE_TRANSPORT: "Transporte privado",
};

const TRIP_TYPE_LABELS: Readonly<Record<string, string>> = {
  ONE_WAY: "Solo ida",
  ROUND_TRIP: "Ida y regreso",
};

const SEAT_LABELS: Readonly<Record<string, string>> = {
  WINDOW: "Ventana",
  AISLE: "Pasillo",
  MIDDLE: "Centro",
  EXIT_ROW: "Fila de salida",
  FRONT_CABIN: "Parte delantera de la cabina",
  EXTRA_LEGROOM: "Espacio adicional para las piernas",
  NO_PREFERENCE: "Sin preferencia",
  OTHER: "Otra preferencia",
};

const VISA_LABELS: Readonly<Record<string, string>> = {
  TOURISM: "Turismo",
  BUSINESS: "Negocios",
  STUDENT: "Estudiante",
  WORK: "Trabajo",
  TRANSIT: "Tránsito",
  OTHER: "Otro",
};

const DETAIL_DESCRIPTORS: Readonly<Record<string, readonly DetailDescriptor[]>> = {
  BAGGAGE: [
    { key: "baggageTypes", label: "Tipo de equipaje", format: (value) => joinLabels(value, BAGGAGE_LABELS) },
    { key: "tripScope", label: "Alcance", format: (value) => label(value, TRIP_SCOPE_LABELS) },
    { key: "pieceQuantity", label: "Cantidad de piezas" },
    { key: "weightKg", label: "Peso por pieza (kg)" },
  ],
  LODGING: [
    { key: "lodgingType", label: "Tipo de hospedaje", format: (value) => label(value, LODGING_LABELS) },
    { key: "checkInDate", label: "Entrada", format: formatBusinessDate },
    { key: "checkOutDate", label: "Salida", format: formatBusinessDate },
  ],
  ACCOMMODATION_TYPE: [
    { key: "accommodationType", label: "Tipo de habitación", format: (value) => label(value, ACCOMMODATION_LABELS) },
  ],
  INSURANCE: [
    { key: "coverage", label: "Cobertura", format: (value) => label(value, INSURANCE_LABELS) },
    { key: "customCoverageAmount", label: "Monto de cobertura" },
    { key: "currency", label: "Moneda de cobertura" },
  ],
  TRANSPORTATION: [
    { key: "transportationType", label: "Tipo de transporte", format: (value) => label(value, TRANSPORTATION_LABELS) },
    { key: "tripType", label: "Tipo de trayecto", format: (value) => label(value, TRIP_TYPE_LABELS) },
    { key: "serviceDate", label: "Fecha del servicio", format: formatBusinessDate },
    { key: "origin", label: "Origen" },
    { key: "destination", label: "Destino" },
  ],
  TOUR: [
    { key: "tourName", label: "Tour" },
    { key: "serviceDate", label: "Fecha del servicio", format: formatBusinessDate },
  ],
  FLIGHT_TICKET: [
    { key: "tripType", label: "Tipo de vuelo", format: (value) => label(value, TRIP_TYPE_LABELS) },
    { key: "originAirport", label: "Aeropuerto de origen", format: formatAirport },
    { key: "destinationAirport", label: "Aeropuerto de destino", format: formatAirport },
    { key: "departureDate", label: "Fecha de salida", format: formatBusinessDate },
    { key: "returnDate", label: "Fecha de regreso", format: formatBusinessDate },
    { key: "quantity", label: "Cantidad" },
  ],
  SEAT_SELECTION: [
    { key: "seatPreference", label: "Preferencia de asiento", format: (value) => label(value, SEAT_LABELS) },
    { key: "otherPreferenceDescription", label: "Detalle de preferencia" },
    { key: "quantity", label: "Cantidad" },
  ],
  EVENT_TICKET: [
    { key: "eventName", label: "Evento" },
    { key: "serviceDate", label: "Fecha del evento", format: formatBusinessDate },
    { key: "quantity", label: "Cantidad" },
    { key: "venueOrCity", label: "Lugar" },
  ],
  TRAVEL_EXTENSION: [
    { key: "newReturnDate", label: "Nueva fecha de regreso", format: formatBusinessDate },
    { key: "quantity", label: "Cantidad" },
  ],
  TRIP_REDUCTION: [
    { key: "newReturnDate", label: "Nueva fecha de regreso", format: formatBusinessDate },
    { key: "quantity", label: "Cantidad" },
  ],
  VISA_ASSISTANCE: [
    { key: "destinationCountry", label: "País de destino" },
    { key: "visaType", label: "Tipo de visa", format: (value) => label(value, VISA_LABELS) },
    { key: "expectedTravelDate", label: "Fecha estimada de viaje", format: formatBusinessDate },
  ],
};

function label(value: unknown, labels: Readonly<Record<string, string>>): string {
  const key = String(value);
  return labels[key] ?? humanizeUnknownValue(key);
}

function joinLabels(
  value: unknown,
  labels: Readonly<Record<string, string>>,
): string {
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => label(item, labels)).join(", ");
}

function humanizeUnknownValue(value: string): string {
  return value
    .toLocaleLowerCase("es")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (character) => character.toLocaleUpperCase("es"));
}

function formatBusinessDate(value: unknown): string {
  const text = String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
}

function formatAirport(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const airport = value as Record<string, unknown>;
  return [airport.iata, airport.name, airport.city, airport.country]
    .filter((part) => part !== null && part !== undefined && String(part).trim())
    .map(String)
    .join(" - ");
}

@Injectable()
export class CommercialProposalPdfMapper {
  map(
    order: AdditionalServiceOrderRecord,
    company: CommercialProposalPdfCompanyDto,
  ): CommercialProposalPdfDto {
    const customer = this.findCustomer(order);

    return {
      company: { ...company },
      proposalNumber: order.orderNumber,
      issuedAt: order.createdAt.toISOString(),
      validUntil: order.quotationValidUntil?.toISOString() ?? null,
      currency: order.quotationCurrency,
      customer: {
        fullName: customer.fullName,
        identification: customer.identification,
        email: customer.email,
        phone: customer.phone,
      },
      travel: order.travel
        ? {
            travelType: order.travelType,
            reference: order.travel.code,
            name: order.travel.name,
            destination: order.travel.destination,
            departureDate: order.travel.departureDate.toISOString(),
            returnDate: order.travel.returnDate.toISOString(),
          }
        : null,
      services: order.lines.map((line) => ({
        name: line.serviceName,
        details: this.mapDetails(line),
        participants: line.participants.map((participant) =>
          this.mapParticipant(participant),
        ),
        notes: line.commercialNotes,
        subtotal: line.subtotal,
        vatPercentage: line.vatPercentage,
        vatAmount: line.vatAmount,
        total: line.finalSellingPrice,
      })),
      paymentTerms: {
        condition: order.paymentConditionType,
        termValue: order.paymentTermValue,
        termUnit: order.paymentTermUnit,
      },
      observations: order.commercialObservations,
      subtotal: order.commercialSubtotal,
      vatTotal: order.totalVat,
      total: order.totalSellingPrice,
    };
  }

  private findCustomer(
    order: AdditionalServiceOrderRecord,
  ): AdditionalServiceOrderParticipantDetails {
    const participants = order.lines.flatMap((line) => line.participants);
    return (
      participants.find((participant) => participant.role === "HOLDER") ??
      participants[0] ?? {
        clientId: null,
        role: "HOLDER",
        fullName: "",
        identification: "",
        email: null,
        phone: null,
      }
    );
  }

  private mapParticipant(
    participant: AdditionalServiceOrderParticipantDetails,
  ): CommercialProposalPdfParticipantDto {
    return {
      role: participant.role,
      fullName: participant.fullName,
      identification: participant.identification,
    };
  }

  private mapDetails(
    line: AdditionalServiceOrderLineRecord,
  ): CommercialProposalPdfServiceDetailDto[] {
    const details = line.serviceDetails as AdditionalServiceDetails | null;
    if (!details) return [];

    return (DETAIL_DESCRIPTORS[line.serviceCode] ?? []).flatMap((descriptor) => {
      const rawValue = details[descriptor.key];
      if (rawValue === null || rawValue === undefined || rawValue === "") return [];
      const value = descriptor.format
        ? descriptor.format(rawValue)
        : String(rawValue);
      return value ? [{ label: descriptor.label, value }] : [];
    });
  }
}
