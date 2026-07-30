import { getSpanishCountryName } from '@/shared/countries';
import { formatBusinessDate } from '@/shared/regional';
import {
  ACCOMMODATION_NAMES,
  BAGGAGE_NAMES,
  BAGGAGE_TRIP_SCOPE_NAMES,
  INSURANCE_COVERAGE_NAMES,
  LODGING_NAMES,
  SEAT_NAMES,
  TRANSPORTATION_NAMES,
  TRIP_TYPE_NAMES,
  VISA_TYPE_NAMES,
} from './commercial-service-labels';
import type {
  CommercialServiceAttribute,
  CommercialServiceDescription,
} from './commercial-service-formatter.types';

type Details = Record<string, unknown>;

function isDetails(value: unknown): value is Details {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(details: Details, key: string): string | null {
  const value = details[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function positiveNumber(details: Details, key: string): number | null {
  const value = details[key];
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function labelFromMap(
  map: Record<string, string>,
  value: string | null,
): string | null {
  return value ? map[value] ?? null : null;
}

function attribute(
  key: string,
  label: string,
  value: string | null,
): CommercialServiceAttribute | null {
  return value ? { key, label, value } : null;
}

function attributes(
  ...values: Array<CommercialServiceAttribute | null>
): CommercialServiceAttribute[] {
  return values.filter(
    (value): value is CommercialServiceAttribute => value !== null,
  );
}

function quantity(value: number): string {
  return `${value} ${value === 1 ? 'unidad' : 'unidades'}`;
}

function invalid(
  serviceCode: string,
  serviceLabel: string,
): CommercialServiceDescription {
  return {
    status: 'invalid-details',
    serviceCode,
    serviceLabel,
    summary: 'Detalle comercial no disponible',
    attributes: [],
  };
}

export function formatCommercialServiceV1(
  serviceCode: string,
  serviceLabel: string,
  rawDetails: unknown,
): CommercialServiceDescription {
  if (!isDetails(rawDetails)) return invalid(serviceCode, serviceLabel);

  const details = rawDetails;
  let summary: string | null = null;
  let formattedAttributes: CommercialServiceAttribute[] = [];

  switch (serviceCode) {
    case 'BAGGAGE': {
      const baggageTypes = Array.isArray(details.baggageTypes)
        ? details.baggageTypes
            .map((value) =>
              typeof value === 'string'
                ? labelFromMap(BAGGAGE_NAMES, value)
                : null,
            )
            .filter((value): value is string => Boolean(value))
        : [];
      const pieceQuantity = positiveNumber(details, 'pieceQuantity');
      const weightKg = positiveNumber(details, 'weightKg');
      const tripScope = labelFromMap(
        BAGGAGE_TRIP_SCOPE_NAMES,
        text(details, 'tripScope'),
      );
      if (!baggageTypes.length || pieceQuantity === null || weightKg === null) {
        return invalid(serviceCode, serviceLabel);
      }
      summary = baggageTypes.join(' · ');
      formattedAttributes = attributes(
        attribute('baggageTypes', 'Tipo de equipaje', baggageTypes.join(', ')),
        attribute('tripScope', 'Alcance', tripScope),
        attribute(
          'pieceQuantity',
          'Cantidad',
          `${pieceQuantity} ${pieceQuantity === 1 ? 'pieza' : 'piezas'}`,
        ),
        attribute('weightKg', 'Peso', `${weightKg} kg`),
      );
      break;
    }
    case 'LODGING': {
      const lodgingType = labelFromMap(
        LODGING_NAMES,
        text(details, 'lodgingType'),
      );
      const checkInDate = text(details, 'checkInDate');
      const checkOutDate = text(details, 'checkOutDate');
      if (!lodgingType || !checkInDate || !checkOutDate) {
        return invalid(serviceCode, serviceLabel);
      }
      summary = lodgingType;
      formattedAttributes = attributes(
        attribute('lodgingType', 'Tipo', lodgingType),
        attribute('checkInDate', 'Check-in', formatBusinessDate(checkInDate)),
        attribute(
          'checkOutDate',
          'Check-out',
          formatBusinessDate(checkOutDate),
        ),
      );
      break;
    }
    case 'ACCOMMODATION_TYPE': {
      const accommodationType = labelFromMap(
        ACCOMMODATION_NAMES,
        text(details, 'accommodationType'),
      );
      if (!accommodationType) return invalid(serviceCode, serviceLabel);
      summary = accommodationType;
      formattedAttributes = attributes(
        attribute('accommodationType', 'Acomodación', accommodationType),
      );
      break;
    }
    case 'INSURANCE': {
      const coverage = text(details, 'coverage');
      const customCoverageAmount = positiveNumber(
        details,
        'customCoverageAmount',
      );
      const coverageLabel =
        coverage === 'OTHER'
          ? customCoverageAmount === null
            ? null
            : `USD ${customCoverageAmount.toLocaleString('en-US')}`
          : labelFromMap(INSURANCE_COVERAGE_NAMES, coverage);
      if (!coverageLabel) return invalid(serviceCode, serviceLabel);
      summary = coverageLabel;
      formattedAttributes = attributes(
        attribute('coverage', 'Cobertura', coverageLabel),
      );
      break;
    }
    case 'TRANSPORTATION': {
      const transportationType = labelFromMap(
        TRANSPORTATION_NAMES,
        text(details, 'transportationType'),
      );
      const tripType = labelFromMap(
        TRIP_TYPE_NAMES,
        text(details, 'tripType'),
      );
      const serviceDate = text(details, 'serviceDate');
      const origin = text(details, 'origin');
      const destination = text(details, 'destination');
      if (!transportationType || !serviceDate || !origin || !destination) {
        return invalid(serviceCode, serviceLabel);
      }
      summary = `${transportationType}${tripType ? ` · ${tripType}` : ''} · ${origin} → ${destination}`;
      formattedAttributes = attributes(
        attribute('transportationType', 'Tipo', transportationType),
        attribute('tripType', 'Tipo de viaje', tripType),
        attribute('origin', 'Origen', origin),
        attribute('destination', 'Destino', destination),
        attribute('serviceDate', 'Fecha', formatBusinessDate(serviceDate)),
      );
      break;
    }
    case 'TOUR': {
      const tourName = text(details, 'tourName');
      const serviceDate = text(details, 'serviceDate');
      if (!tourName || !serviceDate) return invalid(serviceCode, serviceLabel);
      summary = tourName;
      formattedAttributes = attributes(
        attribute('tourName', 'Tour', tourName),
        attribute('serviceDate', 'Fecha', formatBusinessDate(serviceDate)),
      );
      break;
    }
    case 'FLIGHT_TICKET': {
      const originAirport = isDetails(details.originAirport)
        ? text(details.originAirport, 'iata')
        : null;
      const destinationAirport = isDetails(details.destinationAirport)
        ? text(details.destinationAirport, 'iata')
        : null;
      const tripType = text(details, 'tripType');
      const departureDate = text(details, 'departureDate');
      const returnDate = text(details, 'returnDate');
      const ticketQuantity = positiveNumber(details, 'quantity');
      const tripTypeLabel =
        tripType === 'ROUND_TRIP'
          ? 'Ida y vuelta'
          : tripType === 'ONE_WAY'
            ? 'Solo ida'
            : null;
      if (
        !originAirport ||
        !destinationAirport ||
        !tripTypeLabel ||
        !departureDate ||
        ticketQuantity === null ||
        (tripType === 'ROUND_TRIP' && !returnDate)
      ) {
        return invalid(serviceCode, serviceLabel);
      }
      const route = `${originAirport} → ${destinationAirport}`;
      summary = `${route} · ${tripTypeLabel}`;
      formattedAttributes = attributes(
        attribute('route', 'Ruta', route),
        attribute('tripType', 'Tipo de viaje', tripTypeLabel),
        attribute(
          'departureDate',
          'Salida',
          formatBusinessDate(departureDate),
        ),
        attribute(
          'returnDate',
          'Regreso',
          returnDate ? formatBusinessDate(returnDate) : null,
        ),
        attribute('quantity', 'Cantidad', quantity(ticketQuantity)),
      );
      break;
    }
    case 'SEAT_SELECTION': {
      const seatPreference = text(details, 'seatPreference');
      const preferenceLabel = labelFromMap(SEAT_NAMES, seatPreference);
      const customPreference = text(details, 'otherPreferenceDescription');
      const seatQuantity = positiveNumber(details, 'quantity');
      const displayedPreference =
        seatPreference === 'OTHER' ? customPreference : preferenceLabel;
      if (!displayedPreference || seatQuantity === null) {
        return invalid(serviceCode, serviceLabel);
      }
      summary = displayedPreference;
      formattedAttributes = attributes(
        attribute('seatPreference', 'Preferencia', preferenceLabel),
        attribute(
          'otherPreferenceDescription',
          'Preferencia personalizada',
          seatPreference === 'OTHER' ? customPreference : null,
        ),
        attribute('quantity', 'Cantidad', quantity(seatQuantity)),
      );
      break;
    }
    case 'EVENT_TICKET': {
      const eventName = text(details, 'eventName');
      const venueOrCity = text(details, 'venueOrCity');
      const serviceDate = text(details, 'serviceDate');
      const eventQuantity = positiveNumber(details, 'quantity');
      if (!eventName || !venueOrCity || !serviceDate || eventQuantity === null) {
        return invalid(serviceCode, serviceLabel);
      }
      summary = `${eventName} · ${venueOrCity}`;
      formattedAttributes = attributes(
        attribute('eventName', 'Evento', eventName),
        attribute('venueOrCity', 'Recinto / Ciudad', venueOrCity),
        attribute('serviceDate', 'Fecha', formatBusinessDate(serviceDate)),
        attribute('quantity', 'Cantidad', quantity(eventQuantity)),
      );
      break;
    }
    case 'TRAVEL_EXTENSION':
    case 'TRIP_REDUCTION': {
      const newReturnDate = text(details, 'newReturnDate');
      const adjustmentQuantity = positiveNumber(details, 'quantity');
      if (!newReturnDate || adjustmentQuantity === null) {
        return invalid(serviceCode, serviceLabel);
      }
      summary = `Regreso: ${formatBusinessDate(newReturnDate)}`;
      formattedAttributes = attributes(
        attribute(
          'newReturnDate',
          'Nueva fecha de regreso',
          formatBusinessDate(newReturnDate),
        ),
        attribute('quantity', 'Cantidad', quantity(adjustmentQuantity)),
      );
      break;
    }
    case 'VISA_ASSISTANCE': {
      const destinationCountry = text(details, 'destinationCountry');
      const visaType = labelFromMap(
        VISA_TYPE_NAMES,
        text(details, 'visaType'),
      );
      const expectedTravelDate = text(details, 'expectedTravelDate');
      if (!destinationCountry || !visaType) {
        return invalid(serviceCode, serviceLabel);
      }
      const destinationLabel =
        getSpanishCountryName(destinationCountry) ?? destinationCountry;
      summary = `${destinationLabel} · ${visaType}`;
      formattedAttributes = attributes(
        attribute('destinationCountry', 'Destino', destinationLabel),
        attribute('visaType', 'Tipo de visa', visaType),
        attribute(
          'expectedTravelDate',
          'Fecha estimada de viaje',
          expectedTravelDate
            ? formatBusinessDate(expectedTravelDate)
            : null,
        ),
      );
      break;
    }
    default:
      return {
        status: 'unsupported-service',
        serviceCode,
        serviceLabel,
        summary: 'Servicio no compatible',
        attributes: [],
      };
  }

  return {
    status: 'formatted',
    serviceCode,
    serviceLabel,
    summary,
    attributes: formattedAttributes,
  };
}
