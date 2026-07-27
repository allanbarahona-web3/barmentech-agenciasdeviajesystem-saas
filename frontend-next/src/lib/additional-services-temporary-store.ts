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
