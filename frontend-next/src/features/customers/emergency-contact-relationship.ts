export const EMERGENCY_CONTACT_RELATIONSHIP_OPTIONS = [
  'Padre / Madre',
  'Hermano(a)',
  'Hijo(a)',
  'Tío(a)',
  'Abuelo(a)',
  'Sobrino(a)',
  'Pareja / Cónyuge',
  'Otro',
] as const;

export const EMERGENCY_CONTACT_RELATIONSHIP_OTHER = 'Otro';

export type EmergencyContactRelationshipOption =
  | (typeof EMERGENCY_CONTACT_RELATIONSHIP_OPTIONS)[number]
  | '';

export type EmergencyContactRelationshipFormValue = {
  option: EmergencyContactRelationshipOption;
  customValue: string;
};

export function getEmergencyContactRelationshipFormValue(
  relationship: string | null | undefined,
): EmergencyContactRelationshipFormValue {
  if (!relationship) {
    return { option: '', customValue: '' };
  }

  if (
    EMERGENCY_CONTACT_RELATIONSHIP_OPTIONS.includes(
      relationship as (typeof EMERGENCY_CONTACT_RELATIONSHIP_OPTIONS)[number],
    )
  ) {
    return { option: relationship as EmergencyContactRelationshipOption, customValue: '' };
  }

  return { option: EMERGENCY_CONTACT_RELATIONSHIP_OTHER, customValue: relationship };
}

export function resolveEmergencyContactRelationship(
  value: EmergencyContactRelationshipFormValue,
): string | null {
  if (!value.option) {
    return null;
  }

  if (value.option === EMERGENCY_CONTACT_RELATIONSHIP_OTHER) {
    return value.customValue.trim() || null;
  }

  return value.option;
}
