export type CustomerRequestErrorPresentation = {
  title: string;
  message: string;
  guidance?: string;
};

const DUPLICATE_IDENTIFICATION_TITLE = 'Número de identificación ya registrado';
const DUPLICATE_IDENTIFICATION_GUIDANCE = 'Verifique el número ingresado o utilice el cliente existente.';

export function getDuplicateIdentificationErrorPresentation(
  error: unknown,
): CustomerRequestErrorPresentation | null {
  const rawMessage = error instanceof Error ? error.message : String(error ?? '');
  let statusCode: unknown;
  let message = rawMessage;
  let conflictType: unknown;

  try {
    const payload = JSON.parse(rawMessage) as {
      statusCode?: unknown;
      message?: unknown;
      error?: unknown;
    };
    statusCode = payload.statusCode;
    conflictType = payload.error;
    if (typeof payload.message === 'string') {
      message = payload.message;
    }
  } catch {
    // Non-JSON errors keep their existing handling.
  }

  const isDuplicateIdentificationConflict =
    (statusCode === 409 || conflictType === 'Conflict') &&
    /identificaci[oó]n/i.test(message);

  if (!isDuplicateIdentificationConflict) {
    return null;
  }

  const existingCustomerName = message.match(/Cliente existente:\s*["“]?([^"”.\n]+)["”]?/i)?.[1]?.trim();

  return {
    title: DUPLICATE_IDENTIFICATION_TITLE,
    message: existingCustomerName
      ? `Este número de identificación ya está asociado a: ${existingCustomerName}.`
      : 'Ya existe un cliente con este número de identificación.',
    guidance: DUPLICATE_IDENTIFICATION_GUIDANCE,
  };
}
