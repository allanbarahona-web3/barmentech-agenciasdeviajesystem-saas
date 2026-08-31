export const CLIENT_IDENTIFICATION_TYPES = [
  'CEDULA_FISICA',
  'CEDULA_JURIDICA',
  'DIMEX',
  'NITE',
  'PASAPORTE',
  'OTHER',
] as const;

export type ClientIdentificationType =
  (typeof CLIENT_IDENTIFICATION_TYPES)[number];

export const CLIENT_IDENTIFICATION_OPTIONS: ReadonlyArray<{
  value: ClientIdentificationType;
  label: string;
}> = [
  { value: 'CEDULA_FISICA', label: 'Cédula física' },
  { value: 'CEDULA_JURIDICA', label: 'Cédula jurídica' },
  { value: 'DIMEX', label: 'DIMEX' },
  { value: 'NITE', label: 'NITE' },
  { value: 'PASAPORTE', label: 'Pasaporte' },
  { value: 'OTHER', label: 'Otro' },
];

const CLIENT_IDENTIFICATION_TYPE_SET = new Set<string>(
  CLIENT_IDENTIFICATION_TYPES,
);

export function isClientIdentificationType(
  value: unknown,
): value is ClientIdentificationType {
  return (
    typeof value === 'string' && CLIENT_IDENTIFICATION_TYPE_SET.has(value)
  );
}

export function getClientIdentificationTypeLabel(value: unknown): string {
  if (isClientIdentificationType(value)) {
    return (
      CLIENT_IDENTIFICATION_OPTIONS.find((option) => option.value === value)
        ?.label ?? value
    );
  }
  const legacyValue = typeof value === 'string' ? value.trim() : '';
  return legacyValue
    ? `${legacyValue} (tipo heredado)`
    : 'Sin tipo de identificación';
}
