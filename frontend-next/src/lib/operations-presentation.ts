const roleLabels: Record<string, string> = {
  HOLDER: 'Titular',
  COMPANION: 'Acompañante',
  MINOR: 'Menor',
  TRAVELER: 'Pasajero',
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Preparando',
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En gestión',
  RESERVED: 'Reservado',
  PURCHASED: 'Comprado',
  CONFIRMED: 'Confirmado',
  FULFILLED: 'Completado',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
  REJECTED: 'Rechazado',
  NOT_APPLICABLE: 'No aplica',
};

const sourceLabels: Record<string, string> = {
  TRAVEL_PACKAGE_COST_COMPONENT: 'Contrato base',
  BASE_TRIP: 'Contrato base',
  ADDITIONAL_SERVICE_ORDER_LINE: 'Servicio adicional',
  ADDITIONAL_SERVICES: 'Servicio adicional',
  CUSTOM_QUOTATION_LINE: 'Cotización personalizada',
  CUSTOM_QUOTATION: 'Cotización personalizada',
  CONTRACT: 'Contrato',
  MANUAL: 'Manual',
};

const serviceLabels: Record<string, string> = {
  AIRFARE: 'Boleto aéreo',
  Airfare: 'Boleto aéreo',
  GENERIC: 'Servicio general',
  'Generic service': 'Servicio general',
  TRANSPORTATION: 'Transporte',
  Transportation: 'Transporte',
  LODGING: 'Hospedaje',
  Lodging: 'Hospedaje',
  TOUR_ACTIVITY: 'Tour / actividad',
  Tour: 'Tour / actividad',
};

/** Presentation-only labels: transport values remain the backend enum values. */
export function operationalPassengerRoleLabel(role: string | null | undefined) {
  return roleLabels[role ?? ''] ?? 'Pasajero';
}

export function operationalStatusLabel(status: string | null | undefined) {
  return statusLabels[status ?? ''] ?? 'Estado no disponible';
}

export function operationalSourceLabel(sourceType: string | null | undefined) {
  return sourceLabels[sourceType ?? ''] ?? 'Origen no disponible';
}

export function operationalServiceLabel(service: string | null | undefined) {
  if (!service) return 'Servicio';
  return serviceLabels[service] ?? 'Servicio';
}

export function operationalEvidenceTypeLabel(evidenceType: string | null | undefined) {
  return ({
    SUPPLIER_QUOTE: 'Cotización de proveedor',
    BOOKING_CONFIRMATION: 'Confirmación de reserva',
    TICKET: 'Boleto',
    VOUCHER: 'Voucher',
    SUPPLIER_INVOICE: 'Factura de proveedor',
    RECEIPT: 'Recibo',
    INSURANCE_CERTIFICATE: 'Certificado de seguro',
    SCREENSHOT: 'Captura',
    OTHER: 'Otro',
  } as Record<string, string>)[evidenceType ?? ''] ?? 'Otro documento';
}

export function operationalFieldLabel(label: string) {
  return label === 'Sales Order #' ? 'Orden de venta #' : label;
}
