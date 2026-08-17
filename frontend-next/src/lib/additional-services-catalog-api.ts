import { apiGet } from './api-client';

export type AdditionalServiceFiscalReadiness =
  | 'ABSENT'
  | 'INACTIVE'
  | 'READY'
  | 'INVALID';

export interface SelectableAdditionalService {
  code: string;
  name: string;
  fiscalReadiness: AdditionalServiceFiscalReadiness;
  isSellable: boolean;
  readinessCode: string | null;
}

export function getSelectableAdditionalServices(): Promise<
  SelectableAdditionalService[]
> {
  return apiGet('/additional-services/catalog/selectable');
}
