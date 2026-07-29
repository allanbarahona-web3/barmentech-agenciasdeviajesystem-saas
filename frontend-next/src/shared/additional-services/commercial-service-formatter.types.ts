export interface CommercialServiceFormatterInput {
  serviceCode: string;
  serviceDetailsVersion: number | null;
  serviceDetails: unknown | null;
}

export interface CommercialServiceAttribute {
  key: string;
  label: string;
  value: string;
}

export type CommercialServiceDescriptionStatus =
  | 'formatted'
  | 'missing-details'
  | 'unsupported-version'
  | 'unsupported-service'
  | 'invalid-details';

export interface CommercialServiceDescription {
  status: CommercialServiceDescriptionStatus;
  serviceCode: string;
  serviceLabel: string;
  summary: string;
  attributes: readonly CommercialServiceAttribute[];
}
