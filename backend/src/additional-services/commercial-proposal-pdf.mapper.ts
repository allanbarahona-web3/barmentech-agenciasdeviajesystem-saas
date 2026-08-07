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

const DETAIL_DESCRIPTORS: Readonly<Record<string, readonly DetailDescriptor[]>> = {
  BAGGAGE: [
    { key: "baggageTypes", label: "Tipos de equipaje", format: joinValues },
    { key: "tripScope", label: "Trayectos" },
    { key: "pieceQuantity", label: "Cantidad de piezas" },
    { key: "weightKg", label: "Peso por pieza (kg)" },
  ],
  LODGING: [
    { key: "lodgingType", label: "Tipo de hospedaje" },
    { key: "checkInDate", label: "Entrada" },
    { key: "checkOutDate", label: "Salida" },
  ],
  ACCOMMODATION_TYPE: [
    { key: "accommodationType", label: "Tipo de habitación" },
  ],
  INSURANCE: [
    { key: "coverage", label: "Cobertura" },
    { key: "customCoverageAmount", label: "Monto de cobertura" },
    { key: "currency", label: "Moneda de cobertura" },
  ],
  TRANSPORTATION: [
    { key: "transportationType", label: "Tipo de transporte" },
    { key: "tripType", label: "Tipo de trayecto" },
    { key: "serviceDate", label: "Fecha del servicio" },
    { key: "origin", label: "Origen" },
    { key: "destination", label: "Destino" },
  ],
  TOUR: [
    { key: "tourName", label: "Tour" },
    { key: "serviceDate", label: "Fecha del servicio" },
  ],
  FLIGHT_TICKET: [
    { key: "tripType", label: "Tipo de vuelo" },
    { key: "originAirport", label: "Aeropuerto de origen", format: formatAirport },
    { key: "destinationAirport", label: "Aeropuerto de destino", format: formatAirport },
    { key: "departureDate", label: "Fecha de salida" },
    { key: "returnDate", label: "Fecha de regreso" },
    { key: "quantity", label: "Cantidad" },
  ],
  SEAT_SELECTION: [
    { key: "seatPreference", label: "Preferencia de asiento" },
    { key: "otherPreferenceDescription", label: "Detalle de preferencia" },
    { key: "quantity", label: "Cantidad" },
  ],
  EVENT_TICKET: [
    { key: "eventName", label: "Evento" },
    { key: "serviceDate", label: "Fecha del evento" },
    { key: "quantity", label: "Cantidad" },
    { key: "venueOrCity", label: "Lugar" },
  ],
  TRAVEL_EXTENSION: [
    { key: "newReturnDate", label: "Nueva fecha de regreso" },
    { key: "quantity", label: "Cantidad" },
  ],
  TRIP_REDUCTION: [
    { key: "newReturnDate", label: "Nueva fecha de regreso" },
    { key: "quantity", label: "Cantidad" },
  ],
  VISA_ASSISTANCE: [
    { key: "destinationCountry", label: "País de destino" },
    { key: "visaType", label: "Tipo de visa" },
    { key: "expectedTravelDate", label: "Fecha estimada de viaje" },
  ],
};

function joinValues(value: unknown): string {
  return Array.isArray(value) ? value.map(String).join(", ") : String(value);
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
