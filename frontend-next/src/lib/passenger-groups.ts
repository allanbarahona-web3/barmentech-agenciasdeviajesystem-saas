export const PASSENGER_GROUPABLE_SERVICE_CODES = new Set([
  'LODGING',
  'FLIGHT_TICKET',
  'TRANSPORTATION',
  'TOUR',
  'EVENT_TICKET',
  'SEAT_SELECTION',
  'BAGGAGE',
  'INSURANCE',
]);

export function isPassengerGroupableServiceCode(code: string): boolean {
  return PASSENGER_GROUPABLE_SERVICE_CODES.has(code);
}

export function membershipDelta(
  currentParticipantIds: Iterable<string>,
  selectedParticipantIds: Iterable<string>,
) {
  const current = new Set(currentParticipantIds);
  const selected = new Set(selectedParticipantIds);

  return {
    toAdd: [...selected].filter((id) => !current.has(id)),
    toRemove: [...current].filter((id) => !selected.has(id)),
  };
}
