import { SERVICE_NAMES } from './commercial-service-labels';
import { formatCommercialServiceV1 } from './commercial-service-formatter-v1';
import type {
  CommercialServiceDescription,
  CommercialServiceFormatterInput,
} from './commercial-service-formatter.types';

function unavailable(
  input: CommercialServiceFormatterInput,
  status: CommercialServiceDescription['status'],
  summary: string,
): CommercialServiceDescription {
  return {
    status,
    serviceCode: input.serviceCode,
    serviceLabel: SERVICE_NAMES[input.serviceCode] ?? input.serviceCode,
    summary,
    attributes: [],
  };
}

export function formatCommercialService(
  input: CommercialServiceFormatterInput,
): CommercialServiceDescription {
  if (
    input.serviceDetailsVersion === null ||
    input.serviceDetails === null
  ) {
    return unavailable(input, 'missing-details', 'Detalle comercial no disponible');
  }

  if (input.serviceDetailsVersion !== 1) {
    return unavailable(
      input,
      'unsupported-version',
      'Versión de detalle no compatible',
    );
  }

  return formatCommercialServiceV1(
    input.serviceCode,
    SERVICE_NAMES[input.serviceCode] ?? input.serviceCode,
    input.serviceDetails,
  );
}
