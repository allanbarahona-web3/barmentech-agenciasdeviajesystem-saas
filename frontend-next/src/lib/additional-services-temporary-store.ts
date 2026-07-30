import type { Airport } from '@/shared/airports';
import type { AdditionalServicePricingBreakdown } from '@/lib/additional-services-pricing-api';

export type BaggageType =
  | 'CARRY_ON'
  | 'HAND_BAGGAGE'
  | 'CHECKED_BAGGAGE';

export type BaggageTripScope = 'SINGLE_TRIP' | 'MULTIPLE_TRIPS';

export interface TemporaryBaggageLine {
  participantId: string;
  serviceType: 'BAGGAGE';
  baggageTypes: BaggageType[];
  tripScope: BaggageTripScope;
  pieceQuantity: number;
  weightKg: number;
  notes: string;
}

export type LodgingType =
  | 'HOTEL_WITH_BREAKFAST'
  | 'HOTEL_WITHOUT_BREAKFAST'
  | 'HOSTEL'
  | 'AIRBNB';

export interface TemporaryLodgingLine {
  participantId: string;
  serviceType: 'LODGING';
  lodgingType: LodgingType;
  checkInDate: string;
  checkOutDate: string;
  notes: string;
}

export type AccommodationType = 'SINGLE' | 'DOUBLE' | 'TRIPLE' | 'QUADRUPLE';

export interface TemporaryAccommodationTypeLine {
  participantId: string;
  serviceType: 'ACCOMMODATION_TYPE';
  accommodationType: AccommodationType;
  notes: string;
}

export type InsuranceCoverage = 'USD_35000' | 'USD_60000' | 'OTHER';

export interface TemporaryInsuranceLine {
  participantId: string;
  serviceType: 'INSURANCE';
  coverage: InsuranceCoverage;
  customCoverageAmount: number | null;
  currency: 'USD';
  notes: string;
}

export type TransportationType =
  | 'AIRPLANE'
  | 'UBER'
  | 'TAXI'
  | 'TRAIN'
  | 'FERRY'
  | 'SHUTTLE_BUS'
  | 'PRIVATE_TRANSPORT';

export type FlightTripType = 'ONE_WAY' | 'ROUND_TRIP';

export interface TemporaryTransportationLine {
  participantId: string;
  serviceType: 'TRANSPORTATION';
  transportationType: TransportationType;
  tripType: FlightTripType;
  serviceDate: string;
  origin: string;
  destination: string;
  notes: string;
}

export interface TemporaryTourLine {
  participantId: string;
  serviceType: 'TOUR';
  tourName: string;
  serviceDate: string;
  notes: string;
}

export interface TemporaryFlightTicketLine {
  participantId: string;
  serviceType: 'FLIGHT_TICKET';
  tripType: FlightTripType;
  originAirport: Airport;
  destinationAirport: Airport;
  departureDate: string;
  returnDate: string | null;
  quantity: number;
  notes: string;
}

export type SeatPreference =
  | 'WINDOW'
  | 'AISLE'
  | 'MIDDLE'
  | 'EXIT_ROW'
  | 'FRONT_CABIN'
  | 'EXTRA_LEGROOM'
  | 'NO_PREFERENCE'
  | 'OTHER';

export interface TemporarySeatSelectionLine {
  participantId: string;
  serviceType: 'SEAT_SELECTION';
  seatPreference: SeatPreference;
  otherPreferenceDescription: string | null;
  quantity: number;
  notes: string;
}

export interface TemporaryEventTicketLine {
  participantId: string;
  serviceType: 'EVENT_TICKET';
  eventName: string;
  serviceDate: string;
  quantity: number;
  venueOrCity: string;
  notes: string;
}

export interface TemporaryTravelExtensionLine {
  participantId: string;
  serviceType: 'TRAVEL_EXTENSION';
  newReturnDate: string;
  quantity: number;
  notes: string;
}

export interface TemporaryTripReductionLine {
  participantId: string;
  serviceType: 'TRIP_REDUCTION';
  newReturnDate: string;
  quantity: number;
  notes: string;
}

export type VisaType =
  | 'TOURISM'
  | 'BUSINESS'
  | 'STUDENT'
  | 'WORK'
  | 'TRANSIT'
  | 'OTHER';

export interface TemporaryVisaAssistanceLine {
  participantId: string;
  serviceType: 'VISA_ASSISTANCE';
  destinationCountry: string;
  visaType: VisaType;
  expectedTravelDate: string | null;
  notes: string;
}

export interface AdditionalServicesContextParticipant {
  participantId: string;
  fullName: string;
  operationalNotes: string[];
}

export interface AdditionalServicesWorkflowContext {
  travelId: string;
  travelName: string;
  travelType: 'INTERNATIONAL' | 'INTERNAL';
  contractNumber: string | null;
  selectedParticipants: AdditionalServicesContextParticipant[];
}

export type TemporaryAdditionalServiceLine =
  | TemporaryBaggageLine
  | TemporaryLodgingLine
  | TemporaryAccommodationTypeLine
  | TemporaryInsuranceLine
  | TemporaryTransportationLine
  | TemporaryTourLine
  | TemporaryFlightTicketLine
  | TemporarySeatSelectionLine
  | TemporaryEventTicketLine
  | TemporaryTravelExtensionLine
  | TemporaryTripReductionLine
  | TemporaryVisaAssistanceLine;

export type TemporaryLineCurrency = 'USD' | 'CRC';

export interface TemporaryLineSourcing {
  supplierId: string | null;
  providerUrl: string;
  cost: number | null;
  currency: TemporaryLineCurrency | null;
}

let selectedParticipantIds: string[] = [];
let workflowContext: AdditionalServicesWorkflowContext | null = null;
let orderIdempotencyKey: string | null = null;
let quotationCurrency: TemporaryLineCurrency = 'USD';
const temporaryBaggageLines: TemporaryBaggageLine[] = [];
const temporaryLodgingLines: TemporaryLodgingLine[] = [];
const temporaryAccommodationTypeLines: TemporaryAccommodationTypeLine[] = [];
const temporaryInsuranceLines: TemporaryInsuranceLine[] = [];
const temporaryTransportationLines: TemporaryTransportationLine[] = [];
const temporaryTourLines: TemporaryTourLine[] = [];
const temporaryFlightTicketLines: TemporaryFlightTicketLine[] = [];
const temporarySeatSelectionLines: TemporarySeatSelectionLine[] = [];
const temporaryEventTicketLines: TemporaryEventTicketLine[] = [];
const temporaryTravelExtensionLines: TemporaryTravelExtensionLine[] = [];
const temporaryTripReductionLines: TemporaryTripReductionLine[] = [];
const temporaryVisaAssistanceLines: TemporaryVisaAssistanceLine[] = [];
let temporaryLineIds = new WeakMap<TemporaryAdditionalServiceLine, string>();
let temporaryLineSourcing = new WeakMap<
  TemporaryAdditionalServiceLine,
  TemporaryLineSourcing
>();
let temporaryLinePricing = new Map<
  string,
  AdditionalServicePricingBreakdown
>();
const temporaryAdditionalServiceLineOrder: TemporaryAdditionalServiceLine[] =
  [];
let temporaryLineSequence = 0;
let temporaryLineBeingEdited: TemporaryAdditionalServiceLine | null = null;
let temporaryLineEditReturnPath = '/additional-services/order-summary';

function registerTemporaryLine<T extends TemporaryAdditionalServiceLine>(
  collection: T[],
  line: T,
) {
  orderIdempotencyKey = null;
  collection.push(line);
  temporaryAdditionalServiceLineOrder.push(line);
  temporaryLineSequence += 1;
  temporaryLineIds.set(line, `temporary-line-${temporaryLineSequence}`);
}

export function setSelectedAdditionalServicesParticipants(
  participantIds: Iterable<string>,
) {
  selectedParticipantIds = Array.from(participantIds);
}

export function getSelectedAdditionalServicesParticipants() {
  return [...selectedParticipantIds];
}

export function setAdditionalServicesWorkflowContext(
  context: AdditionalServicesWorkflowContext,
) {
  orderIdempotencyKey = null;
  workflowContext = {
    ...context,
    selectedParticipants: context.selectedParticipants.map((participant) => ({
      ...participant,
      operationalNotes: [...(participant.operationalNotes ?? [])],
    })),
  };
}

export function getOrCreateAdditionalServiceOrderIdempotencyKey() {
  if (!orderIdempotencyKey) {
    orderIdempotencyKey = crypto.randomUUID();
  }

  return orderIdempotencyKey;
}

export function getAdditionalServicesQuotationCurrency() {
  return quotationCurrency;
}

export function setAdditionalServicesQuotationCurrency(
  currency: TemporaryLineCurrency,
) {
  if (quotationCurrency === currency) {
    return;
  }

  quotationCurrency = currency;
  orderIdempotencyKey = null;
  temporaryLinePricing.clear();
}

export function getAdditionalServicesWorkflowContext() {
  if (!workflowContext) {
    return null;
  }

  return {
    ...workflowContext,
    selectedParticipants: workflowContext.selectedParticipants.map(
      (participant) => ({
        ...participant,
        operationalNotes: [...(participant.operationalNotes ?? [])],
      }),
    ),
  };
}

export function addTemporaryBaggageLine(line: TemporaryBaggageLine) {
  registerTemporaryLine(temporaryBaggageLines, line);
}

export function getTemporaryBaggageLines() {
  return [...temporaryBaggageLines];
}

export function addTemporaryLodgingLine(line: TemporaryLodgingLine) {
  registerTemporaryLine(temporaryLodgingLines, line);
}

export function getTemporaryLodgingLines() {
  return [...temporaryLodgingLines];
}

export function addTemporaryAccommodationTypeLine(
  line: TemporaryAccommodationTypeLine,
) {
  registerTemporaryLine(temporaryAccommodationTypeLines, line);
}

export function getTemporaryAccommodationTypeLines() {
  return [...temporaryAccommodationTypeLines];
}

export function addTemporaryInsuranceLine(line: TemporaryInsuranceLine) {
  registerTemporaryLine(temporaryInsuranceLines, line);
}

export function getTemporaryInsuranceLines() {
  return [...temporaryInsuranceLines];
}

export function addTemporaryTransportationLine(
  line: TemporaryTransportationLine,
) {
  registerTemporaryLine(temporaryTransportationLines, line);
}

export function getTemporaryTransportationLines() {
  return [...temporaryTransportationLines];
}

export function addTemporaryTourLine(line: TemporaryTourLine) {
  registerTemporaryLine(temporaryTourLines, line);
}

export function getTemporaryTourLines() {
  return [...temporaryTourLines];
}

export function addTemporaryFlightTicketLine(
  line: TemporaryFlightTicketLine,
) {
  registerTemporaryLine(temporaryFlightTicketLines, line);
}

export function getTemporaryFlightTicketLines() {
  return [...temporaryFlightTicketLines];
}

export function addTemporarySeatSelectionLine(
  line: TemporarySeatSelectionLine,
) {
  registerTemporaryLine(temporarySeatSelectionLines, line);
}

export function getTemporarySeatSelectionLines() {
  return [...temporarySeatSelectionLines];
}

export function addTemporaryEventTicketLine(
  line: TemporaryEventTicketLine,
) {
  registerTemporaryLine(temporaryEventTicketLines, line);
}

export function getTemporaryEventTicketLines() {
  return [...temporaryEventTicketLines];
}

export function addTemporaryTravelExtensionLine(
  line: TemporaryTravelExtensionLine,
) {
  registerTemporaryLine(temporaryTravelExtensionLines, line);
}

export function getTemporaryTravelExtensionLines() {
  return [...temporaryTravelExtensionLines];
}

export function addTemporaryTripReductionLine(
  line: TemporaryTripReductionLine,
) {
  registerTemporaryLine(temporaryTripReductionLines, line);
}

export function getTemporaryTripReductionLines() {
  return [...temporaryTripReductionLines];
}

export function addTemporaryVisaAssistanceLine(
  line: TemporaryVisaAssistanceLine,
) {
  registerTemporaryLine(temporaryVisaAssistanceLines, line);
}

export function getTemporaryVisaAssistanceLines() {
  return [...temporaryVisaAssistanceLines];
}

function getTemporaryLineCollections(): TemporaryAdditionalServiceLine[][] {
  return [
    temporaryBaggageLines,
    temporaryLodgingLines,
    temporaryAccommodationTypeLines,
    temporaryInsuranceLines,
    temporaryTransportationLines,
    temporaryTourLines,
    temporaryFlightTicketLines,
    temporarySeatSelectionLines,
    temporaryEventTicketLines,
    temporaryTravelExtensionLines,
    temporaryTripReductionLines,
    temporaryVisaAssistanceLines,
  ];
}

export function resetAdditionalServicesWorkflow() {
  selectedParticipantIds = [];
  workflowContext = null;
  orderIdempotencyKey = null;
  quotationCurrency = 'USD';

  getTemporaryLineCollections().forEach((collection) => {
    collection.length = 0;
  });
  temporaryAdditionalServiceLineOrder.length = 0;
  temporaryLineIds = new WeakMap<TemporaryAdditionalServiceLine, string>();
  temporaryLineSourcing = new WeakMap<
    TemporaryAdditionalServiceLine,
    TemporaryLineSourcing
  >();
  temporaryLinePricing = new Map<
    string,
    AdditionalServicePricingBreakdown
  >();
  temporaryLineSequence = 0;
  temporaryLineBeingEdited = null;
  temporaryLineEditReturnPath = '/additional-services/order-summary';
}

export function getTemporaryAdditionalServiceLines() {
  return [...temporaryAdditionalServiceLineOrder];
}

export function getTemporaryAdditionalServiceLineId(
  line: TemporaryAdditionalServiceLine,
) {
  let id = temporaryLineIds.get(line);
  if (!id) {
    temporaryLineSequence += 1;
    id = `temporary-line-${temporaryLineSequence}`;
    temporaryLineIds.set(line, id);
  }
  return id;
}

export function removeTemporaryAdditionalServiceLine(
  line: TemporaryAdditionalServiceLine,
) {
  for (const collection of getTemporaryLineCollections()) {
    const index = collection.indexOf(line);
    if (index >= 0) {
      orderIdempotencyKey = null;
      collection.splice(index, 1);
      const orderIndex = temporaryAdditionalServiceLineOrder.indexOf(line);
      if (orderIndex >= 0) {
        temporaryAdditionalServiceLineOrder.splice(orderIndex, 1);
      }
      if (temporaryLineBeingEdited === line) {
        temporaryLineBeingEdited = null;
      }
      return;
    }
  }
}

export function startEditingTemporaryAdditionalServiceLine(
  line: TemporaryAdditionalServiceLine,
  returnPath = '/additional-services/order-summary',
) {
  temporaryLineBeingEdited = line;
  temporaryLineEditReturnPath = returnPath;
}

export function getTemporaryAdditionalServiceLineBeingEdited<
  T extends TemporaryAdditionalServiceLine['serviceType'],
>(serviceType: T): Extract<TemporaryAdditionalServiceLine, { serviceType: T }> | null {
  return temporaryLineBeingEdited?.serviceType === serviceType
    ? (temporaryLineBeingEdited as Extract<
        TemporaryAdditionalServiceLine,
        { serviceType: T }
      >)
    : null;
}

export function replaceTemporaryAdditionalServiceLine(
  currentLine: TemporaryAdditionalServiceLine,
  updatedLine: TemporaryAdditionalServiceLine,
) {
  for (const collection of getTemporaryLineCollections()) {
    const index = collection.indexOf(currentLine);
    if (index >= 0) {
      orderIdempotencyKey = null;
      collection[index] = updatedLine;
      const orderIndex =
        temporaryAdditionalServiceLineOrder.indexOf(currentLine);
      if (orderIndex >= 0) {
        temporaryAdditionalServiceLineOrder[orderIndex] = updatedLine;
      }
      const id = getTemporaryAdditionalServiceLineId(currentLine);
      temporaryLineIds.set(updatedLine, id);
      temporaryLinePricing.delete(id);
      const sourcing = temporaryLineSourcing.get(currentLine);
      if (sourcing) {
        temporaryLineSourcing.set(updatedLine, sourcing);
      }
      temporaryLineBeingEdited = null;
      return;
    }
  }
}

export function cancelTemporaryAdditionalServiceLineEdit() {
  temporaryLineBeingEdited = null;
  temporaryLineEditReturnPath = '/additional-services/order-summary';
}

export function getTemporaryAdditionalServiceEditReturnPath() {
  return temporaryLineEditReturnPath;
}

export function getTemporaryAdditionalServiceLineSourcing(
  line: TemporaryAdditionalServiceLine,
): TemporaryLineSourcing {
  return (
    temporaryLineSourcing.get(line) ?? {
      supplierId: null,
      providerUrl: '',
      cost: null,
      currency: null,
    }
  );
}

export function updateTemporaryAdditionalServiceLineSourcing(
  line: TemporaryAdditionalServiceLine,
  changes: Partial<TemporaryLineSourcing>,
) {
  orderIdempotencyKey = null;
  temporaryLineSourcing.set(line, {
    ...getTemporaryAdditionalServiceLineSourcing(line),
    ...changes,
  });
  temporaryLinePricing.delete(getTemporaryAdditionalServiceLineId(line));
}

export function setTemporaryAdditionalServiceLinePricing(
  results: ReadonlyArray<{
    line: TemporaryAdditionalServiceLine;
    breakdown: AdditionalServicePricingBreakdown;
  }>,
) {
  const nextPricing = new Map<string, AdditionalServicePricingBreakdown>();
  results.forEach(({ line, breakdown }) => {
    nextPricing.set(getTemporaryAdditionalServiceLineId(line), breakdown);
  });
  temporaryLinePricing = nextPricing;
}

export function getTemporaryAdditionalServiceLinePricing(
  line: TemporaryAdditionalServiceLine,
) {
  return (
    temporaryLinePricing.get(getTemporaryAdditionalServiceLineId(line)) ?? null
  );
}
