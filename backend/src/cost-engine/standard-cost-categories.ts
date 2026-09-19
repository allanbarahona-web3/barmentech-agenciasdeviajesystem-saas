/** Cost Engine-owned standard taxonomy; deliberately independent of Additional Services. */
export const STANDARD_COST_CATEGORIES = [
  { code: "AIRFARE", displayName: "Airfare" },
  { code: "BAGGAGE", displayName: "Baggage" },
  { code: "LODGING", displayName: "Lodging" },
  { code: "TRANSPORTATION", displayName: "Transportation" },
  { code: "TOUR", displayName: "Tour" },
  { code: "INSURANCE", displayName: "Insurance" },
  { code: "EVENT_TICKET", displayName: "Event Ticket" },
  { code: "VISA_ASSISTANCE", displayName: "Visa Assistance" },
  { code: "MEALS", displayName: "Meals" },
  { code: "OTHER", displayName: "Other" },
] as const;
