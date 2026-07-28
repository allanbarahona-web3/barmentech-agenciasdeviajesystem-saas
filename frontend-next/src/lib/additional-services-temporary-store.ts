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
  temporaryBaggageLines.push(line);
}

export function getTemporaryBaggageLines() {
  return [...temporaryBaggageLines];
}

export function addTemporaryLodgingLine(line: TemporaryLodgingLine) {
  temporaryLodgingLines.push(line);
}

export function getTemporaryLodgingLines() {
  return [...temporaryLodgingLines];
}

export function addTemporaryAccommodationTypeLine(
  line: TemporaryAccommodationTypeLine,
) {
  temporaryAccommodationTypeLines.push(line);
}

export function getTemporaryAccommodationTypeLines() {
  return [...temporaryAccommodationTypeLines];
}

export function addTemporaryInsuranceLine(line: TemporaryInsuranceLine) {
  temporaryInsuranceLines.push(line);
}

export function getTemporaryInsuranceLines() {
  return [...temporaryInsuranceLines];
}

export function addTemporaryTransportationLine(
  line: TemporaryTransportationLine,
) {
  temporaryTransportationLines.push(line);
}

export function getTemporaryTransportationLines() {
  return [...temporaryTransportationLines];
}

export function addTemporaryTourLine(line: TemporaryTourLine) {
  temporaryTourLines.push(line);
}

export function getTemporaryTourLines() {
  return [...temporaryTourLines];
}

export function addTemporaryFlightTicketLine(
  line: TemporaryFlightTicketLine,
) {
  temporaryFlightTicketLines.push(line);
}

export function getTemporaryFlightTicketLines() {
  return [...temporaryFlightTicketLines];
}

export function addTemporarySeatSelectionLine(
  line: TemporarySeatSelectionLine,
) {
  temporarySeatSelectionLines.push(line);
}

export function getTemporarySeatSelectionLines() {
  return [...temporarySeatSelectionLines];
}

export function addTemporaryEventTicketLine(
  line: TemporaryEventTicketLine,
) {
  temporaryEventTicketLines.push(line);
}

export function getTemporaryEventTicketLines() {
  return [...temporaryEventTicketLines];
}

export function addTemporaryTravelExtensionLine(
  line: TemporaryTravelExtensionLine,
) {
  temporaryTravelExtensionLines.push(line);
}

export function getTemporaryTravelExtensionLines() {
  return [...temporaryTravelExtensionLines];
}

export function addTemporaryTripReductionLine(
  line: TemporaryTripReductionLine,
) {
  temporaryTripReductionLines.push(line);
}

export function getTemporaryTripReductionLines() {
  return [...temporaryTripReductionLines];
}
