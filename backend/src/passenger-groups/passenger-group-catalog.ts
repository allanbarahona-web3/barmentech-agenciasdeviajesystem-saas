export const PASSENGER_GROUPABLE_SERVICE_CODES: ReadonlySet<string> = new Set([
  "LODGING",
  "FLIGHT_TICKET",
  "TRANSPORTATION",
  "TOUR",
  "EVENT_TICKET",
  "SEAT_SELECTION",
  "BAGGAGE",
  "INSURANCE",
] as const);

export function isPassengerGroupableServiceCode(code: string): boolean {
  return PASSENGER_GROUPABLE_SERVICE_CODES.has(code);
}
