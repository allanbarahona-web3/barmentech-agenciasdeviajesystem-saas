export interface TechnicalAdditionalServiceCatalogItem {
  code: string;
  name: string;
  displayOrder: number;
}

export const TECHNICAL_ADDITIONAL_SERVICE_CATALOG: readonly TechnicalAdditionalServiceCatalogItem[] =
  [
    { code: "BAGGAGE", name: "Equipaje", displayOrder: 1 },
    { code: "LODGING", name: "Hospedaje", displayOrder: 2 },
    {
      code: "ACCOMMODATION_TYPE",
      name: "Acomodación",
      displayOrder: 3,
    },
    { code: "INSURANCE", name: "Seguro", displayOrder: 4 },
    { code: "TRANSPORTATION", name: "Transporte", displayOrder: 5 },
    { code: "TOUR", name: "Tours", displayOrder: 6 },
    { code: "FLIGHT_TICKET", name: "Boletos", displayOrder: 7 },
    {
      code: "EVENT_TICKET",
      name: "Boletos para eventos",
      displayOrder: 8,
    },
    {
      code: "SEAT_SELECTION",
      name: "Selección de asiento",
      displayOrder: 9,
    },
    {
      code: "TRAVEL_EXTENSION",
      name: "Extender viaje",
      displayOrder: 10,
    },
    {
      code: "TRIP_REDUCTION",
      name: "Acortar viaje",
      displayOrder: 11,
    },
    {
      code: "VISA_ASSISTANCE",
      name: "Visa Assistance",
      displayOrder: 12,
    },
  ];
