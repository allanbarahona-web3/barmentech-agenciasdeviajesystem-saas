import { normalizeCrIdentification } from "../fiscal-billing/fiscal-issuer-identification";

export const CLIENT_IDENTIFICATION_TYPES = [
  "CEDULA_FISICA",
  "CEDULA_JURIDICA",
  "DIMEX",
  "NITE",
  "PASAPORTE",
  "OTHER",
] as const;

export type ClientIdentificationType =
  (typeof CLIENT_IDENTIFICATION_TYPES)[number];

export type ClientIdentificationErrorCode =
  | "CLIENT_IDENTIFICATION_TYPE_INVALID"
  | "CLIENT_IDENTIFICATION_NUMBER_INVALID";

export class ClientIdentificationError extends Error {
  constructor(readonly code: ClientIdentificationErrorCode) {
    super(code);
    this.name = "ClientIdentificationError";
  }
}

const IDENTIFICATION_TYPES = new Set<string>(CLIENT_IDENTIFICATION_TYPES);
const MAX_IDENTIFICATION_LENGTH = 80;

export function isClientIdentificationType(
  value: unknown,
): value is ClientIdentificationType {
  return typeof value === "string" && IDENTIFICATION_TYPES.has(value);
}

function normalizePhysicalIdentification(value: string): string | null {
  const trimmed = value.trim();
  if (!/^[0-9 -]+$/.test(trimmed)) return null;

  const digits = trimmed.replace(/[ -]/g, "");
  if (/^[1-9]\d{8}$/.test(digits)) return digits;
  if (/^0[1-9]\d{8}$/.test(digits)) return digits.slice(1);

  const groups = trimmed.split(/[ -]+/).filter(Boolean);
  if (
    groups.length !== 3 ||
    !/^(?:[1-9]|0[1-9])$/.test(groups[0]) ||
    !/^\d{1,4}$/.test(groups[1]) ||
    !/^\d{1,4}$/.test(groups[2])
  ) {
    return null;
  }

  const formatted = `${groups[0].padStart(2, "0")}${groups[1].padStart(4, "0")}${groups[2].padStart(4, "0")}`;
  return /^0[1-9]\d{8}$/.test(formatted) ? formatted.slice(1) : null;
}

export function normalizeAndValidateClientIdentification(
  idType: unknown,
  idNumber: unknown,
): { idType: ClientIdentificationType; idNumber: string } {
  const normalizedType = typeof idType === "string" ? idType.trim() : "";
  if (!isClientIdentificationType(normalizedType)) {
    throw new ClientIdentificationError("CLIENT_IDENTIFICATION_TYPE_INVALID");
  }

  const type = normalizedType as ClientIdentificationType;
  const rawNumber = typeof idNumber === "string" ? idNumber : "";
  let normalizedNumber: string | null;

  switch (type) {
    case "CEDULA_FISICA":
      normalizedNumber = normalizePhysicalIdentification(rawNumber);
      break;
    case "CEDULA_JURIDICA":
      normalizedNumber = normalizeCrIdentification("02", rawNumber);
      break;
    case "DIMEX": {
      const digits = rawNumber.replace(/\D/g, "");
      normalizedNumber = /^1\d{11}$/.test(digits) ? digits : null;
      break;
    }
    case "NITE":
      normalizedNumber = normalizeCrIdentification("04", rawNumber);
      break;
    case "PASAPORTE":
    case "OTHER": {
      const trimmed = rawNumber.trim();
      normalizedNumber = trimmed.length > 0 && trimmed.length <= MAX_IDENTIFICATION_LENGTH
        ? trimmed
        : null;
      break;
    }
  }

  if (!normalizedNumber) {
    throw new ClientIdentificationError("CLIENT_IDENTIFICATION_NUMBER_INVALID");
  }
  return { idType: type, idNumber: normalizedNumber };
}
