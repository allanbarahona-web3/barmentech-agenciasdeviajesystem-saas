import type { Airport } from '@/shared/airports';

export type BaggageType =
  | 'CARRY_ON'
  | 'HAND_BAGGAGE'
  | 'CHECKED_BAGGAGE';

export interface TemporaryBaggageLine {
  participantId: string;
  serviceType: 'BAGGAGE';
  baggageTypes: BaggageType[];
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

export interface TemporaryTransportationLine {
  participantId: string;
  serviceType: 'TRANSPORTATION';
  transportationType: TransportationType;
  serviceDate: string;
  notes: string;
}

export interface TemporaryTourLine {
  participantId: string;
  serviceType: 'TOUR';
  tourName: string;
  serviceDate: string;
  notes: string;
}

export type FlightTripType = 'ONE_WAY' | 'ROUND_TRIP';

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

export interface AdditionalServicesContextParticipant {
  participantId: string;
  fullName: string;
  operationalNotes: string[];
}

export interface AdditionalServicesWorkflowContext {
  travelName: string;
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
  | TemporaryTripReductionLine;

export type TemporaryLineCurrency = 'USD' | 'CRC';

export interface TemporaryLineSourcing {
  supplierId: string | null;
  providerUrl: string;
  cost: number | null;
  currency: TemporaryLineCurrency | null;
}

let selectedParticipantIds: string[] = [];
let workflowContext: AdditionalServicesWorkflowContext | null = null;
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
const temporaryLineIds = new WeakMap<TemporaryAdditionalServiceLine, string>();
const temporaryLineSourcing = new WeakMap<
  TemporaryAdditionalServiceLine,
  TemporaryLineSourcing
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
  workflowContext = {
    ...context,
    selectedParticipants: context.selectedParticipants.map((participant) => ({
      ...participant,
      operationalNotes: [...(participant.operationalNotes ?? [])],
    })),
  };
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
  ];
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
      collection[index] = updatedLine;
      const orderIndex =
        temporaryAdditionalServiceLineOrder.indexOf(currentLine);
      if (orderIndex >= 0) {
        temporaryAdditionalServiceLineOrder[orderIndex] = updatedLine;
      }
      const id = getTemporaryAdditionalServiceLineId(currentLine);
      temporaryLineIds.set(updatedLine, id);
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
  temporaryLineSourcing.set(line, {
    ...getTemporaryAdditionalServiceLineSourcing(line),
    ...changes,
  });
}
